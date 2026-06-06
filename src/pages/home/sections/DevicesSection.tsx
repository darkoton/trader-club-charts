import type { ReactNode } from "react";
import Section, { gapStyle } from "../../shared/components/ui/Section";
import SectionHeading from "../../shared/components/ui/SectionHeading";
import useInView from "../../shared/hooks/useInView";
import { usePublicI18n } from "../../shared/publicI18n";
import { CARD_GAP_DESKTOP, CARD_GAP_MOBILE, HOME_SECTION_PADDING } from "../layout";

export default function DevicesSection() {
  const { publicT } = usePublicI18n();
  const { ref, inView } = useInView<HTMLElement>();

  return (
    <Section
      ref={ref}
      inView={inView}
      pt={HOME_SECTION_PADDING.devices.pt}
      pb={HOME_SECTION_PADDING.devices.pb}
    >
      <SectionHeading className="mb-10 sm:mb-14">
        {publicT.home.devicesTitleLead}{" "}<span className="po-underline">{publicT.home.devicesTitleAccent}</span>{" "}{publicT.home.devicesTitleSuffix}
      </SectionHeading>

      {/* Carousel — negative margins equal to the current container
          padding make the strip span full-viewport on mobile; the
          inner `px-*` restores the container's content column so
          the first card aligns with the heading. At lg+ the strip
          turns into a static 2-column grid. */}
      <div
        className="
            po-device-cards po-gap
            -mx-4 flex snap-x snap-mandatory items-stretch overflow-x-auto px-4 pb-2
            sm:-mx-6 sm:px-6
            lg:mx-0 lg:grid lg:grid-cols-2 lg:snap-none lg:items-stretch lg:overflow-visible lg:px-0 lg:pb-0
          "
        style={gapStyle(CARD_GAP_MOBILE, CARD_GAP_DESKTOP)}
      >
        <DeviceCard label={publicT.home.devicesMobileLabel} delay="120ms">
          <img
            src="/img/devices/iPhone 14 Pro.webp"
            alt={publicT.home.devicesPhoneAlt}
            loading="lazy"
            decoding="async"
            width={540}
            height={611}
            className="
              po-device-card__img po-device-card__img--phone
              pointer-events-none
              relative z-10
              mb-[-7rem]
              block
              h-auto
              w-[44%] max-w-[12.2rem]
              select-none
              sm:mb-[-6rem] sm:w-[46%] sm:max-w-[10.5rem]
              min-[768px]:mb-[-6rem] min-[768px]:w-[46%] min-[768px]:max-w-[15rem]
              lg:w-[44%] lg:max-w-[12.6rem]
              xl:w-[44%] xl:max-w-[15.2rem]
              min-[1488px]:max-w-[17rem]
            "
            draggable={false}
          />
        </DeviceCard>

        <DeviceCard label={publicT.home.devicesWebLabel} delay="260ms">
          <img
            src="/img/devices/MacBook Pro 14.webp"
            alt={publicT.home.devicesLaptopAlt}
            loading="lazy"
            decoding="async"
            width={725}
            height={533}
            className="po-device-card__img po-device-card__img--laptop pointer-events-none relative z-10 block h-auto w-[96%] select-none"
            draggable={false}
          />
        </DeviceCard>
      </div>
    </Section>
  );
}

interface DeviceCardProps {
  label: string;
  delay: string;
  children: ReactNode;
}

function DeviceCard({ label, delay, children }: DeviceCardProps) {
  return (
    <div
      className="po-device-card po-reveal relative flex h-full w-[85%] min-w-[18.75rem] shrink-0 snap-start flex-col overflow-hidden rounded-[1.75rem] border border-[rgba(59,59,59,0.2)] sm:rounded-[2rem] lg:w-auto lg:min-w-0 lg:shrink"
      style={{ ["--po-delay" as unknown as string]: delay } as React.CSSProperties}
    >
      {/* Two accent glows — top-left + bottom-right */}
      <span aria-hidden="true" className="po-device-card__glow po-device-card__glow--tl" />
      <span aria-hidden="true" className="po-device-card__glow po-device-card__glow--br" />

      {/* Repeating "PO Terminal" watermark — 5 rows */}
      <div aria-hidden="true" className="po-device-card__watermark text-accent">
        {Array.from({ length: 5 }, (_, i) => (
          <span style={{ opacity: (i + 1) * 0.01 }} key={i}>
            PO Terminal
          </span>
        ))}
      </div>

      {/* Top label — pinned to top so both cards align on the same row */}
      <p className="relative z-10 flex shrink-0 items-center justify-center py-6 text-center text-[1.25rem] font-semibold text-white sm:py-8 sm:text-[1.625rem]">
        {label}
      </p>

      {/* Device image (floats on idle) — pushed to the bottom */}
      <div className="relative z-10 mt-auto flex items-end justify-center">{children}</div>
    </div>
  );
}
