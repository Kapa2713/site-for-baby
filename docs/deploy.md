# Инструкция запуска

Эта инструкция нужна для ручного запуска MVP:

```text
GitHub Pages
→ Google Apps Script Web App
→ Google Таблица
```

Платный хостинг, платная база данных и платный домен не нужны.

## 1. Создать Google Таблицу

1. Открой Google Drive.
2. Создай новую Google Таблицу.
3. Назови ее понятно, например `Gender Party Predictions`.
4. Скопируй ID таблицы из адресной строки.

ID находится между `/d/` и `/edit`:

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

## 2. Открыть Apps Script

В Google Таблице открой:

```text
Extensions -> Apps Script
```

Откроется редактор Google Apps Script.

## 3. Вставить код backend

1. Открой файл `apps-script/Code.gs` в репозитории.
2. Скопируй весь код.
3. Вставь его в файл `Code.gs` в Apps Script.
4. Сохрани проект.

## 4. Задать Script Properties

В Apps Script открой:

```text
Project Settings -> Script Properties
```

Добавь два свойства:

```text
SPREADSHEET_ID = id твоей Google Таблицы
EVENT_CODE = короткий код события
```

`EVENT_CODE` гости будут вводить на сайте перед отправкой прогноза.

Не вставляй реальные значения `SPREADSHEET_ID` и `EVENT_CODE` в код репозитория.

## 5. Запустить setupSpreadsheet

1. В Apps Script выбери функцию `setupSpreadsheet`.
2. Нажми `Run`.
3. Google попросит разрешения.
4. Разреши доступ к таблице для своего аккаунта.

После запуска в таблице должны появиться листы:

```text
Participants
Predictions
Top Ups
Settings
```

В листе `Settings` должны быть строки:

```text
betting_open = true
seed_amount = 1000
```

## 6. Опубликовать Apps Script как Web App

В Apps Script открой:

```text
Deploy -> New deployment -> Web app
```

Выбери настройки:

```text
Execute as: Me
Who has access: Anyone
```

Нажми `Deploy`.

После публикации скопируй Web App URL. Он будет похож на:

```text
https://script.google.com/macros/s/.../exec
```

## 7. Вставить Web App URL в сайт

Открой файл:

```text
public/config.js
```

Вставь Web App URL:

```js
window.SITE_FOR_BABY_CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/.../exec',
};
```

Пока `APPS_SCRIPT_URL` пустой, сайт работает только в демо-режиме через `localStorage`. Демо-режим не пишет данные в Google Таблицу.

## 8. Включить GitHub Pages

В GitHub открой репозиторий:

```text
Kapa2713/site-for-baby
```

Перейди:

```text
Settings -> Pages
```

Выбери:

```text
Source: Deploy from a branch
Branch: main
Folder: /(root)
```

Сохрани настройки.

GitHub Pages выдаст ссылку на сайт.

## 9. Открыть сайт

Открой ссылку GitHub Pages.

Корневой `index.html` перенаправит на:

```text
public/index.html
```

Проверь:

- главная страница открывается;
- коэффициенты загружаются;
- есть поле `Код события`;
- есть ссылка на `display.html`.

## 10. Сделать тестовый прогноз

На главной странице введи:

```text
имя
фамилию
код события
вариант: мальчик или девочка
виртуальную сумму
```

Нажми `Подтвердить прогноз`.

Если все настроено правильно:

- сайт покажет сообщение `Прогноз принят`;
- коэффициенты на странице обновятся;
- в Google Таблице появится новая строка в `Predictions`;
- при первом прогнозе участник появится в `Participants`.

## 11. Проверить неверный код события

Попробуй отправить прогноз с неправильным кодом.

Ожидаемый результат:

- сайт покажет ошибку;
- строка в Google Таблицу не добавится.

## 12. Закрыть прием прогнозов

Открой лист `Settings`.

Поменяй:

```text
betting_open = false
```

После этого новые прогнозы не должны сохраняться.

Экран итогов продолжит показывать текущие коэффициенты и суммы.
