# Po Terminal — Trading Chart Platform

Мультичарт веб-платформа для трейдинга на базе **Vite + React 19 + TypeScript** с библиотекой **lightweight-charts** от TradingView.

## Возможности

- **До 20 графиков** на одной странице с 15 пресетами раскладок (ПК + мобилка)
- **6 торговых индикаторов** с динамическим реестром и настройками
- **Реал-тайм обновления** через Socket.IO (цены + свечи)
- **Избранные валюты** — быстрая панель с мини-спарклайнами
- **3 языка** — русский, украинский, английский
- **Авторизация** через Telegram токен (+ dev-mode)
- **Профиль пользователя** — аватарка, имя, logout
- **Автосохранение** — графики, раскладка, язык, избранное (localStorage + API)
- **BEM CSS** — единая дизайн-система в стиле PocketOption (акцент `#2ebd85`)

## Быстрый старт

```bash
# Установка зависимостей
pnpm install

# Запуск dev-сервера
pnpm run dev

# Сборка для продакшена
pnpm run build

# Проверка TypeScript
pnpm run typecheck    # или npx tsc --noEmit
```

Проект доступен по адресу: **http://localhost:5175**

## Переменные окружения

Создайте файл `.env` в корне проекта:

```env
VITE_API_URL=https://api.po-terminal.com/api
VITE_SOCKET_URL=wss://api.po-terminal.com
VITE_IS_DEV_MODE=false
```

| Переменная | Описание |
|---|---|
| `VITE_API_URL` | Базовый URL к API (с `/api` на конце) |
| `VITE_SOCKET_URL` | WebSocket URL для Socket.IO |
| `VITE_IS_DEV_MODE` | `true` — пропускает авторизацию, показывает заглушку профиля |

## Архитектура

```
src/
├── api/
│   ├── currencies.ts          # API клиент: валюты, котировки, категории
│   └── socket.ts              # Socket.IO клиент (price_update, candle_closed)
├── components/
│   ├── Chart.tsx              # Один график (lightweight-charts + индикаторы)
│   ├── ChartGrid.tsx          # Адаптивная сетка графиков
│   ├── ChartSettingsModal.tsx # Модалка индикаторов с попапом настроек
│   ├── CurrencySelectModal.tsx# Выбор валюты (категории + поиск + избранное)
│   ├── FavoritesBar.tsx       # Панель избранного со спарклайнами
│   ├── UserProfileMenu.tsx    # Дропдаун профиля (аватар, язык, logout)
│   └── indicators/
│       └── GenericIndicatorSettings.tsx  # Динамический рендер настроек
├── indicators/                # 6 торговых индикаторов
│   ├── RangeDetector.ts       # Зоны консолидации
│   ├── OrderBlocks.ts         # Ордер-блоки (BOS / пивоты)
│   ├── AdaptiveTrendFinder.ts # Адаптивные трендовые каналы
│   ├── ImbalanceSuite.ts      # FVG / OG / VI имбалансы
│   ├── RSIZones.ts            # RSI с зонами (отд. панель)
│   └── ZigZagChannels.ts      # ZigZag + каналы
├── services/
│   ├── auth.ts                # Токен-авторизация (URL → localStorage)
│   ├── apiFetch.ts            # Fetch-обёртка с Bearer токеном
│   └── storage.ts             # Персистентность (localStorage + API)
├── types/
│   └── chart.ts               # Типы, INDICATOR_REGISTRY, GRID_LAYOUTS
├── utils/
│   └── demoData.ts            # Генератор демо-свечей
├── i18n.tsx                   # i18n контекст (ru / uk / en + переводы индикаторов)
├── App.tsx                    # Корневой компонент
├── App.css                    # Все стили (BEM)
└── main.tsx                   # Entry point
```

## Индикаторы

| Индикатор | Ключ реестра | Панель | Описание |
|---|---|---|---|
| Range Detector | `rangeDetector` | основная | Зоны консолидации по ATR |
| Order Blocks | `orderBlocks` | основная | BOS → ордер-блоки (bull/bear) |
| Adaptive Trend Finder | `adaptiveTrend` | основная | Автоматические каналы тренда |
| Imbalance Suite | `imbalanceSuite` | основная | FVG, Opening Gaps, Volume Imbalances |
| RSI Zones | `rsiZones` | отдельная | RSI с зонами перекупленности / перепроданности |
| ZigZag + Channels | `zigzagChannels` | основная | ZigZag с каналами Дончиана |
| Regression Channel | `regressionChannel` | основная | Линейная регрессия с каналами отклонения |

### Как добавить новый индикатор

Подробная инструкция: [.github/copilot-instructions.md](.github/copilot-instructions.md)

Кратко:
1. Создать `src/indicators/MyIndicator.ts` с экспортами `meta` + `init()`
2. Зарегистрировать в `src/types/chart.ts` → `INDICATOR_REGISTRY`
3. Готово — `GenericIndicatorSettings` отрисует UI настроек автоматически

### Портирование PineScript индикаторов

**Вопрос:** Можно ли использовать PineScript индикаторы напрямую?  
**Ответ:** Нет, но можно портировать логику в TypeScript.

PineScript — это проприетарный язык TradingView. Для использования в проекте нужно:

1. **Портировать логику** из PineScript в TypeScript
2. **Создать кастомный индикатор** по образцу существующих
3. **Зарегистрировать** в `INDICATOR_REGISTRY`

**Пример:** Индикатор [RegressionChannel.ts](src/indicators/RegressionChannel.ts) — это портированная версия сложного PineScript индикатора с линейной регрессией, Pearson's R и алертами.

📚 **Полное руководство:** [docs/PINESCRIPT_PORTING.md](docs/PINESCRIPT_PORTING.md)

Этот гайд включает:
- Маппинг PineScript функций → TypeScript
- Работа с визуальными элементами (`plot`, `line`, `label`)
- Портирование математических расчетов
- Примеры и best practices

## API

Полная документация API: [docs/API.md](docs/API.md)

Мультиязычный контракт блога для backend update: [docs/BLOG_I18N_API.md](docs/BLOG_I18N_API.md)

Ключевые эндпоинты:
- `GET /user/me` — профиль пользователя
- `GET /user/settings` / `POST /user/settings` — сохранение настроек
- `GET /currencies` — список валют
- `GET /quotes/history` — исторические свечи
- WebSocket: `price_update`, `candle_closed`

## Стек

| Технология | Версия | Назначение |
|---|---|---|
| React | 19.2 | UI библиотека |
| TypeScript | 5.9 | Типизация |
| Vite | 7.2 (rolldown) | Сборщик |
| lightweight-charts | 5.1 | Графики TradingView |
| socket.io-client | 4.8 | WebSocket клиент |
| pnpm | — | Пакетный менеджер |

## Полезные ссылки

- [lightweight-charts документация](https://tradingview.github.io/lightweight-charts/)
- [Custom Series Primitives API](https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives)

## Деплой

Автоматический деплой на сервер при push в `main`:

```bash
# Быстрая настройка через GitHub CLI
./scripts/setup-secrets.sh
```

Полная инструкция: [docs/DEPLOY.md](docs/DEPLOY.md)

## Лицензия

MIT
