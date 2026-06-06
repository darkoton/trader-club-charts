import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "../icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  titleIcon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Hide the top-right × button (e.g. for forced-choice dialogs). */
  hideClose?: boolean;
  /** Max width in pixels. Defaults to 480. */
  maxWidth?: number;
}

/** Duration must match the CSS animations in `pages.css`. */
const ANIMATION_MS = 320;

/**
 * Generic modal dialog used across the marketing pages.
 *
 *  • portalled to <body> so it always sits above the layout;
 *  • locks page scroll (html + body) while open, with scrollbar
 *    gutter compensation so the page doesn't jump;
 *  • closes on backdrop click and Escape;
 *  • fade + scale animation on both open AND close (via
 *    `data-state="open" | "closed"` on the root).
 *
 * The portal root does NOT have the `.po-pages` class so the
 * decorative `.po-pages::before` dotted background doesn't
 * bleed behind the modal.
 */
export default function Modal({
  open,
  onClose,
  title,
  titleIcon,
  children,
  footer,
  hideClose,
  maxWidth,
}: ModalProps) {
  // Keep modal mounted while exit animation runs.
  const [mounted, setMounted] = useState(open);
  const [state, setState] = useState<"open" | "closed">(open ? "open" : "closed");

  // Mount / unmount lifecycle tied to `open`.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Force a frame before flipping to "open" so the enter animation plays.
      const id = requestAnimationFrame(() => setState("open"));
      return () => cancelAnimationFrame(id);
    }
    setState("closed");
    const t = setTimeout(() => setMounted(false), ANIMATION_MS);
    return () => clearTimeout(t);
  }, [open]);

  // Lock page scroll while any modal is mounted.
  useEffect(() => {
    if (!mounted) return;
    const html = document.documentElement;
    const body = document.body;

    // Compensate for the removed scrollbar to avoid a layout jump.
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPaddingRight = body.style.paddingRight;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.paddingRight = prevBodyPaddingRight;
    };
  }, [mounted]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="po-modal-overlay"
      data-state={state}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="po-modal-card"
        data-state={state}
        style={maxWidth ? { maxWidth } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <h2 className="po-modal-title">
            {titleIcon}
            <span>{title}</span>
          </h2>
        )}

        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="po-icon-btn po-modal-close"
          >
            <CloseIcon size={20} />
          </button>
        )}

        <div className="po-modal-body">{children}</div>

        {footer && <div className="po-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
