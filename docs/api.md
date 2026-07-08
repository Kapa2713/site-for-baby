# API MVP

Backend-слой — Google Apps Script Web App.

## GET state

Запрос:

```text
GET APPS_SCRIPT_URL?action=getState
```

Ответ:

```json
{
  "ok": true,
  "bettingOpen": true,
  "odds": {
    "boy": 2,
    "girl": 2
  },
  "totals": {
    "boy": 0,
    "girl": 0
  }
}
```

Публичный ответ не должен содержать список участников, прогнозов или докупок.

## POST submitPrediction

Запрос отправляется как `text/plain` с JSON внутри. Это снижает риск CORS preflight для Google Apps Script.

```json
{
  "action": "submitPrediction",
  "firstName": "Анна",
  "lastName": "Иванова",
  "gender": "girl",
  "amount": 500
}
```

Ответ:

```json
{
  "ok": true,
  "message": "Прогноз принят",
  "prediction": {
    "gender": "girl",
    "amount": 500,
    "oddsAtBet": 2
  },
  "odds": {
    "boy": 2.2,
    "girl": 1.83
  },
  "totals": {
    "boy": 0,
    "girl": 500
  }
}
```

## Ошибки

Пример:

```json
{
  "ok": false,
  "error": "Введите имя"
}
```

Ошибки не должны раскрывать stack trace, внутренние пути, токены и детали Google-инфраструктуры.

