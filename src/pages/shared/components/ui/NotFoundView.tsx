import type { CSSProperties, ReactNode } from "react";
import { CONTAINER } from "../layout/container";
import useInView from "../../hooks/useInView";

interface NotFoundViewProps {
  /** Large decorative glyph rendered above the headline (e.g. "404"). */
  code: ReactNode;
  /** Main headline. Supports ReactNode so parts can be accent-coloured. */
  title: ReactNode;
  /** Supporting paragraph under the headline. */
  description: ReactNode;
  /** Action buttons row — usually 1–2 `<Button/>`s. */
  actions: ReactNode;
}

const styleDelay = (ms: number): CSSProperties =>
  ({ ["--po-delay" as unknown as string]: `${ms}ms` }) as CSSProperties;

/**
 * Unified "empty state" view used by the site 404 page and the blog
 * article-not-found fallback. Animates its children in with the
 * standard `.po-reveal*` classes so the screen feels alive on route
 * change instead of popping in.
 */
export default function NotFoundView({ code, title, description, actions }: NotFoundViewProps) {
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0, rootMargin: "0px" });

  return (
    <section
      ref={ref}
      data-in-view={inView ? "true" : "false"}
      className={`relative ${CONTAINER} flex-1 py-20 text-center md:py-32`}
    >
      <p
        className="po-nf-code po-reveal-scale mx-auto select-none bg-clip-text text-[6.5rem] font-extrabold leading-none tracking-tight text-transparent sm:text-[9rem] md:text-[12rem]"
        aria-hidden="true"
        style={styleDelay(0)}
      >
        {code}
      </p>

      <h1
        className="po-reveal mx-auto mb-4 mt-4 max-w-[720px] text-balance text-[1.75rem] font-extrabold uppercase leading-[1.1] tracking-tight text-white sm:text-[2.25rem] md:text-[3rem]"
        style={styleDelay(180)}
      >
        {title}
      </h1>

      <p
        className="po-reveal mx-auto mb-10 max-w-[560px] text-[0.9375rem] leading-relaxed text-[#BABDC3] md:text-base"
        style={styleDelay(300)}
      >
        {description}
      </p>

      <div
        className="po-reveal flex flex-col items-center justify-center gap-3 sm:flex-row"
        style={styleDelay(420)}
      >
        {actions}
      </div>
    </section>
  );
}
