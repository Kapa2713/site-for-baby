const CONFIG = window.SITE_FOR_BABY_CONFIG || {};
const APPS_SCRIPT_URL = String(CONFIG.APPS_SCRIPT_URL || '').trim();
const LOCAL_STORAGE_KEY = 'site-for-baby-demo-state';
const SEED_AMOUNT = 1000;

const elements = {
  form: document.querySelector('#prediction-form'),
  oddsPanel: document.querySelector('#odds-panel'),
  genderInputs: document.querySelectorAll('input[name="gender"]'),
  firstName: document.querySelector('#first-name'),
  lastName: document.querySelector('#last-name'),
  eventCode: document.querySelector('#event-code'),
  amount: document.querySelector('#amount'),
  submitButton: document.querySelector('#submit-button'),
  message: document.querySelector('#form-message'),
  bettingStatus: document.querySelector('#betting-status'),
  boyOdds: document.querySelector('#boy-odds'),
  girlOdds: document.querySelector('#girl-odds'),
  boyVotes: document.querySelector('#boy-votes'),
  girlVotes: document.querySelector('#girl-votes'),
};

let latestState = null;
let hasRenderedState = false;

init();

function init() {
  if (!elements.form) {
    return;
  }

  elements.form.addEventListener('submit', handleSubmit);
  elements.genderInputs.forEach((input) => input.addEventListener('change', handleGenderChange));
  updateGenderState('');
  refreshState();
}

async function refreshState() {
  try {
    const state = await apiGetState();
    renderState(state);
  } catch (error) {
    showMessage(error.message || 'Не удалось загрузить коэффициенты', 'error');
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  clearMessage();

  const payload = getFormPayload();
  const validationError = validatePayload(payload);

  if (validationError) {
    showMessage(validationError, 'error');
    return;
  }

  setLoading(true);

  try {
    const response = await apiSubmitPrediction(payload);

    renderState(response);
    elements.form.reset();
    updateGenderState('');
    showMessage('Прогноз принят.', 'success');
  } catch (error) {
    showMessage(error.message || 'Не удалось сохранить прогноз', 'error');
  } finally {
    setLoading(false);
  }
}

function getFormPayload() {
  const formData = new FormData(elements.form);

  return {
    action: 'submitPrediction',
    firstName: String(formData.get('firstName') || '').trim(),
    lastName: String(formData.get('lastName') || '').trim(),
    eventCode: String(formData.get('eventCode') || '').trim(),
    gender: String(formData.get('gender') || '').trim(),
    amount: Number(formData.get('amount')),
  };
}

function handleGenderChange(event) {
  updateGenderState(event.target.value);
}

function validatePayload(payload) {
  if (!payload.firstName) {
    return 'Введите имя';
  }

  if (!payload.lastName) {
    return 'Введите фамилию';
  }

  if (payload.firstName.length > 40 || payload.lastName.length > 40) {
    return 'Имя и фамилия должны быть короче 40 символов';
  }

  if (!payload.eventCode) {
    return 'Введите код события';
  }

  if (payload.eventCode.length > 24) {
    return 'Код события должен быть короче 24 символов';
  }

  if (payload.gender !== 'boy' && payload.gender !== 'girl') {
    return 'Выберите мальчика или девочку';
  }

  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return 'Введите сумму от 100';
  }

  if (payload.amount < 100) {
    return 'Минимальная виртуальная сумма — 100';
  }

  if (payload.amount > 1000000) {
    return 'Сумма слишком большая для виртуального прогноза';
  }

  return '';
}

async function apiGetState() {
  if (!APPS_SCRIPT_URL) {
    return getLocalState();
  }

  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', 'getState');

  const response = await fetch(url.toString());
  return parseApiResponse(response);
}

async function apiSubmitPrediction(payload) {
  if (!APPS_SCRIPT_URL) {
    return submitLocalPrediction(payload);
  }

  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse(response);
}

async function parseApiResponse(response) {
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Запрос не выполнен');
  }

  return data;
}

function getLocalState() {
  const savedState = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || 'null');
  const totals = savedState && savedState.totals ? savedState.totals : { boy: 0, girl: 0 };
  const counts = savedState && savedState.counts ? savedState.counts : { boy: 0, girl: 0 };

  return {
    ok: true,
    bettingOpen: true,
    totals,
    counts,
    odds: calculateOdds(totals.boy, totals.girl, SEED_AMOUNT),
  };
}

function submitLocalPrediction(payload) {
  const state = getLocalState();
  const oddsAtBet = state.odds[payload.gender];
  const totals = {
    ...state.totals,
    [payload.gender]: state.totals[payload.gender] + payload.amount,
  };
  const counts = {
    ...state.counts,
    [payload.gender]: state.counts[payload.gender] + 1,
  };
  const nextState = {
    ok: true,
    bettingOpen: true,
    totals,
    counts,
    odds: calculateOdds(totals.boy, totals.girl, SEED_AMOUNT),
    prediction: {
      gender: payload.gender,
      amount: payload.amount,
      oddsAtBet,
    },
  };

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ totals, counts }));
  return nextState;
}

function calculateOdds(boyTotal, girlTotal, seed) {
  const boyScore = boyTotal + seed;
  const girlScore = girlTotal + seed;
  const totalScore = boyScore + girlScore;

  return {
    boy: roundOdds(totalScore / boyScore),
    girl: roundOdds(totalScore / girlScore),
  };
}

function roundOdds(value) {
  return Math.round(value * 100) / 100;
}

function renderState(state) {
  latestState = state;
  const counts = getCountsFromState(state);

  setElementText(elements.boyOdds, formatOdds(state.odds.boy));
  setElementText(elements.girlOdds, formatOdds(state.odds.girl));
  setElementText(elements.boyVotes, formatVoteCount(counts.boy));
  setElementText(elements.girlVotes, formatVoteCount(counts.girl));
  setElementText(elements.bettingStatus, state.bettingOpen ? 'прием открыт' : 'прием закрыт');

  if (elements.bettingStatus) {
    elements.bettingStatus.classList.toggle('is-closed', !state.bettingOpen);
  }

  if (elements.submitButton) {
    elements.submitButton.disabled = !state.bettingOpen;
  }

  if (hasRenderedState) {
    flashOddsPanel();
  }

  hasRenderedState = true;
}

function getCountsFromState(state) {
  const counts = state.counts || state.votes || null;

  if (!counts) {
    return { boy: null, girl: null };
  }

  return {
    boy: normalizeCount(counts.boy),
    girl: normalizeCount(counts.girl),
  };
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function updateGenderState(gender) {
  document.body.classList.toggle('state-boy', gender === 'boy');
  document.body.classList.toggle('state-girl', gender === 'girl');
  document.body.classList.toggle('state-neutral', gender !== 'boy' && gender !== 'girl');
}

function flashOddsPanel() {
  if (!elements.oddsPanel) {
    return;
  }

  elements.oddsPanel.classList.remove('is-updated');
  void elements.oddsPanel.offsetWidth;
  elements.oddsPanel.classList.add('is-updated');
}

function formatOdds(value) {
  return Number(value).toFixed(2);
}

function formatVoteCount(value) {
  if (value === null) {
    return '—';
  }

  const count = Math.trunc(value);
  return `${formatAmount(count)} ${getVoteWord(count)}`;
}

function getVoteWord(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return 'голосов';
  }

  if (lastDigit === 1) {
    return 'голос';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'голоса';
  }

  return 'голосов';
}

function formatAmount(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function setLoading(isLoading) {
  if (!elements.submitButton) {
    return;
  }

  elements.submitButton.disabled = isLoading || latestState?.bettingOpen === false;
  elements.submitButton.textContent = isLoading ? 'Сохраняем...' : 'Подтвердить прогноз';
}

function showMessage(text, type) {
  setElementText(elements.message, text);

  if (!elements.message) {
    return;
  }

  elements.message.classList.toggle('is-error', type === 'error');
  elements.message.classList.toggle('is-success', type === 'success');
}

function clearMessage() {
  showMessage('', '');
}

function setElementText(element, text) {
  if (element) {
    element.textContent = text;
  }
}
