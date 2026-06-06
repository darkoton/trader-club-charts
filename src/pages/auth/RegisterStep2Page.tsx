import { useState } from "react";
import { Navigate } from "react-router-dom";
import routes from "../../configs/routes";
import Seo from "../shared/components/seo/Seo";
import {
  clearStoredDepositLink,
  clearStoredPendingPocketId,
  clearTerminalToken,
  fetchProfile,
  getPocketOptionLink,
  getStoredDepositLink,
  getStoredPendingPocketId,
  getTerminalToken,
} from "../shared/api/terminalAuth";
import useBotLinks from "../shared/hooks/useBotLinks";
import { MIN_SUBMIT_MS, withMinDelay } from "../config";
import { usePublicI18n } from "../shared/publicI18n";
import { getValidationMessages } from "../shared/utils/validationMessages";
import { notify } from "../shared/utils/notify";
import useRedirectIfConfirmed from "../shared/hooks/useRedirectIfConfirmed";
import AccessPendingCard from "./components/AccessPendingCard";

/**
 * Terminal Auth V2: after `POST /api/terminal/v2/register` we already know the
 * trader_id and the deposit deeplink. The user just needs to deposit and then
 * log in again — there is no longer a PO ID confirmation step.
 *
 * This page therefore degrades into the "deposit pending" gate.
 */
export default function RegisterStep2Page() {
  useRedirectIfConfirmed();
  const { locale, publicT } = usePublicI18n();
  const messages = getValidationMessages(locale);

  const [pendingPocketId] = useState(
    () => getStoredPendingPocketId() ?? "",
  );
  const [depositLink] = useState(() => getStoredDepositLink() ?? "");
  const [checkingStatus, setCheckingStatus] = useState(false);

  const { links } = useBotLinks();
  const fallbackPocketLink = getPocketOptionLink(links);
  const helpLink = "https://t.me/AiTCbot1";
  const pocketOptionLink = depositLink || fallbackPocketLink;

  // If there is no token AND no stored deposit context → nothing to show.
  if (!getTerminalToken() && !pendingPocketId && !depositLink) {
    return <Navigate to={routes.Register} replace />;
  }

  // Came here via login-403 (no JWT yet) but have a deposit link — show the
  // deposit pending screen so the user can complete the deposit and then log in.
  // If there is neither trader_id nor deposit link, fall back to login.
  if (!pendingPocketId && !depositLink) {
    return <Navigate to={routes.Login} replace />;
  }

  async function handleCheckStatus() {
    setCheckingStatus(true);
    try {
      const profile = await withMinDelay(fetchProfile(), MIN_SUBMIT_MS);
      if (profile.is_confirmed && profile.trader_id) {
        clearStoredDepositLink();
        clearStoredPendingPocketId();
        notify.success(messages.accountConfirmed);
        window.location.href = routes.Terminal;
        return;
      }
      notify.info(messages.confirmStillPendingDeposit);
    } catch {
      notify.error(messages.confirmError);
    } finally {
      setCheckingStatus(false);
    }
  }

  async function handleCopyPocketId() {
    if (!pendingPocketId) return;
    try {
      await navigator.clipboard.writeText(pendingPocketId);
      notify.success(messages.confirmPocketIdCopied);
    } catch {
      notify.error(messages.copyFailed);
    }
  }

  function handleLogout() {
    clearTerminalToken();
    window.location.href = routes.Login;
  }

  return (
    <>
      <Seo
        title={publicT.auth.accessPending.seoTitle}
        description={publicT.auth.accessPending.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.RegisterStep2}
        noIndex
      />

      <AccessPendingCard
        poId={pendingPocketId}
        checkingStatus={checkingStatus}
        onCopyId={handleCopyPocketId}
        onCheckStatus={handleCheckStatus}
        onLogout={handleLogout}
        pocketOptionLink={pocketOptionLink}
        helpLink={helpLink}
      />
    </>
  );
}
