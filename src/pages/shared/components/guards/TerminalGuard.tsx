import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import routes from "../../../../configs/routes";
import { hasPendingRegisterStep2Context } from "../../api/terminalAuth";
import useAuth from "../../hooks/useAuth";

interface TerminalGuardProps {
  children: ReactNode;
}

/**
 * Blocks the terminal app from rendering for users that are logged in
 * but have not finished onboarding.
 *
 * Redirect rule (per product): if `is_confirmed === false`,
 * bounce to the step-2 deposit gate instead of allowing direct
 * navigation into the terminal.
 *
 * Unauthenticated visitors are redirected to the login page.
 */
export default function TerminalGuard({ children }: TerminalGuardProps) {
  const { user, isLoading } = useAuth();
  const hasPendingStep2Context = hasPendingRegisterStep2Context();

  // Still resolving the profile — render nothing to avoid a brief
  // flash of the terminal before the redirect kicks in.
  if (isLoading) return null;

  if (user && !user.is_confirmed) {
    return <Navigate to={routes.RegisterStep2} replace />;
  }

  if (!user && hasPendingStep2Context) {
    return <Navigate to={routes.RegisterStep2} replace />;
  }

  if (!user) {
    return <Navigate to={routes.Login} replace />;
  }

  return <>{children}</>;
}
