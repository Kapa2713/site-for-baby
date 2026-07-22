const SHEETS = {
  PARTICIPANTS: 'Participants',
  PREDICTIONS: 'Predictions',
  TOP_UPS: 'Top Ups',
  SETTINGS: 'Settings',
  RESULTS: 'Results',
};

const HEADERS = {
  [SHEETS.PARTICIPANTS]: ['participant_id', 'first_name', 'last_name', 'created_at'],
  [SHEETS.PREDICTIONS]: [
    'prediction_id',
    'participant_id',
    'first_name',
    'last_name',
    'gender',
    'amount',
    'odds_at_bet',
    'created_at',
    'source',
    'final_odds',
    'gross_payout',
    'net_result',
    'settlement_status',
    'settled_at',
  ],
  [SHEETS.TOP_UPS]: [
    'top_up_id',
    'participant_id',
    'first_name',
    'last_name',
    'amount',
    'created_at',
    'comment',
  ],
  [SHEETS.SETTINGS]: ['key', 'value'],
  [SHEETS.RESULTS]: [
    'participant_id',
    'first_name',
    'last_name',
    'total_staked',
    'winning_stake',
    'final_odds',
    'gross_payout',
    'net_result',
    'status',
  ],
};

function setupSpreadsheet() {
  const spreadsheet = getSpreadsheet_();

  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = getOrCreateSheet_(spreadsheet, sheetName);
    ensureHeaders_(sheet, HEADERS[sheetName]);
  });

  ensureSetting_('betting_open', 'true');
  ensureSetting_('seed_amount', '1000');
  ensureSetting_('commission_percent', '10');
  ensureSetting_('result_gender', '');
  ensureSetting_('settlement_status', 'open');
  ensureSetting_('settlement_calculated_at', '');
  ensureSetting_('total_pool', '0');
  ensureSetting_('winner_pool', '0');
  ensureSetting_('prize_pool', '0');
  ensureSetting_('organizer_commission', '0');
  ensureSetting_('final_odds', '');
}

function doGet(event) {
  try {
    setupSpreadsheet();
    const action = event && event.parameter && event.parameter.action;

    if (!action || action === 'getState') {
      return json_({
        ok: true,
        ...getPublicState_(),
      });
    }

    return json_({ ok: false, error: 'Неизвестное действие' });
  } catch (error) {
    return json_({ ok: false, error: 'Не удалось получить данные' });
  }
}

function doPost(event) {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(10000);
    lockAcquired = true;
    setupSpreadsheet();

    const payload = parsePayload_(event);

    if (payload.action !== 'submitPrediction') {
      throw publicError_('Неизвестное действие');
    }

    const result = submitPrediction_(payload);
    return json_({
      ok: true,
      message: 'Прогноз принят',
      ...result,
    });
  } catch (error) {
    return json_({
      ok: false,
      error: getPublicErrorMessage_(error),
    });
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function submitPrediction_(payload) {
  const bettingOpen = getSetting_('betting_open', 'true') === 'true';

  if (!bettingOpen) {
    throw publicError_('Прием прогнозов закрыт');
  }

  const data = validatePrediction_(payload);
  validateEventCode_(data.eventCode);

  const now = new Date();
  const spreadsheet = getSpreadsheet_();
  const participantsSheet = spreadsheet.getSheetByName(SHEETS.PARTICIPANTS);
  const predictionsSheet = spreadsheet.getSheetByName(SHEETS.PREDICTIONS);
  const currentStats = getPredictionStats_();
  const commissionPercent = getCommissionPercent_();

  const nextTotals = {
    boy: currentStats.totals.boy + (data.gender === 'boy' ? data.amount : 0),
    girl: currentStats.totals.girl + (data.gender === 'girl' ? data.amount : 0),
  };

  const oddsAfterBet = calculatePoolOdds_(
    nextTotals.boy,
    nextTotals.girl,
    commissionPercent
  );
  const oddsAtBet = oddsAfterBet[data.gender];
  const participantId = findOrCreateParticipant_(
    participantsSheet,
    data.firstName,
    data.lastName,
    now
  );
  const predictionId = Utilities.getUuid();

  predictionsSheet.appendRow([
    predictionId,
    participantId,
    data.firstName,
    data.lastName,
    data.gender,
    data.amount,
    oddsAtBet,
    now,
    'site',
    '',
    '',
    '',
    '',
    '',
  ]);

  return {
    prediction: {
      gender: data.gender,
      amount: data.amount,
      oddsAtBet,
    },
    ...getPublicState_(),
  };
}

function getPublicState_() {
  const predictionStats = getPredictionStats_();
  const commissionPercent = getCommissionPercent_();
  const odds = calculatePoolOdds_(
    predictionStats.totals.boy,
    predictionStats.totals.girl,
    commissionPercent
  );

  return {
    bettingOpen: getSetting_('betting_open', 'true') === 'true',
    odds,
    totals: predictionStats.totals,
    counts: predictionStats.counts,
    commissionPercent,
  };
}

function calculatePoolOdds_(boyTotal, girlTotal, commissionPercent) {
  const metrics = calculatePoolMetrics_(boyTotal, girlTotal, commissionPercent);

  if (metrics.totalPool <= 0) {
    return {
      boy: 2,
      girl: 2,
    };
  }

  return {
    boy: boyTotal > 0 ? roundOdds_(metrics.prizePool / boyTotal) : null,
    girl: girlTotal > 0 ? roundOdds_(metrics.prizePool / girlTotal) : null,
  };
}

function calculatePoolMetrics_(boyTotal, girlTotal, commissionPercent) {
  const totalPool = roundMoney_(boyTotal + girlTotal);
  const commissionRate = commissionPercent / 100;
  const prizePool = roundMoney_(totalPool * (1 - commissionRate));
  const organizerCommission = roundMoney_(totalPool - prizePool);

  return {
    totalPool,
    prizePool,
    organizerCommission,
  };
}

function roundOdds_(value) {
  return Math.round(value * 100) / 100;
}

function roundMoney_(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function getPredictionStats_() {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.PREDICTIONS);
  const lastRow = sheet.getLastRow();
  const stats = {
    totals: { boy: 0, girl: 0 },
    counts: { boy: 0, girl: 0 },
  };

  if (lastRow < 2) {
    return stats;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS[SHEETS.PREDICTIONS].length).getValues();

  rows.forEach((row) => {
    const gender = row[4];
    const amount = Number(row[5]);

    if (gender !== 'boy' && gender !== 'girl') {
      return;
    }

    stats.counts[gender] += 1;

    if (Number.isFinite(amount)) {
      stats.totals[gender] = roundMoney_(stats.totals[gender] + amount);
    }
  });

  return stats;
}

function calculateSettlement() {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(10000);
    lockAcquired = true;
    setupSpreadsheet();

    if (getSetting_('betting_open', 'true') === 'true') {
      throw new Error('Сначала закройте прием прогнозов: betting_open = false');
    }

    if (getSetting_('settlement_status', 'open') === 'calculated') {
      throw new Error('Итог уже рассчитан. Для повторного расчета сначала запустите resetSettlement().');
    }

    const resultGender = String(getSetting_('result_gender', '') || '').trim();

    if (resultGender !== 'boy' && resultGender !== 'girl') {
      throw new Error('В Settings укажите result_gender: boy или girl');
    }

    const spreadsheet = getSpreadsheet_();
    const predictionsSheet = spreadsheet.getSheetByName(SHEETS.PREDICTIONS);
    const resultsSheet = spreadsheet.getSheetByName(SHEETS.RESULTS);
    const lastRow = predictionsSheet.getLastRow();
    const commissionPercent = getCommissionPercent_();
    const stats = getPredictionStats_();
    const totalPool = roundMoney_(stats.totals.boy + stats.totals.girl);
    const winnerPool = roundMoney_(stats.totals[resultGender]);

    let prizePool = 0;
    let organizerCommission = totalPool;
    let finalOdds = 0;

    if (winnerPool > 0) {
      const metrics = calculatePoolMetrics_(
        stats.totals.boy,
        stats.totals.girl,
        commissionPercent
      );
      prizePool = metrics.prizePool;
      organizerCommission = metrics.organizerCommission;
      finalOdds = prizePool / winnerPool;
    }

    const rows = lastRow >= 2
      ? predictionsSheet
        .getRange(2, 1, lastRow - 1, HEADERS[SHEETS.PREDICTIONS].length)
        .getValues()
      : [];

    const payoutByRow = calculateRoundedPayouts_(
      rows,
      resultGender,
      winnerPool,
      prizePool
    );
    const settledAt = new Date();
    const participantResults = {};
    const settlementColumns = [];

    rows.forEach((row, index) => {
      const participantId = String(row[1] || '').trim();
      const firstName = String(row[2] || '').trim();
      const lastName = String(row[3] || '').trim();
      const gender = String(row[4] || '').trim();
      const amount = Number(row[5]);
      const validAmount = Number.isFinite(amount) ? roundMoney_(amount) : 0;
      const isWinner = winnerPool > 0 && gender === resultGender;
      const payout = payoutByRow[index] || 0;
      const netResult = roundMoney_(payout - validAmount);
      const status = isWinner ? 'won' : 'lost';

      settlementColumns.push([
        isWinner ? roundOdds_(finalOdds) : 0,
        payout,
        netResult,
        status,
        settledAt,
      ]);

      if (!participantId) {
        return;
      }

      if (!participantResults[participantId]) {
        participantResults[participantId] = {
          participantId,
          firstName,
          lastName,
          totalStaked: 0,
          winningStake: 0,
          grossPayout: 0,
        };
      }

      const participant = participantResults[participantId];
      participant.totalStaked = roundMoney_(participant.totalStaked + validAmount);
      participant.grossPayout = roundMoney_(participant.grossPayout + payout);

      if (isWinner) {
        participant.winningStake = roundMoney_(participant.winningStake + validAmount);
      }
    });

    if (settlementColumns.length > 0) {
      predictionsSheet
        .getRange(2, 10, settlementColumns.length, settlementColumns[0].length)
        .setValues(settlementColumns);
    }

    clearDataRows_(resultsSheet);

    const resultRows = Object.keys(participantResults)
      .map((participantId) => {
        const participant = participantResults[participantId];
        const netResult = roundMoney_(
          participant.grossPayout - participant.totalStaked
        );
        const status = participant.winningStake > 0 ? 'won' : 'lost';

        return [
          participant.participantId,
          participant.firstName,
          participant.lastName,
          participant.totalStaked,
          participant.winningStake,
          participant.winningStake > 0 ? roundOdds_(finalOdds) : 0,
          participant.grossPayout,
          netResult,
          status,
        ];
      })
      .sort((left, right) => right[7] - left[7]);

    if (resultRows.length > 0) {
      resultsSheet
        .getRange(2, 1, resultRows.length, HEADERS[SHEETS.RESULTS].length)
        .setValues(resultRows);
    }

    setSetting_('total_pool', totalPool);
    setSetting_('winner_pool', winnerPool);
    setSetting_('prize_pool', prizePool);
    setSetting_('organizer_commission', organizerCommission);
    setSetting_('final_odds', winnerPool > 0 ? roundOdds_(finalOdds) : 0);
    setSetting_('settlement_calculated_at', settledAt);
    setSetting_('settlement_status', 'calculated');

    return {
      resultGender,
      commissionPercent,
      totalPool,
      winnerPool,
      prizePool,
      organizerCommission,
      finalOdds: winnerPool > 0 ? roundOdds_(finalOdds) : 0,
      participants: resultRows.length,
    };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function calculateRoundedPayouts_(rows, resultGender, winnerPool, prizePool) {
  const payouts = rows.map(() => 0);

  if (winnerPool <= 0 || prizePool <= 0) {
    return payouts;
  }

  const winningIndexes = [];
  let roundedTotal = 0;

  rows.forEach((row, index) => {
    const gender = String(row[4] || '').trim();
    const amount = Number(row[5]);

    if (gender !== resultGender || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const payout = roundMoney_((amount / winnerPool) * prizePool);
    payouts[index] = payout;
    roundedTotal = roundMoney_(roundedTotal + payout);
    winningIndexes.push(index);
  });

  if (winningIndexes.length > 0) {
    const lastWinningIndex = winningIndexes[winningIndexes.length - 1];
    const roundingDifference = roundMoney_(prizePool - roundedTotal);
    payouts[lastWinningIndex] = roundMoney_(
      payouts[lastWinningIndex] + roundingDifference
    );
  }

  return payouts;
}

function resetSettlement() {
  const lock = LockService.getScriptLock();
  let lockAcquired = false;

  try {
    lock.waitLock(10000);
    lockAcquired = true;
    setupSpreadsheet();

    const spreadsheet = getSpreadsheet_();
    const predictionsSheet = spreadsheet.getSheetByName(SHEETS.PREDICTIONS);
    const resultsSheet = spreadsheet.getSheetByName(SHEETS.RESULTS);
    const lastRow = predictionsSheet.getLastRow();

    if (lastRow >= 2) {
      predictionsSheet.getRange(2, 10, lastRow - 1, 5).clearContent();
    }

    clearDataRows_(resultsSheet);
    setSetting_('result_gender', '');
    setSetting_('settlement_status', 'closed');
    setSetting_('settlement_calculated_at', '');
    setSetting_('total_pool', '0');
    setSetting_('winner_pool', '0');
    setSetting_('prize_pool', '0');
    setSetting_('organizer_commission', '0');
    setSetting_('final_odds', '');

    return { ok: true };
  } finally {
    if (lockAcquired) {
      lock.releaseLock();
    }
  }
}

function clearDataRows_(sheet) {
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, sheet.getMaxColumns()).clearContent();
  }
}

function getCommissionPercent_() {
  const commissionPercent = Number(getSetting_('commission_percent', '10'));

  if (
    !Number.isFinite(commissionPercent) ||
    commissionPercent < 0 ||
    commissionPercent >= 100
  ) {
    throw new Error('commission_percent должен быть числом от 0 до 99.99');
  }

  return commissionPercent;
}

function validatePrediction_(payload) {
  const firstName = normalizeName_(payload.firstName);
  const lastName = normalizeName_(payload.lastName);
  const eventCode = normalizeEventCode_(payload.eventCode);
  const gender = String(payload.gender || '').trim();
  const amount = Number(payload.amount);

  if (!firstName) {
    throw publicError_('Введите имя');
  }

  if (!lastName) {
    throw publicError_('Введите фамилию');
  }

  if (firstName.length > 40 || lastName.length > 40) {
    throw publicError_('Имя и фамилия должны быть короче 40 символов');
  }

  if (!eventCode) {
    throw publicError_('Введите код события');
  }

  if (eventCode.length > 24) {
    throw publicError_('Код события должен быть короче 24 символов');
  }

  if (gender !== 'boy' && gender !== 'girl') {
    throw publicError_('Выберите мальчика или девочку');
  }

  if (!Number.isFinite(amount) || amount < 100) {
    throw publicError_('Минимальная виртуальная сумма — 100');
  }

  if (amount > 1000000) {
    throw publicError_('Сумма слишком большая для виртуального прогноза');
  }

  return {
    firstName,
    lastName,
    eventCode,
    gender,
    amount: roundMoney_(amount),
  };
}

function validateEventCode_(eventCode) {
  const expectedEventCode = normalizeEventCode_(
    PropertiesService.getScriptProperties().getProperty('EVENT_CODE')
  );

  if (!expectedEventCode) {
    throw new Error('Не задан EVENT_CODE');
  }

  if (eventCode !== expectedEventCode) {
    throw publicError_('Неверный код события');
  }
}

function normalizeName_(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeEventCode_(value) {
  return String(value || '').trim();
}

function findOrCreateParticipant_(sheet, firstName, lastName, now) {
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS[SHEETS.PARTICIPANTS].length).getValues();
    const match = rows.find((row) => row[1] === firstName && row[2] === lastName);

    if (match) {
      return match[0];
    }
  }

  const participantId = Utilities.getUuid();
  sheet.appendRow([participantId, firstName, lastName, now]);
  return participantId;
}

function parsePayload_(event) {
  if (!event || !event.postData || !event.postData.contents) {
    throw publicError_('Пустой запрос');
  }

  try {
    return JSON.parse(event.postData.contents);
  } catch (error) {
    throw publicError_('Некорректный JSON');
  }
}

function getSpreadsheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error('Не задан SPREADSHEET_ID');
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function getOrCreateSheet_(spreadsheet, sheetName) {
  return spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
}

function ensureHeaders_(sheet, headers) {
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = headers.every((header, index) => currentHeaders[index] === header);

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}

function ensureSetting_(key, value) {
  if (getSetting_(key, null) !== null) {
    return;
  }

  getSpreadsheet_().getSheetByName(SHEETS.SETTINGS).appendRow([key, value]);
}

function getSetting_(key, fallback) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.SETTINGS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return fallback;
  }

  const rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const match = rows.find((row) => row[0] === key);

  return match ? String(match[1]) : fallback;
}

function setSetting_(key, value) {
  const sheet = getSpreadsheet_().getSheetByName(SHEETS.SETTINGS);
  const lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

    for (let index = 0; index < keys.length; index += 1) {
      if (keys[index][0] === key) {
        sheet.getRange(index + 2, 2).setValue(value);
        return;
      }
    }
  }

  sheet.appendRow([key, value]);
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function publicError_(message) {
  const error = new Error(message);
  error.publicMessage = message;
  return error;
}

function getPublicErrorMessage_(error) {
  return error && error.publicMessage ? error.publicMessage : 'Не удалось сохранить прогноз';
}
