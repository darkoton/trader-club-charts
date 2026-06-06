import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../../../configs/routes";
import useAuth from "./useAuth";

/**
 * Redirects a fully-confirmed trader away from the `/auth/*` pages.
 *
 * The marketing auth screens (Login / Register / RegisterStep2 /
 * Recover / ResetPassword) are meant for logged-out or unfinished
 * sign-ups only. If the user is already authenticated AND their
 * account has `is_confirmed === true` with a truthy `trader_id`,
 * they are bounced to the terminal app.
 *
 * Call it at the top of every auth page:
 *
 * ```tsx
 * export default function LoginPage() {
 *   useRedirectIfConfirmed();
 *   // …
 * }
 * ```
 */
export default function useRedirectIfConfirmed(): void {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (user && user.is_confirmed && user.trader_id) {
      navigate(routes.Terminal, { replace: true });
    }
  }, [isLoading, user, navigate]);
}
