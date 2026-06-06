import BlogSearch from "./BlogSearch";
import { CONTAINER } from "../../shared/components/layout/container";
import { usePublicI18n } from "../../shared/publicI18n";

interface BlogHeroProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
}

/** Blog list hero: title, description, search input. */
export default function BlogHero({ searchValue, onSearchChange }: BlogHeroProps) {
  const { publicT } = usePublicI18n();

  return (
    <div className={`po-blog-hero ${CONTAINER} pb-10 text-center`}>
      <h1
        className="po-blog-hero__title po-reveal mx-auto mb-3 max-w-[1024px] text-balance text-[2.25rem] font-extrabold uppercase leading-[1.1] tracking-tight text-white sm:mb-2 sm:text-[3rem] sm:leading-[1.05] md:text-[3.75rem]"
        style={{ ["--po-delay" as string]: "0ms" }}
      >
        {publicT.blog.heroTitle}
      </h1>

      <p
        className="po-blog-hero__lead mx-auto mb-8 max-w-xl text-[0.9375rem] leading-relaxed text-[#BABDC3]"
        style={{ ["--po-delay" as string]: "80ms" }}
      >
        {publicT.blog.heroDescription}
      </p>

      <div className="po-blog-hero__search" style={{ ["--po-delay" as string]: "160ms" }}>
        <BlogSearch value={searchValue} onChange={onSearchChange} />
      </div>
    </div>
  );
}
