import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Navigate } from 'react-router-dom';
import routes from '../configs/routes';
import { useI18n } from '../i18n';
import { hasPendingRegisterStep2Context } from '../pages/shared/api/terminalAuth';
import useAuth from '../pages/shared/hooks/useAuth';
import { setStoredTmaGroupInviteLink } from '../tma/api';
import { TmaApp } from '../tma/TmaApp';

export const WEBAPP_FRAME_STORAGE_KEY = 'tc_webapp_frame_state';

const DEFAULT_FRAME_SIZE = { w: 420, h: 680 };
const MIN_FRAME_WIDTH = 280;
const MIN_FRAME_HEIGHT = 640;
const MINIMIZED_FRAME_SIZE = { w: 260, h: 36 };

type FramePosition = { x: number; y: number };
type FrameSize = { w: number; h: number };
type StoredFrameState = {
  hasMountedFrame: boolean;
  minimized: boolean;
  maximized: boolean;
  open: boolean;
  pos: FramePosition;
  preMax: { x: number; y: number; w: number; h: number };
  size: FrameSize;
};

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function getViewportSize(): FrameSize {
  return {
    w: window.innerWidth,
    h: window.innerHeight,
  };
}

function clampFrameSize(size: FrameSize, viewport: FrameSize): FrameSize {
  const minHeight = Math.min(MIN_FRAME_HEIGHT, viewport.h);
  return {
    w: clamp(size.w, MIN_FRAME_WIDTH, Math.max(MIN_FRAME_WIDTH, viewport.w)),
    h: clamp(size.h, minHeight, Math.max(minHeight, viewport.h)),
  };
}

function clampFramePosition(pos: FramePosition, size: FrameSize, viewport: FrameSize): FramePosition {
  return {
    x: clamp(pos.x, 0, Math.max(0, viewport.w - size.w)),
    y: clamp(pos.y, 0, Math.max(0, viewport.h - size.h)),
  };
}

function normalizeFrame(pos: FramePosition, size: FrameSize) {
  const viewport = getViewportSize();
  const nextSize = clampFrameSize(size, viewport);
  const nextPos = clampFramePosition(pos, nextSize, viewport);

  return { pos: nextPos, size: nextSize };
}

function getInitialFrame() {
  const { size } = normalizeFrame({ x: 0, y: 0 }, DEFAULT_FRAME_SIZE);
  return {
    size,
    pos: {
      x: Math.max(0, (window.innerWidth - size.w) / 2),
      y: Math.max(0, (window.innerHeight - size.h) / 2),
    },
  };
}

function getDefaultStoredState(): StoredFrameState {
  const initialFrame = getInitialFrame();

  return {
    hasMountedFrame: false,
    minimized: false,
    maximized: false,
    open: false,
    pos: initialFrame.pos,
    preMax: { x: initialFrame.pos.x, y: initialFrame.pos.y, ...initialFrame.size },
    size: initialFrame.size,
  };
}

function readStoredFrameState(): StoredFrameState {
  if (typeof window === 'undefined') {
    return getDefaultStoredState();
  }

  try {
    const raw = localStorage.getItem(WEBAPP_FRAME_STORAGE_KEY);
    if (!raw) {
      return getDefaultStoredState();
    }

    const parsed = JSON.parse(raw) as Partial<StoredFrameState>;
    const fallback = getDefaultStoredState();
    const normalized = normalizeFrame(
      parsed.pos ?? fallback.pos,
      parsed.size ?? fallback.size,
    );
    const preMaxSize = clampFrameSize(parsed.preMax ?? fallback.preMax, getViewportSize());
    const preMaxPos = clampFramePosition(parsed.preMax ?? fallback.preMax, preMaxSize, getViewportSize());

    return {
      hasMountedFrame: Boolean(parsed.hasMountedFrame),
      minimized: Boolean(parsed.minimized),
      maximized: Boolean(parsed.maximized),
      open: Boolean(parsed.open),
      pos: normalized.pos,
      preMax: {
        x: preMaxPos.x,
        y: preMaxPos.y,
        w: preMaxSize.w,
        h: preMaxSize.h,
      },
      size: normalized.size,
    };
  } catch {
    return getDefaultStoredState();
  }
}

export function readStoredWebAppFrameVisibility(): boolean {
  return readStoredFrameState().open;
}

export interface WebAppFrameProps {
  open: boolean;
  onClose: () => void;
  title?: string;
}

export function WebAppFrame({ open, onClose, title }: WebAppFrameProps) {
  const { t } = useI18n();
  const { user, isLoading } = useAuth();
  const [storedState] = useState(() => readStoredFrameState());
  const [hasMountedFrame, setHasMountedFrame] = useState(storedState.hasMountedFrame || open);

  // Window state
  const [minimized, setMinimized] = useState(storedState.minimized);
  const [maximized, setMaximized] = useState(storedState.maximized);

  // Position & size
  const [pos, setPos] = useState(storedState.pos);
  const [size, setSize] = useState(storedState.size);
  const [initialized, setInitialized] = useState(storedState.hasMountedFrame);

  // Refs
  const frameRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const resizing = useRef<string | null>(null);
  const posRef = useRef(pos);
  const sizeRef = useRef(size);
  const dragOffset = useRef({ x: 0, y: 0 });
  const startSize = useRef({ w: 0, h: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  // Pre-maximized state
  const preMax = useRef(storedState.preMax);

  useEffect(() => {
    setStoredTmaGroupInviteLink(user?.group_invite_link);
  }, [user?.group_invite_link]);

  const applyFrameState = useCallback((nextPos: FramePosition, nextSize: FrameSize) => {
    const normalized = normalizeFrame(nextPos, nextSize);
    posRef.current = normalized.pos;
    sizeRef.current = normalized.size;
    setPos(normalized.pos);
    setSize(normalized.size);
  }, []);

  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(WEBAPP_FRAME_STORAGE_KEY, JSON.stringify({
        hasMountedFrame,
        minimized,
        maximized,
        open,
        pos,
        preMax: preMax.current,
        size,
      } satisfies StoredFrameState));
    } catch {
      // Ignore localStorage quota / private mode errors.
    }
  }, [hasMountedFrame, minimized, maximized, open, pos, size]);

  // Center on first open
  useEffect(() => {
    if (open) {
      setHasMountedFrame(true);
    }

    if (open && !initialized) {
      const initialFrame = getInitialFrame();
      posRef.current = initialFrame.pos;
      sizeRef.current = initialFrame.size;
      setPos(initialFrame.pos);
      setSize(initialFrame.size);
      setInitialized(true);
    }
  }, [open, initialized]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const syncToViewport = () => {
      if (maximized) {
        const viewport = getViewportSize();
        const nextPos = { x: 0, y: 0 };
        const nextSize = { w: viewport.w, h: viewport.h };
        posRef.current = nextPos;
        sizeRef.current = nextSize;
        setPos(nextPos);
        setSize(nextSize);
        return;
      }

      const normalized = normalizeFrame(posRef.current, sizeRef.current);
      posRef.current = normalized.pos;
      sizeRef.current = normalized.size;
      setPos((current) => (
        current.x === normalized.pos.x && current.y === normalized.pos.y
          ? current
          : normalized.pos
      ));
      setSize((current) => (
        current.w === normalized.size.w && current.h === normalized.size.h
          ? current
          : normalized.size
      ));
    };

    window.addEventListener('resize', syncToViewport);
    window.visualViewport?.addEventListener('resize', syncToViewport);

    return () => {
      window.removeEventListener('resize', syncToViewport);
      window.visualViewport?.removeEventListener('resize', syncToViewport);
    };
  }, [open, maximized]);

  // ─── Drag ───
  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (maximized) return;
    if ((e.target as HTMLElement).closest('.webapp-frame__controls')) return;
    e.preventDefault();
    dragging.current = true;
    dragOffset.current = { x: e.clientX - posRef.current.x, y: e.clientY - posRef.current.y };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore browsers that don't support pointer capture in this context.
    }

    const onMove = (ev: PointerEvent) => {
      if (!dragging.current) return;
      const renderedSize = minimized ? MINIMIZED_FRAME_SIZE : sizeRef.current;
      const viewport = getViewportSize();
      const nextPos = clampFramePosition({
        x: ev.clientX - dragOffset.current.x,
        y: ev.clientY - dragOffset.current.y,
      }, renderedSize, viewport);
      posRef.current = nextPos;
      setPos(nextPos);
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }, [maximized, minimized]);

  // ─── Resize ───
  const onResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>, edge: string) => {
    if (maximized) return;
    e.preventDefault();
    e.stopPropagation();
    resizing.current = edge;
    startSize.current = { ...sizeRef.current };
    startPos.current = { ...posRef.current };
    dragOffset.current = { x: e.clientX, y: e.clientY };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore browsers that don't support pointer capture in this context.
    }

    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return;
      const dx = ev.clientX - dragOffset.current.x;
      const dy = ev.clientY - dragOffset.current.y;
      const edge = resizing.current;

      let newW = startSize.current.w;
      let newH = startSize.current.h;
      let newX = startPos.current.x;
      let newY = startPos.current.y;

      if (edge.includes('e')) newW = Math.max(MIN_FRAME_WIDTH, startSize.current.w + dx);
      if (edge.includes('w')) { newW = Math.max(MIN_FRAME_WIDTH, startSize.current.w - dx); newX = startPos.current.x + dx; }
      if (edge.includes('s')) newH = Math.max(MIN_FRAME_HEIGHT, startSize.current.h + dy);
      if (edge.includes('n')) { newH = Math.max(MIN_FRAME_HEIGHT, startSize.current.h - dy); newY = startPos.current.y + dy; }

      applyFrameState({ x: newX, y: newY }, { w: newW, h: newH });
    };

    const onUp = () => {
      resizing.current = null;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }, [applyFrameState, maximized]);

  // ─── Maximize toggle ───
  const toggleMaximize = useCallback(() => {
    if (maximized) {
      applyFrameState(
        { x: preMax.current.x, y: preMax.current.y },
        { w: preMax.current.w, h: preMax.current.h }
      );
      setMaximized(false);
    } else {
      preMax.current = {
        x: posRef.current.x,
        y: posRef.current.y,
        w: sizeRef.current.w,
        h: sizeRef.current.h,
      };
      const viewport = getViewportSize();
      const nextPos = { x: 0, y: 0 };
      const nextSize = { w: viewport.w, h: viewport.h };
      posRef.current = nextPos;
      sizeRef.current = nextSize;
      setPos(nextPos);
      setSize(nextSize);
      setMaximized(true);
    }
  }, [applyFrameState, maximized]);

  const hasPendingStep2Context = hasPendingRegisterStep2Context();

  if (isLoading) return null;

  if ((user && !user.is_confirmed) || (!user && hasPendingStep2Context)) {
    return <Navigate to={routes.RegisterStep2} replace />;
  }

  if (!hasMountedFrame) return null;

  const displayTitle = title || t.webAppTitle;
  const hidden = !open;

  return createPortal(
    <div
      ref={frameRef}
      className={`webapp-frame${maximized ? ' webapp-frame--maximized' : ''}${minimized ? ' webapp-frame--minimized' : ''}${hidden ? ' webapp-frame--hidden' : ''}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: minimized ? MINIMIZED_FRAME_SIZE.w : size.w,
        height: minimized ? MINIMIZED_FRAME_SIZE.h : size.h,
      }}
      aria-hidden={hidden}
    >
      {/* Title bar */}
      <div className="webapp-frame__titlebar" onPointerDown={onDragStart} onDoubleClick={minimized ? () => setMinimized(false) : toggleMaximize}>
        <span className="webapp-frame__title">{displayTitle}</span>
        <div className="webapp-frame__controls">
          <button type="button" className="webapp-frame__btn webapp-frame__btn--minimize" onClick={() => setMinimized(!minimized)} title={t.webAppMinimize}>
            {minimized
              ? <svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
              : <svg viewBox="0 0 12 12"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" /></svg>
            }
          </button>
          {!minimized && (
            <button type="button" className="webapp-frame__btn webapp-frame__btn--maximize" onClick={toggleMaximize} title={t.webAppMaximize}>
              {maximized
                ? <svg viewBox="0 0 12 12"><rect x="1.5" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" /><path d="M3.5 3V2a1 1 0 011-1h5.5a1 1 0 011 1v5.5a1 1 0 01-1 1H9" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
                : <svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
              }
            </button>
          )}
          <button type="button" className="webapp-frame__btn webapp-frame__btn--close" onClick={onClose} title={t.webAppClose}>
            <svg viewBox="0 0 12 12"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>

      {/* TmaApp content stays mounted so minimize/show is instant */}
      <div className={`webapp-frame__body${minimized ? ' webapp-frame__body--hidden' : ''}`}>
        <TmaApp />
      </div>

      {/* Resize handles — hidden when minimized or maximized */}
      {!maximized && !minimized && <>
        <div className="webapp-frame__edge webapp-frame__edge--n" onPointerDown={(e) => onResizeStart(e, 'n')} />
        <div className="webapp-frame__edge webapp-frame__edge--s" onPointerDown={(e) => onResizeStart(e, 's')} />
        <div className="webapp-frame__edge webapp-frame__edge--e" onPointerDown={(e) => onResizeStart(e, 'e')} />
        <div className="webapp-frame__edge webapp-frame__edge--w" onPointerDown={(e) => onResizeStart(e, 'w')} />
        <div className="webapp-frame__edge webapp-frame__edge--ne" onPointerDown={(e) => onResizeStart(e, 'ne')} />
        <div className="webapp-frame__edge webapp-frame__edge--nw" onPointerDown={(e) => onResizeStart(e, 'nw')} />
        <div className="webapp-frame__edge webapp-frame__edge--se" onPointerDown={(e) => onResizeStart(e, 'se')} />
        <div className="webapp-frame__edge webapp-frame__edge--sw" onPointerDown={(e) => onResizeStart(e, 'sw')} />
      </>}
    </div>,
    document.body
  );
}
