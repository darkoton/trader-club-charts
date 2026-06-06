import { useParams } from "react-router-dom";
import { buildPath } from "../../configs/routes";
import { SITE_NAME } from "../../configs/seo";
import { CONTAINER } from "../shared/components/layout/container";
import Seo from "../shared/components/seo/Seo";
import useInView from "../shared/hooks/useInView";
import { usePublicI18n } from "../shared/publicI18n";
import ArticleContent from "./components/ArticleContent";
import ArticleNavigation from "./components/ArticleNavigation";
import ArticleNotFound from "./components/ArticleNotFound";
import ArticleSkeleton from "./components/ArticleSkeleton";
import TableOfContents from "./components/TableOfContents";
import useBlogArticle from "./hooks/useBlogArticle";
import useScrollToHash from "./hooks/useScrollToHash";
import { buildBlogArticleJsonLd } from "./jsonLd";

export default function BlogArticlePage() {
  const { locale, publicT } = usePublicI18n();
  const { slug } = useParams<{ slug: string }>();
  const { article, toc, prev, next, loading, notFound } = useBlogArticle(slug);
  const articleInView = useInView<HTMLDivElement>({ threshold: 0.05 });
  const navInView = useInView<HTMLDivElement>({ threshold: 0.1 });

  useScrollToHash(article);

  if (loading) return <ArticleSkeleton />;
  if (notFound || !article) return <ArticleNotFound />;

  const canonicalPath = buildPath.blogArticle(article.slug);

  return (
    <div className={`${CONTAINER} po-fade-in w-full`}>
      <Seo
        title={article.title}
        description={article.description}
        locale={publicT.meta.ogLocale}
        canonical={canonicalPath}
        ogType="article"
        ogImage={article.banner ?? undefined}
        ogImageAlt={publicT.blog.articleImageAlt(article.title)}
        articlePublishedTime={article.published_at}
        articleModifiedTime={article.updated_at}
        articleAuthor={SITE_NAME}
        articleTags={article.tags}
        jsonLd={buildBlogArticleJsonLd({ article, locale })}
      />

      <div className="flex gap-10 xl:gap-16">
        <article className="po-content min-w-0 flex-1">
          <div
            ref={articleInView.ref}
            data-in-view={articleInView.inView ? "true" : "false"}
            className="po-reveal"
          >
            <ArticleContent article={article} />
          </div>
          <div
            ref={navInView.ref}
            data-in-view={navInView.inView ? "true" : "false"}
            className="po-reveal"
          >
            <ArticleNavigation prev={prev} next={next} />
          </div>
        </article>

        <aside className="hidden shrink-0 lg:block lg:w-[19.625rem]">
          <div className="sticky top-[7.125rem]">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-gray-500">
              {publicT.blog.tocTitle}
            </h4>
            <TableOfContents entries={toc} />
          </div>
        </aside>
      </div>
    </div>
  );
}
