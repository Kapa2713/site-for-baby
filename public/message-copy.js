const originalShowMessage = showMessage;

showMessage = function showShortMessage(text, type) {
  if (type === 'success') {
    originalShowMessage('Прогноз принят.', type);
    return;
  }

  originalShowMessage(text, type);
};
