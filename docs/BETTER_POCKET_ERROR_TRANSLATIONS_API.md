# Better Pocket Error Translations API

Документ описывает хранение, автодобавление, перевод и выдачу PocketOption/Partners/WS ошибок для админ-панели и фронтенда.

## Что решает этот контур

- Любая новая ошибка PocketOption, Partners API или Better WS автоматически сохраняется в MongoDB.
- Повторяющиеся одинаковые upstream ошибки не размножают отдельные переводные записи, а связываются с одной canonical записью.
- Админка может переводить одну canonical ошибку сразу на три языка: русский, английский и украинский.
- Фронтенд может получить публичный словарь переводов и подменять сырые upstream строки на локализованные фразы.

## Коллекции MongoDB

### Raw occurrences

Коллекция: `auth_error_audit`

Туда пишется каждый отдельный случай ошибки.

Основные поля:

- `source`
- `stage`
- `endpoint`
- `status`
- `error_message`
- `request_payload`
- `response_payload`
- `email`
- `terminal_user_id`
- `account_id`
- `po_user_id`
- `error_catalog_id`
- `error_signature`
- `extra`
- `created_at`

### Canonical error catalog

Коллекция: `pocket_error_catalog`

Это нормализованный каталог переводимых ошибок.

Основные поля:

- `signature` — стабильный hash canonical ошибки
- `source`
- `stage`
- `endpoint`
- `endpoint_path`
- `status`
- `canonical_message` — исходная строка ошибки
- `normalized_message` — нормализованная строка для группировки похожих сообщений
- `response_payload_sample` — пример ответа Pocket/Partners/WS
- `occurrences_count` — сколько раз такая ошибка уже встречалась
- `translation_ru`
- `translation_en`
- `translation_uk`
- `translation_status` — `new | partial | translated | ignored`
- `admin_note`
- `created_at`
- `updated_at`
- `first_seen_at`
- `last_seen_at`

## Автодобавление новых строк

Новые строки добавляются автоматически.

Когда Better вызывает `log_auth_error(...)`, сервис:

1. Санитизирует payload.
2. Нормализует текст ошибки и response payload.
3. Строит `signature`.
4. Делает upsert в `pocket_error_catalog`.
5. Пишет raw occurrence в `auth_error_audit` c `error_catalog_id`.

То есть ручное создание записей для новых ошибок не требуется.

## Какие ошибки сейчас попадают в каталог

### HTTP / auth / refresh / partner

Все ошибки, проходящие через `better/services/auth_audit_service.py` и `log_auth_error(...)`.

Сюда входят, в частности:

- login
- register
- confirm-2fa
- google-login
- refresh
- password-recovery
- partner token/login/refresh ошибки

### WS / runtime

В каталог также пишутся ключевые WS/runtime ошибки Better:

- `pocket_ws_connect`
- `pocket_ws_trade_open`

## Translation status

`translation_status` означает:

- `new` — переводов ещё нет
- `partial` — заполнены не все локали
- `translated` — заполнены все три локали
- `ignored` — ошибка намеренно исключена из словаря фронта

Если админ обновляет `translation_ru`, `translation_en` или `translation_uk`, backend сам пересчитывает `translation_status`, если он не передан явно.

## Admin endpoints

Все admin endpoints живут в TMA New.

### 1. Список canonical ошибок

`GET /api/admin/better/pocket-errors`

Query params:

- `source`
- `stage`
- `status`
- `translation_status`
- `search`
- `limit`
- `skip`

Пример ответа:

```json
{
  "items": [
    {
      "id": "68317b...",
      "signature": "f1c5...",
      "source": "pocket",
      "stage": "pocket_refresh",
      "endpoint": "https://partners-po.com/partner-api/user-auth/refresh",
      "endpoint_path": "/partner-api/user-auth/refresh",
      "status": 403,
      "canonical_message": "pocket_refresh failed (403): Auth failed",
      "normalized_message": "pocket_refresh failed (<num>): auth failed",
      "response_payload_sample": {
        "error": {
          "message": "Auth failed"
        }
      },
      "occurrences_count": 17,
      "translation_ru": "Сессия PocketOption недействительна. Выполните вход заново.",
      "translation_en": "PocketOption session is invalid. Please sign in again.",
      "translation_uk": "Сесію PocketOption недійсно. Увійдіть повторно.",
      "translations": {
        "ru": "Сессия PocketOption недействительна. Выполните вход заново.",
        "en": "PocketOption session is invalid. Please sign in again.",
        "uk": "Сесію PocketOption недійсно. Увійдіть повторно."
      },
      "translation_status": "translated",
      "admin_note": "Показывать как logout_required на фронте",
      "created_at": "2026-05-24T10:00:00+00:00",
      "updated_at": "2026-05-24T11:00:00+00:00",
      "first_seen_at": "2026-05-24T10:00:00+00:00",
      "last_seen_at": "2026-05-24T11:00:00+00:00"
    }
  ],
  "total": 1,
  "limit": 100,
  "skip": 0,
  "filters": {
    "source": "pocket",
    "stage": "pocket_refresh",
    "status": 403,
    "translation_status": "translated",
    "search": null
  }
}
```

### 2. Одна canonical ошибка

`GET /api/admin/better/pocket-errors/{error_id}`

Возвращает одну запись из `pocket_error_catalog`.

### 3. Raw occurrences по canonical ошибке

`GET /api/admin/better/pocket-errors/{error_id}/occurrences`

Query params:

- `limit`
- `skip`

Возвращает список записей из `auth_error_audit`, связанных через `error_catalog_id`.

### 4. Обновление переводов и заметок

`PATCH /api/admin/better/pocket-errors/{error_id}`

Body:

```json
{
  "translation_ru": "Сессия PocketOption недействительна. Выполните вход заново.",
  "translation_en": "PocketOption session is invalid. Please sign in again.",
  "translation_uk": "Сесію PocketOption недійсно. Увійдіть повторно.",
  "translation_status": "translated",
  "admin_note": "Использовать как публичный перевод для logout flow"
}
```

Все поля опциональны.

Если переданы только переводы, а `translation_status` не передан, backend сам рассчитает его:

- 0 заполненных локалей -> `new`
- 1-2 заполненные локали -> `partial`
- 3 заполненные локали -> `translated`

## Public endpoint для фронта

### Получить словарь переводов

`GET /api/public/better/pocket-errors/translations`

Alias:

`GET /public/better/pocket-errors/translations`

Endpoint публичный, admin auth не требуется.

Query params:

- `locale=ru|en|uk` — обязательная целевая локаль, по умолчанию `ru`
- `source` — опциональный фильтр
- `stage` — опциональный фильтр
- `include_untranslated=true|false` — если `true`, backend вернёт canonical текст как fallback даже без перевода

Пример:

`GET /api/public/better/pocket-errors/translations?locale=uk`

Пример ответа:

```json
{
  "locale": "uk",
  "phrases": {
    "pocket_refresh failed (403): Auth failed": "Сесію PocketOption недійсно. Увійдіть повторно.",
    "PocketOption WS auth (user.auth): Invalid token": "Токен PocketOption недійсний. Увійдіть повторно."
  },
  "items": [
    {
      "key": "pocket_refresh failed (403): Auth failed",
      "source": "pocket",
      "stage": "pocket_refresh",
      "status": 403,
      "text": "Сесію PocketOption недійсно. Увійдіть повторно.",
      "translations": {
        "ru": "Сессия PocketOption недействительна. Выполните вход заново.",
        "en": "PocketOption session is invalid. Please sign in again.",
        "uk": "Сесію PocketOption недійсно. Увійдіть повторно."
      }
    }
  ],
  "total": 2,
  "include_untranslated": false,
  "filters": {
    "source": null,
    "stage": null
  }
}
```

## Как использовать на фронте

Базовый сценарий:

1. Фронт загружает словарь для текущей локали через public endpoint.
2. Когда Better/TMA возвращает сырую upstream ошибку, фронт ищет её в `phrases` по ключу `canonical_message`.
3. Если перевод найден, фронт показывает локализованный текст.
4. Если перевода нет, фронт может показать оригинал или fallback-строку продукта.

## Важные ограничения

- Ключ словаря строится по `canonical_message`, поэтому фронт должен подменять именно ту строку, которую прислал backend.
- `ignored` ошибки не попадают в публичный словарь.
- `include_untranslated=false` по умолчанию скрывает строки без перевода из public endpoint.
- Один и тот же canonical текст может встречаться у разных `source/stage`, поэтому при необходимости фронт или админка могут дополнительно фильтровать словарь по `source` и `stage`.

## Связанные файлы

- `better/services/auth_audit_service.py`
- `better/db.py`
- `better/services/account_manager.py`
- `tma_new/api/admin/better_pocket_errors.py`
- `tma_new/api/auth/better_pocket_error_translations.py`
- `BETTER_AUTH_EVENT_API.md`
