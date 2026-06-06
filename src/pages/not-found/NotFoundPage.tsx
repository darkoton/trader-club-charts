import routes from "../../configs/routes";
import Seo from "../shared/components/seo/Seo";
import Button from "../shared/components/ui/Button";
import NotFoundView from "../shared/components/ui/NotFoundView";
import { ArrowRightIcon, HomeIcon, DocumentIcon } from "../shared/components/icons";
import { usePublicI18n } from "../shared/publicI18n";

/**
 * 404 page — rendered for any unmatched route inside the marketing
 * site. Always marked `noIndex` so search engines do not treat
 * "soft 404" URLs as indexable content.
 */
export default function NotFoundPage() {
  const { publicT } = usePublicI18n();

  return (
    <div className="w-full">
      <Seo
        title={publicT.notFound.seoTitle}
        description={publicT.notFound.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.Home}
        noIndex
      />

      <NotFoundView
        code="404"
        title={
          <>
            {publicT.notFound.titleLead} <span className="text-accent">{publicT.notFound.titleAccent}</span>
          </>
        }
        description={publicT.notFound.description}
        actions={
          <>
            <Button to={routes.Home} leftIcon={<HomeIcon size={16} />}>
              {publicT.notFound.homeButton}
            </Button>
            <Button
              to={routes.Blog}
              variant="dark"
              leftIcon={<DocumentIcon size={16} />}
              rightIcon={<ArrowRightIcon size={16} />}
            >
              {publicT.notFound.blogButton}
            </Button>
          </>
        }
      />
    </div>
  );
}
