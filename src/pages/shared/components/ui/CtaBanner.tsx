import type { ReactNode } from "react";
import Button from "./Button";
import { BoltIcon } from "../icons";
import useInView from "../../hooks/useInView";

interface CtaBannerProps {
  title: ReactNode;
  subtitle?: ReactNode;
  buttonLabel: string;
  to?: string;
  href?: string;
}

/**
 * CTA banner — the background is a static PNG effect, the dark ticket-shaped
 * card is another PNG stretched to fit the content, and decorative objects
 * sit on top. Content grows freely and the card background follows.
 */
export default function CtaBanner({ title, subtitle, buttonLabel, to, href }: CtaBannerProps) {
  const btnProps = to ? { to } : href ? { href } : undefined;
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      data-in-view={inView ? "true" : "false"}
      className="relative isolate overflow-hidden"
      style={{
        background: "radial-gradient(50% 50% at 50% 50%, #4B72AC 35%, #80B2FF 100%)",
      }}
    >
      {/* bg-effect — centred via background-image */}
      <div
        aria-hidden="true"
        className="po-cta-bg pointer-events-none absolute inset-0 select-none"
        style={{
          backgroundImage: "url('/img/cta-banner/bg-effect.webp')",
          backgroundSize: "auto calc(100% - 6%)",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* decorative objects layer */}
      <img
        src="/img/cta-banner/objects.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="po-cta-objects pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center opacity-60 sm:opacity-100"
        draggable={false}
      />

      <div className="relative px-4 py-20 sm:px-6 sm:py-[12.625rem] min-h-[420px] sm:min-h-[640px] lg:min-h-[700px] flex justify-center items-center">
        <div
          className="po-reveal-scale relative mx-auto w-full max-w-[660px]"
          style={{ ["--po-delay" as unknown as string]: "80ms" } as React.CSSProperties}
        >
          {/* Ticket-shaped card background that stretches with content. */}
          <img
            src="/img/cta-banner/card.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full select-none"
            style={{ objectFit: "fill" }}
            draggable={false}
          />

          <div className="relative px-9 py-10 text-center sm:px-12 sm:py-[4.375rem] min-h-[15.625rem] flex flex-col items-center justify-center">
            <h2
              className="po-reveal mb-1.5 text-[1.625rem] font-semibold leading-[1.16] text-white sm:text-[2.125rem]"
              style={{ ["--po-delay" as unknown as string]: "260ms" } as React.CSSProperties}
            >
              {title}
            </h2>

            {subtitle && (
              <p
                className="po-reveal mb-6 text-center text-[1rem] font-semibold text-[#BABDC3] sm:mb-8 sm:text-[1.25rem]"
                style={{ ["--po-delay" as unknown as string]: "360ms" } as React.CSSProperties}
              >
                {subtitle}
              </p>
            )}

            {btnProps && (
              <div
                className="po-reveal po-cta-btn inline-block"
                style={{ ["--po-delay" as unknown as string]: "460ms" } as React.CSSProperties}
              >
                <Button {...btnProps} rightIcon={<BoltIcon size={14} />}>
                  {buttonLabel}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
