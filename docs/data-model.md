# Модель данных

Источник истины для MVP — Google Таблица.

## Participants

```text
participant_id
first_name
last_name
created_at
```

## Predictions

```text
prediction_id
participant_id
first_name
last_name
gender
amount
odds_at_bet
created_at
source
```

`gender` принимает только:

```text
boy
girl
```

## Top Ups

```text
top_up_id
participant_id
first_name
last_name
amount
created_at
comment
```

На первом MVP докупки можно добавлять вручную в Google Таблице.

## Settings

```text
key
value
```

Минимальные настройки:

```text
betting_open = true
seed_amount = 1000
```

## Коэффициенты

```text
seed = 1000
boy_score = boy_total + seed
girl_score = girl_total + seed
total_score = boy_score + girl_score
boy_odds = total_score / boy_score
girl_odds = total_score / girl_score
```

Правила:

- округлять до 2 знаков;
- фиксировать `odds_at_bet` в момент прогноза;
- после записи прогноза возвращать сайту новые коэффициенты;
- не связывать расчет с реальными выплатами.

