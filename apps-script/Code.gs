const SHEETS = {
  PARTICIPANTS: 'Participants',
  PREDICTIONS: 'Predictions',
  TOP_UPS: 'Top Ups',
  SETTINGS: 'Settings',
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
};

function setupSpreadsheet() {
  const spreadsheet = getSpreadsheet_();

  Object.keys(HEADERS).forEach((sheetName) => {
    const sheet = getOrCreateSheet_(spreadsheet, sheetName);
    ensureHeaders_(sheet, HEADERS[sheetName]);
  });

  ensureSetting_('betting_open', 'true');
  ensureSetting_('seed_amount', '1000');
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
  const currentState = getPublicState_();
  const oddsAtBet = currentState.odds[data.gender];
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
  const seed = Number(getSetting_('seed_amount', '1000')) || 1000;
  const odds = calculateOdds_(predictionStats.totals.boy, predictionStats.totals.girl, seed);

  return {
    bettingOpen: getSetting_('betting_open', 'true') === 'true',
    odds,
    totals: predictionStats.totals,
    counts: predictionStats.counts,
  };
}

function calculateOdds_(boyTotal, girlTotal, seed) {
  const boyScore = boyTotal + seed;
  const girlScore = girlTotal + seed;
  const totalScore = boyScore + girlScore;

  return {
    boy: roundOdds_(totalScore / boyScore),
    girl: roundOdds_(totalScore / girlScore),
  };
}

function roundOdds_(value) {
  return Math.round(value * 100) / 100;
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
      stats.totals[gender] += amount;
    }
  });

  return stats;
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
    amount: Math.round(amount * 100) / 100,
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
