import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import routes from "../../configs/routes";
import Seo from "../shared/components/seo/Seo";
import Button from "../shared/components/ui/Button";
import TextInput from "../shared/components/ui/TextInput";
import {
  ApiError,
  captureAffiliateTrackingFromSearch,
  confirmTwoFactor,
  isDepositRequiredError,
  isTwoFactorChallenge,
  loginUser,
  persistDepositRequiredPayload,
  type AuthResponse,
} from "../shared/api/terminalAuth";
import { MIN_SUBMIT_MS, withMinDelay } from "../config";
import { usePublicI18n } from "../shared/publicI18n";
import { getEmailRules, getLoginPasswordRules, getRequiredRule } from "../shared/utils/validators";
import { getValidationMessages, localizeAuthApiError } from "../shared/utils/validationMessages";
import { notify } from "../shared/utils/notify";
import useRedirectIfConfirmed from "../shared/hooks/useRedirectIfConfirmed";
import AuthCard from "./components/AuthCard";
import GoogleAuthButton from "./components/GoogleAuthButton";
import PasswordField from "./components/PasswordField";

interface LoginFormData {
  email: string;
  password: string;
}

interface TwoFactorFormData {
  code: string;
}

export default function LoginPage() {
  useRedirectIfConfirmed();
  const { locale, publicT } = usePublicI18n();
  const messages = getValidationMessages(locale);
  const navigate = useNavigate();
  const { search } = useLocation();
  const [challengeId, setChallengeId] = useState<string | null>(null);

  useEffect(() => {
    captureAffiliateTrackingFromSearch(search);
  }, [search]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>();

  function navigateAfterAuth(res: AuthResponse): void {
    navigate(res.is_confirmed ? routes.Terminal : routes.RegisterStep2);
  }

  async function onSubmit(data: LoginFormData) {
    try {
      const res = await withMinDelay(loginUser(data.email, data.password), MIN_SUBMIT_MS);
      if (isTwoFactorChallenge(res)) {
        setChallengeId(res.challenge_id);
        notify.info(messages.twoFactorRequired);
        return;
      }
      navigateAfterAuth(res);
    } catch (err) {
      if (err instanceof ApiError && isDepositRequiredError(err)) {
        persistDepositRequiredPayload(err);
        notify.error(messages.confirmDepositRequired);
        navigate(routes.RegisterStep2);
        return;
      }
      notify.error(
        err instanceof ApiError
          ? localizeAuthApiError(err.message, messages, messages.loginError)
          : messages.loginError,
      );
    }
  }

  if (challengeId) {
    return (
      <TwoFactorView
        challengeId={challengeId}
        onCancel={() => setChallengeId(null)}
        onResolved={navigateAfterAuth}
      />
    );
  }

  return (
    <>
      <Seo
        title={publicT.auth.login.seoTitle}
        description={publicT.auth.login.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.Login}
        noIndex
      />

      <AuthCard title={publicT.auth.login.title} subtitle={publicT.auth.login.subtitle}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate autoComplete="off">
          <GoogleAuthButton mode="login" search={search} />

          <TextInput
            label={publicT.auth.emailLabel}
            required
            type="email"
            placeholder={publicT.auth.emailPlaceholder}
            error={errors.email?.message}
            {...register("email", getEmailRules(locale))}
          />

          <PasswordField
            label={publicT.auth.passwordLabel}
            placeholder={publicT.auth.passwordPlaceholder}
            error={errors.password?.message}
            registerProps={register("password", getLoginPasswordRules(locale))}
          />

          <Button type="submit" loading={isSubmitting} fullWidth>
            {publicT.auth.login.submit}
          </Button>

          <div className="flex flex-col items-center gap-3 text-[0.875rem] text-gray-500">
            <Link
              to={routes.ResetPassword}
              className="text-[#BABDC3] no-underline transition-colors hover:text-white"
            >
              {publicT.auth.forgotPassword}
            </Link>

            <p>
              {publicT.auth.noAccount}{" "}
              <Link
                to={routes.Register}
                className="text-accent underline transition-colors hover:text-accent-hover"
              >
                {publicT.header.register}
              </Link>
            </p>
          </div>
        </form>
      </AuthCard>
    </>
  );
}

function TwoFactorView({
  challengeId,
  onCancel,
  onResolved,
}: {
  challengeId: string;
  onCancel: () => void;
  onResolved: (res: AuthResponse) => void;
}) {
  const { locale, publicT } = usePublicI18n();
  const messages = getValidationMessages(locale);
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TwoFactorFormData>();

  async function onSubmit(data: TwoFactorFormData) {
    const code = data.code.trim();
    if (!code) {
      notify.error(messages.twoFactorCodeRequired);
      return;
    }

    try {
      const res = await withMinDelay(confirmTwoFactor(challengeId, code), MIN_SUBMIT_MS);
      onResolved(res);
    } catch (err) {
      if (err instanceof ApiError) {
        if (isDepositRequiredError(err)) {
          persistDepositRequiredPayload(err);
          notify.error(messages.confirmDepositRequired);
          navigate(routes.RegisterStep2);
          return;
        }
        notify.error(err.message || messages.twoFactorInvalid);
        return;
      }
      notify.error(messages.twoFactorInvalid);
    }
  }

  return (
    <>
      <Seo
        title={publicT.auth.twoFactor.seoTitle}
        description={publicT.auth.twoFactor.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.Login}
        noIndex
      />

      <AuthCard
        title={publicT.auth.twoFactor.title}
        subtitle={publicT.auth.twoFactor.subtitle}
      >
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-5"
          noValidate
          autoComplete="off"
        >
          <TextInput
            label={publicT.auth.twoFactor.codeLabel}
            required
            type="text"
            inputMode="numeric"
            placeholder={publicT.auth.twoFactor.codePlaceholder}
            error={errors.code?.message}
            {...register("code", getRequiredRule(locale))}
          />

          <Button type="submit" loading={isSubmitting} fullWidth>
            {publicT.auth.twoFactor.confirm}
          </Button>

          <Button type="button" variant="dark" fullWidth onClick={onCancel}>
            {publicT.auth.twoFactor.cancel}
          </Button>
        </form>
      </AuthCard>
    </>
  );
}
