# Chart Test Project

Vite + React 19 + TypeScript проект с lightweight-charts и торговыми индикаторами.

## Технологии
- Vite 7 (rolldown)
- React 19
- TypeScript 5.9
- lightweight-charts 5.1
- socket.io-client 4.8
- pnpm (пакетный менеджер)

## Архитектура

### Структура проекта
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
│       └── GenericIndicatorSettings.tsx  # Динамический рендер настроек любого индикатора
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
├── i18n.tsx                   # i18n контекст (ru / uk / en)
├── App.tsx                    # Корневой компонент
├── App.css                    # Все стили (BEM)
└── main.tsx                   # Entry point
```

## Соглашения по коду

### CSS
- **BEM** методология: `.block__element--modifier`
- Все стили в `src/App.css` (единый файл)
- Акцентный цвет: `#2ebd85` (зелёный, PocketOption-стиль)
- Медиа-запросы: `@media (max-width: 600px)` для мобилки, `@media (min-width: 1100px)` для ПК

### i18n
- Все UI-тексты через `useI18n()` хук → `t('key')`
- При добавлении текста — добавить ключ во все 3 локали (ru, uk, en) в `src/i18n.tsx`
- Лейблы индикаторов переводятся через `INDICATOR_LABEL_DICTS` + `tLabel()` в `i18n.tsx`

### Индикаторы
- Реестр: `INDICATOR_REGISTRY` в `src/types/chart.ts`
- UI настроек генерируется автоматически через `GenericIndicatorSettings`
- Все параметры должны иметь безопасные fallback-значения (защита от undefined)
- Параметры мерджатся: `{ ...meta.defaultParams, ...savedParams }`

## Как добавить новый индикатор

### Шаг 1: Создать файл индикатора
Создайте файл `src/indicators/YourIndicator.ts`:

```typescript
import type { CandlestickData, Time, IChartApi } from 'lightweight-charts';

export const meta = {
  name: "Your Indicator Name",
  defaultParams: {
    param1: 10,
    param2: "value",
    color: "#ffffff",
    enabled: true,
  },
  paramMeta: {
    param1: { label: "Param 1", type: "number", min: 1, max: 100 },
    param2: { label: "Param 2", type: "select", options: ["value1", "value2"] },
    color:  { label: "Color",   type: "color" },
    enabled:{ label: "Enabled", type: "boolean" },
  }
};

// Типы для paramMeta.type: "number", "boolean", "color", "select", "text"

interface YourIndicatorContext {
  candleSeries: any;
  chart: IChartApi;
  params: typeof meta.defaultParams;
}

export function init(ctx: YourIndicatorContext) {
  const { candleSeries, chart, params } = ctx;

  // Создайте primitive для рисования
  // Смотрите RangeDetector.ts или OrderBlocks.ts как пример

  function update(candles: CandlestickData<Time>[]) {
    // Логика расчета и обновления индикатора
    return [];
  }

  function destroy() {
    // Очистка ресурсов (detachPrimitive, удаление серий и т.д.)
  }

  return { update, destroy };
}
```

### Шаг 2: Зарегистрировать в INDICATOR_REGISTRY
В файле `src/types/chart.ts`:

```typescript
import { meta as yourMeta, init as initYour } from '../indicators/YourIndicator';

export const INDICATOR_REGISTRY: Record<string, IndicatorRegistryEntry> = {
  // ... существующие индикаторы ...
  yourIndicator: { meta: yourMeta, init: initYour },
};
```

### Шаг 3: Добавить переводы лейблов
В `src/i18n.tsx` добавьте переводы параметров в `INDICATOR_LABEL_DICTS`:

```typescript
const INDICATOR_LABEL_DICTS: Record<Locale, Record<string, string>> = {
  ru: {
    // ... существующие ...
    "Param 1": "Параметр 1",
    "Param 2": "Параметр 2",
    "Color": "Цвет",
    "Enabled": "Включено",
  },
  // аналогично для uk и en
};
```

**Готово!** Никаких других файлов менять не нужно:
- `GenericIndicatorSettings` автоматически отрисует UI по `paramMeta`
- `ChartSettingsModal` покажет индикатор в списке
- `Chart.tsx` подхватит `init()` из реестра

## Запуск

```bash
pnpm install
pnpm run dev
```

Проект доступен по адресу: http://localhost:5175

## Переменные окружения

```env
VITE_API_URL=https://api.po-terminal.com/api
VITE_SOCKET_URL=wss://api.po-terminal.com
VITE_IS_DEV_MODE=false   # true = пропуск авторизации + заглушка профиля
```

## Особенности

- **До 20 графиков**: 15 пресетов раскладок (4 мобильных + 11 десктопных)
- **Независимые настройки**: У каждого графика свои индикаторы и параметры
- **Автосохранение**: localStorage + серверный API (дуальная персистенция)
- **i18n**: 3 языка (ru, uk, en) через React Context
- **Авторизация**: Bearer JWT из Telegram WebApp
- **Адаптивный дизайн**: мобилка (bottom-sheet модалки), ПК (центрированные модалки)
- **Типизация**: Полная поддержка TypeScript
