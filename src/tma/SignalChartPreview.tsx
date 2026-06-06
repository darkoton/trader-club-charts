import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { TVChart } from '../components/TVChart';
import { CHAT_SIGNAL_ACTIVE, ONLY_GRAPH_DEFAULT_PARAMS } from '../components/onlyGraphConfig';
import { useI18n } from '../i18n';
import type { SignalChartSnapshot } from './signalChart';

type SnapshotPreviewMeta = {
  lastBarTime?: number;
  lastTickTime?: number;
};

type PreviewVisibility = 'far' | 'near' | 'visible';

type PreviewBudgetEntry = {
  id: string;
  priority: number;
  visibility: PreviewVisibility;
  setGranted: (value: boolean) => void;
};

const previewBudgetEntries = new Map<string, PreviewBudgetEntry>();
let previewBudgetSequence = 0;

function getWeakPreviewLimit(): number | null {
  if (typeof window === 'undefined') return null;

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };

  const memory = nav.deviceMemory ?? 8;
  const cores = nav.hardwareConcurrency ?? 8;
  const saveData = Boolean(nav.connection?.saveData);
  const isMobile = window.innerWidth <= 600;
  const veryWeak = saveData || memory <= 2 || cores <= 2;
  const weak = veryWeak || memory <= 4 || cores <= 4;

  if (!weak) return null;
  return isMobile || veryWeak ? 2 : 3;
}

function getVisibilityRank(value: PreviewVisibility): number {
  if (value === 'visible') return 2;
  if (value === 'near') return 1;
  return 0;
}

function recomputePreviewBudget(): void {
  const limit = getWeakPreviewLimit();
  if (limit == null) {
    for (const entry of previewBudgetEntries.values()) {
      entry.setGranted(false);
    }
    return;
  }

  const eligible = Array.from(previewBudgetEntries.values())
    .filter((entry) => entry.visibility !== 'far')
    .sort((left, right) => {
      const visibilityDiff = getVisibilityRank(right.visibility) - getVisibilityRank(left.visibility);
      if (visibilityDiff !== 0) return visibilityDiff;
      return left.priority - right.priority;
    });

  const grantedIds = new Set(eligible.slice(0, limit).map((entry) => entry.id));
  for (const entry of previewBudgetEntries.values()) {
    entry.setGranted(grantedIds.has(entry.id));
  }
}

interface SignalChartPreviewProps {
  snapshot: SignalChartSnapshot;
  onMount?: () => void;
  rootRef?: RefObject<HTMLDivElement | null>;
  priority?: number;
  hidePriceScale?: boolean;
  showAdminMeta?: boolean;
}

function formatPreviewDateTime(value: number | undefined, locale: string): string {
  if (!Number.isFinite(value)) return '—';

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format((value as number) * 1000);
}

export function SignalChartPreview({
  snapshot,
  onMount,
  rootRef,
  priority = 0,
  hidePriceScale = false,
  showAdminMeta = false,
}: SignalChartPreviewProps) {
  const { locale, t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const previewIdRef = useRef(`signal-preview-${++previewBudgetSequence}`);
  const eagerRender = priority <= 1;
  const [hasEnteredViewportZone, setHasEnteredViewportZone] = useState(eagerRender);
  const [visibility, setVisibility] = useState<PreviewVisibility>(eagerRender ? 'near' : 'far');
  const [isBudgetGranted, setIsBudgetGranted] = useState(eagerRender);
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotPreviewMeta>({
    lastTickTime: snapshot.signalTime,
  });
  const weakPreviewLimit = useMemo(() => getWeakPreviewLimit(), []);
  const signalTimeLabel = useMemo(
    () => formatPreviewDateTime(snapshot.signalTime, locale),
    [locale, snapshot.signalTime],
  );
  const lastBarLabel = useMemo(
    () => formatPreviewDateTime(snapshotMeta.lastBarTime, locale),
    [locale, snapshotMeta.lastBarTime],
  );
  const lastTickLabel = useMemo(
    () => formatPreviewDateTime(snapshotMeta.lastTickTime ?? snapshot.signalTime, locale),
    [locale, snapshot.signalTime, snapshotMeta.lastTickTime],
  );

  const rootMargin = useMemo(() => {
    if (priority === 0) return '240px 0px 520px 0px';
    if (priority === 1) return '220px 0px 420px 0px';
    return '180px 0px 300px 0px';
  }, [priority]);

  const shouldRenderChart = eagerRender || (weakPreviewLimit == null ? hasEnteredViewportZone : isBudgetGranted);

  useEffect(() => {
    setSnapshotMeta({ lastTickTime: snapshot.signalTime });
  }, [snapshot.historyBars, snapshot.pairCode, snapshot.signalTime, snapshot.timeframe]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') {
      setHasEnteredViewportZone(true);
      setVisibility('visible');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        const rootBounds = rootRef?.current?.getBoundingClientRect();
        const viewportTop = rootBounds?.top ?? 0;
        const viewportBottom = rootBounds?.bottom ?? window.innerHeight;
        const isVisible = entry.boundingClientRect.bottom > viewportTop
          && entry.boundingClientRect.top < viewportBottom;
        const nextVisibility: PreviewVisibility = isVisible
          ? 'visible'
          : entry.isIntersecting || entry.intersectionRatio > 0
            ? 'near'
            : 'far';

        setVisibility(nextVisibility);
        if (nextVisibility !== 'far') {
          setHasEnteredViewportZone(true);
        }
      },
      {
        root: rootRef?.current ?? null,
        rootMargin,
        threshold: 0.01,
      },
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [rootMargin, rootRef]);

  useEffect(() => {
    if (weakPreviewLimit == null) {
      setIsBudgetGranted(false);
      return;
    }

    const id = previewIdRef.current;
    previewBudgetEntries.set(id, {
      id,
      priority,
      visibility,
      setGranted: setIsBudgetGranted,
    });
    recomputePreviewBudget();

    return () => {
      previewBudgetEntries.delete(id);
      recomputePreviewBudget();
    };
  }, [priority, visibility, weakPreviewLimit]);

  useEffect(() => {
    if (!shouldRenderChart) return;
    onMount?.();
  }, [onMount, shouldRenderChart, snapshot.historyBars, snapshot.pairCode, snapshot.signalTime, snapshot.timeframe]);

  return (
    <div ref={hostRef} className="tma-chat-msg__chart-container">
      {showAdminMeta && (
        <div className="tma-chat-msg__chart-meta">
          <div className="tma-chat-msg__chart-meta-main">{snapshot.pairCode} · {snapshot.timeframe}</div>
          <div className="tma-chat-msg__chart-meta-grid">
            <div className="tma-chat-msg__chart-meta-item">
              <span className="tma-chat-msg__chart-meta-label">{t.tmaSignalPreviewSignalTime}</span>
              <span className="tma-chat-msg__chart-meta-value">{signalTimeLabel}</span>
            </div>
            <div className="tma-chat-msg__chart-meta-item">
              <span className="tma-chat-msg__chart-meta-label">{t.tmaSignalPreviewLastBar}</span>
              <span className="tma-chat-msg__chart-meta-value">{lastBarLabel}</span>
            </div>
            <div className="tma-chat-msg__chart-meta-item">
              <span className="tma-chat-msg__chart-meta-label">{t.tmaSignalPreviewLastTick}</span>
              <span className="tma-chat-msg__chart-meta-value">{lastTickLabel}</span>
            </div>
          </div>
        </div>
      )}
      <div className="tma-chat-msg__chart">
        {shouldRenderChart ? (
          <TVChart
            currency={snapshot.pairCode}
            timeframe={snapshot.timeframe}
            activeIndicators={CHAT_SIGNAL_ACTIVE}
            indicatorParams={ONLY_GRAPH_DEFAULT_PARAMS}
            autoScroll={snapshot.historyBars}
            locale={locale}
            fastMode={true}
            mode="snapshot"
            snapshotTime={snapshot.signalTime}
            historyBars={snapshot.historyBars}
            hideLeftToolbar={true}
            hidePriceScale={hidePriceScale}
            onSnapshotMetaChange={setSnapshotMeta}
          />
        ) : (
          <div className="tma-chat-msg__chart-placeholder">
            <div className="tma-chat-msg__chart-placeholder-title">График загрузится при прокрутке</div>
            <div className="tma-chat-msg__chart-placeholder-meta">{snapshot.pairCode} · {snapshot.timeframe}</div>
          </div>
        )}
      </div>
    </div>
  );
}