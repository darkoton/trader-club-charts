import { Link } from "react-router-dom";
import type { ComponentType } from "react";
import routes from "../../../../configs/routes";
import { getTelegramBotLink } from "../../api/terminalAuth";
import useBotLinks from "../../hooks/useBotLinks";
import useInView from "../../hooks/useInView";
import { usePublicI18n } from "../../publicI18n";
import { CONTAINER } from "./container";
import SiteLogo from "./SiteLogo";
import { DocumentIcon, TelegramIcon } from "../icons";

type IconCmp = ComponentType<{ size?: number | string }>;

interface FooterLink {
  label: string;
  to?: string;
  href?: string;
  external?: boolean;
  Icon?: IconCmp;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const LINK_CLASS = "po-link-header text-[0.875rem]";
const TITLE_CLASS = "mb-4 text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-white";
const ICON_SIZE = 16;

function FooterLinkEl({ link, className }: { link: FooterLink; className?: string }) {
  const classes = `${LINK_CLASS}${className ? ` ${className}` : ""}`;
  const content = (
    <>
      {link.Icon && <link.Icon size={ICON_SIZE} />}
      {link.label}
    </>
  );

  if (link.to) {
    return (
      <Link to={link.to} className={classes}>
        {content}
      </Link>
    );
  }
  if (!link.href || link.href === "#") {
    return <span className={`${classes} po-hash-disabled`}>{content}</span>;
  }
  return (
    <a
      href={link.href}
      className={classes}
      {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : null)}
    >
      {content}
    </a>
  );
}

function LinkList({ title, links, delay }: FooterColumn & { delay?: string }) {
  return (
    <div
      className="po-reveal"
      style={
        delay ? ({ ["--po-delay" as unknown as string]: delay } as React.CSSProperties) : undefined
      }
    >
      <h4 className={TITLE_CLASS}>{title}</h4>
      <ul className="space-y-[0.625rem]">
        {links.map((l) => (
          <li className="whitespace-nowrap" key={l.label}>
            <FooterLinkEl link={l} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PageFooter() {
  const { publicT } = usePublicI18n();
  const { links } = useBotLinks();
  const { ref, inView } = useInView<HTMLElement>({ threshold: 0.05 });
  const columns: FooterColumn[] = [
    {
      title: publicT.footer.products,
      links: [
        { label: publicT.footer.terminal, to: routes.Terminal },
        { label: publicT.footer.robot, to: routes.Terminal },
        { label: publicT.footer.strategies, to: routes.Terminal },
        { label: publicT.footer.signals, to: routes.Terminal },
      ],
    },
    {
      title: publicT.footer.resources,
      links: [{ label: publicT.footer.blog, to: routes.Blog, Icon: DocumentIcon }],
    },
  ];
  const legalLinks: FooterLink[] = [
    { label: publicT.footer.terms, to: routes.Terms },
    { label: publicT.footer.privacy, to: routes.Privacy },
  ];
  const socialLinks: FooterLink[] = [
    { label: "Telegram", href: getTelegramBotLink(links), external: true, Icon: TelegramIcon },
  ];

  return (
    <footer ref={ref} data-in-view={inView ? "true" : "false"} className="relative overflow-hidden">
      <div className={`relative z-10 ${CONTAINER} pb-10 pt-16 lg:pt-[120px] lg:pb-[200px]`}>
        {/* Main grid — 4 equal columns on lg+ matching the Figma 1920px
            mock: logo/description | Продукты | Ресурсы | Соцсети.
            On mobile (<lg) the whole footer stacks into a single
            column per the 390px Figma mock. */}
        <div className="flex w-full max-w-[1200px] flex-col items-start gap-10 lg:flex-row lg:flex-wrap lg:justify-between lg:gap-[160px]">
          <div
            className="po-reveal w-full max-w-[360px]"
            style={{ ["--po-delay" as unknown as string]: "0ms" } as React.CSSProperties}
          >
            <SiteLogo size="md" className="mb-2" />

            <p className="text-[16px] leading-relaxed font-medium text-[#9D9D9D]">
              {publicT.footer.about}
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-8 lg:w-auto lg:grid-cols-3 lg:gap-[90px]">
            {columns.map((col, i) => (
              <LinkList
                key={col.title}
                title={col.title}
                links={col.links}
                delay={`${120 + i * 120}ms`}
              />
            ))}

            <LinkList title={publicT.footer.socials} links={socialLinks} delay="360ms" />
          </div>
        </div>

        {/* Disclaimer — just a paragraph, no divider line (per Figma). */}
        <p
          className="po-reveal py-5 mt-10 text-[0.875rem] font-medium text-sm text-[#696969] border-y border-solid border-[#222222]"
          style={{ ["--po-delay" as unknown as string]: "480ms" } as React.CSSProperties}
        >
          {publicT.footer.disclaimer}
        </p>

        {/* Bottom bar — copyright left, legal links right on lg+. */}
        <div
          className="po-reveal mt-5 flex flex-col items-center gap-3 text-center lg:mt-10 lg:flex-row lg:items-center lg:justify-between lg:text-left"
          style={{ ["--po-delay" as unknown as string]: "560ms" } as React.CSSProperties}
        >
          <p className="text-[0.875rem] text-[#6B6B6B]">
            © {new Date().getFullYear()} Po-Terminal. {publicT.footer.rightsReserved}
          </p>
          <ul className="flex flex-col items-center gap-3 lg:flex-row lg:flex-wrap lg:gap-x-10 lg:gap-y-2">
            {legalLinks.map((l) => (
              <li key={l.label}>
                <FooterLinkEl link={l} className="!text-[#696969]" />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bleeding brand watermark — desktop only; hidden on mobile per Figma. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden select-none justify-center overflow-hidden lg:flex"
      >
        <span
          className="whitespace-nowrap font-extrabold leading-none tracking-tight text-white/[0.025]"
          style={{
            fontSize: "clamp(80px, 18vw, 210px)",
            transform: "translateY(34%)",
          }}
        >
          PO TERMINAL
        </span>
      </div>
    </footer>
  );
}
