import routes from "../../../configs/routes";
import Seo from "../../shared/components/seo/Seo";
import Button from "../../shared/components/ui/Button";
import NotFoundView from "../../shared/components/ui/NotFoundView";
import { ArrowRightIcon, DocumentIcon, HomeIcon } from "../../shared/components/icons";
import { usePublicI18n } from "../../shared/publicI18n";

/** Shown when an article slug is missing or the API returns 404. */
export default function ArticleNotFound() {
  const { publicT } = usePublicI18n();

  return (
    <div className="w-full">
      <Seo
        title={publicT.blog.articleNotFoundSeoTitle}
        description={publicT.blog.articleNotFoundSeoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.Blog}
        noIndex
      />

      <NotFoundView
        code="404"
        title={
          <>
            {publicT.blog.articleNotFoundTitleLead} <span className="text-accent">{publicT.blog.articleNotFoundTitleAccent}</span>
          </>
        }
        description={publicT.blog.articleNotFoundDescription}
        actions={
          <>
            <Button
              to={routes.Blog}
              leftIcon={<DocumentIcon size={16} />}
              rightIcon={<ArrowRightIcon size={16} />}
            >
              {publicT.blog.articleBackToBlog}
            </Button>
            <Button to={routes.Home} variant="dark" leftIcon={<HomeIcon size={16} />}>
              {publicT.blog.articleGoHome}
            </Button>
          </>
        }
      />
    </div>
  );
}
