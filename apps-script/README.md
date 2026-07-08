# Google Apps Script

## Настройка

1. Создай Google Таблицу.
2. Открой `Extensions -> Apps Script`.
3. Вставь код из `Code.gs`.
4. В Apps Script открой `Project Settings -> Script Properties`.
5. Добавь свойства:

```text
SPREADSHEET_ID = id Google Таблицы
EVENT_CODE = короткий код события для гостей
```

ID берется из URL таблицы:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

`EVENT_CODE` — это не Google-секрет и не сервисный ключ. Это простой код вечеринки, который гости вводят перед отправкой прогноза.

6. Запусти функцию:

```text
setupSpreadsheet
```

Она создаст листы и стартовые настройки.

## Публикация Web App

В Apps Script:

```text
Deploy -> New deployment -> Web app
```

Рекомендуемые настройки для MVP:

```text
Execute as: Me
Who has access: Anyone
```

После публикации скопируй Web App URL и вставь его в `APPS_SCRIPT_URL` в `public/config.js`.

## Важное ограничение

Не публикуй саму Google Таблицу для гостей. Гости должны работать только через сайт и Apps Script.

