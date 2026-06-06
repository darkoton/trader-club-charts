import routes from "../../../../configs/routes";
import { usePublicI18n } from "../../publicI18n";
import CtaBanner from "./CtaBanner";

/**
 * The "PO Terminal" CTA banner used at the bottom of marketing pages
 * (home, blog list). Centralises copy so edits happen in one place.
 */
export default function DefaultCtaBanner() {
  const { publicT } = usePublicI18n();

  return (
    <CtaBanner
      title={
        <>
          {publicT.cta.titleLead} <span>{publicT.cta.titleAccent}</span>
        </>
      }
      subtitle={publicT.cta.subtitle}
      buttonLabel={publicT.cta.button}
      to={routes.Register}
    />
  );
}
