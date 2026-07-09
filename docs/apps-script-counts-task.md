# Задача для Apps Script: добавить количество голосов

Frontend уже умеет читать `counts.boy` и `counts.girl` из ответа `getState`.

Если на сайте в блоке `Количество голосов` отображается `—`, значит текущий Apps Script ещё не отдаёт `counts`.

## Что нужно добавить

В ответ `getState` нужно добавить объект:

```js
counts: {
  boy: boyCount,
  girl: girlCount,
}
```

Где:

- `boyCount` — количество строк в листе `Predictions`, где `gender === 'boy'`;
- `girlCount` — количество строк в листе `Predictions`, где `gender === 'girl'`.

Это именно количество прогнозов, а не сумма виртуальных ставок.

## Важное ограничение

Не нужно возвращать публично:

- список гостей;
- имена гостей;
- фамилии гостей;
- полный список прогнозов;
- служебные настройки;
- `SPREADSHEET_ID`;
- `EVENT_CODE`.

## Ожидаемый публичный ответ getState

Минимально frontend ожидает такой формат:

```json
{
  "ok": true,
  "bettingOpen": true,
  "odds": {
    "boy": 1.75,
    "girl": 2.33
  },
  "counts": {
    "boy": 2,
    "girl": 1
  }
}
```

`totals` можно продолжать использовать внутри Apps Script для расчёта коэффициентов. В публичном интерфейсе суммы больше не показываются.

## Логика подсчёта

Псевдологика:

```js
let boyCount = 0;
let girlCount = 0;

for (const prediction of predictions) {
  if (prediction.gender === 'boy') boyCount += 1;
  if (prediction.gender === 'girl') girlCount += 1;
}
```

Если в текущем коде уже есть проход по строкам `Predictions` для расчёта `boyTotal` и `girlTotal`, лучше считать `boyCount` и `girlCount` в этом же проходе.
