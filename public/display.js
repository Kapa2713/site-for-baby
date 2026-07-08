const DISPLAY_CONFIG = window.SITE_FOR_BABY_CONFIG || {};
const DISPLAY_APPS_SCRIPT_URL = String(DISPLAY_CONFIG.APPS_SCRIPT_URL || '').trim();
const DISPLAY_LOCAL_STORAGE_KEY = 'site-for-baby-demo-state';
const DISPLAY_SEED_AMOUNT = 1000;

const displayElements = {
  status: document.querySelector('#display-status'),
  message: document.querySelector('#display-message'),
  boyOdds: document.querySelector('#display-boy-odds'),
  girlOdds: document.querySelector('#display-girl-odds'),
  boyTotal: document.querySelector('#display-boy-total'),
  girlTotal: document.querySelector('#display-girl-total'),
};

refreshDisplay();
window.setInterval(refreshDisplay, 30000);

async function refreshDisplay() {
  try {
    const state = await getDisplayState();
    renderDisplayState(state);
    displayElements.message.textContent = '';
  } catch (error) {
    displayElements.message.textContent = error.message || 'Не удалось обновить экран итогов';
  }
}

async function getDisplayState() {
  if (!DISPLAY_APPS_SCRIPT_URL) {
    return getLocalDisplayState();
  }

  const url = new URL(DISPLAY_APPS_SCRIPT_URL);
  url.searchParams.set('action', 'getState');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error || 'Запрос не выполнен');
  }

  return data;
}

function getLocalDisplayState() {
  const savedState = JSON.parse(localStorage.getItem(DISPLAY_LOCAL_STORAGE_KEY) || 'null');
  const totals = savedState && savedState.totals ? savedState.totals : { boy: 0, girl: 0 };

  return {
    ok: true,
    bettingOpen: true,
    totals,
    odds: calculateDisplayOdds(totals.boy, totals.girl, DISPLAY_SEED_AMOUNT),
  };
}

function calculateDisplayOdds(boyTotal, girlTotal, seed) {
  const boyScore = boyTotal + seed;
  const girlScore = girlTotal + seed;
  const totalScore = boyScore + girlScore;

  return {
    boy: roundDisplayOdds(totalScore / boyScore),
    girl: roundDisplayOdds(totalScore / girlScore),
  };
}

function roundDisplayOdds(value) {
  return Math.round(value * 100) / 100;
}

function renderDisplayState(state) {
  displayElements.boyOdds.textContent = formatDisplayOdds(state.odds.boy);
  displayElements.girlOdds.textContent = formatDisplayOdds(state.odds.girl);
  displayElements.boyTotal.textContent = `${formatDisplayAmount(state.totals.boy)} виртуально`;
  displayElements.girlTotal.textContent = `${formatDisplayAmount(state.totals.girl)} виртуально`;
  displayElements.status.textContent = state.bettingOpen ? 'прием прогнозов открыт' : 'прием прогнозов закрыт';
  displayElements.status.classList.toggle('is-closed', !state.bettingOpen);
}

function formatDisplayOdds(value) {
  return Number(value).toFixed(2);
}

function formatDisplayAmount(value) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

