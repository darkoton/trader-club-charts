import type { BlogArticleFull } from "../../shared/types/blog";
import { usePublicI18n, formatPublicDate } from "../../shared/publicI18n";

interface ArticleContentProps {
  article: BlogArticleFull;
}

/** Renders the article title, banner and ordered sections. */
export default function ArticleContent({ article }: ArticleContentProps) {
  const { locale, publicT } = usePublicI18n();
  const publishedDate = formatPublicDate(locale, article.published_at);

  const sections = [...article.sections].sort((a, b) => a.order - b.order);

  return (
    <>
      <time dateTime={article.published_at} className="mb-3 block text-sm text-gray-600">
        {publishedDate}
      </time>

      <h1 className="mb-6 text-[1.625rem] font-bold leading-tight text-white sm:text-[2rem]">
        {article.title}
      </h1>

      <p className="mb-6 text-[0.9375rem] leading-relaxed text-[#BABDC3]">{article.description}</p>

      {article.banner && (
        <div className="mb-6 overflow-hidden rounded-[1.5rem]">
          <img
            src={article.banner}
            alt={publicT.blog.articleImageAlt(article.title)}
            loading="eager"
            decoding="async"
            width={960}
            height={540}
            className="block h-auto w-full"
          />
        </div>
      )}

      {sections.map((section) => (
        <section key={section.id} id={section.id} className="mb-6">
          <h2 className="mb-6 mt-6 text-[1.375rem] font-bold text-white">{section.title}</h2>
          <div
            className="po-article-html text-[0.9375rem] leading-[1.75] text-gray-300"
            dangerouslySetInnerHTML={{ __html: section.content }}
          />
        </section>
      ))}
    </>
  );
}
