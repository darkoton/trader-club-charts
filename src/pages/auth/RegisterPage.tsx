import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import routes from "../../configs/routes";
import Seo from "../shared/components/seo/Seo";
import Button from "../shared/components/ui/Button";
import TextInput from "../shared/components/ui/TextInput";
import {
  ApiError,
  captureAffiliateTrackingFromSearch,
  isDepositRequiredError,
  persistDepositRequiredPayload,
  registerUser,
} from "../shared/api/terminalAuth";
import { MIN_SUBMIT_MS, withMinDelay } from "../config";
import { usePublicI18n } from "../shared/publicI18n";
import { getConfirmPasswordRules, getEmailRules, getPasswordRules } from "../shared/utils/validators";
import { getValidationMessages, localizeAuthApiError } from "../shared/utils/validationMessages";
import { notify } from "../shared/utils/notify";
import useRedirectIfConfirmed from "../shared/hooks/useRedirectIfConfirmed";
import AuthCard from "./components/AuthCard";
import GoogleAuthButton from "./components/GoogleAuthButton";
import PasswordField from "./components/PasswordField";

interface RegisterFormData {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  useRedirectIfConfirmed();
  const { locale, publicT } = usePublicI18n();
  const messages = getValidationMessages(locale);
  const navigate = useNavigate();
  const { search } = useLocation();

  useEffect(() => {
    captureAffiliateTrackingFromSearch(search);
  }, [search]);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>();

  const passwordValue = watch("password");

  async function onSubmit(data: RegisterFormData) {
    const tracking = captureAffiliateTrackingFromSearch(search);

    try {
      const res = await withMinDelay(
        registerUser(data.email, data.password, tracking),
        MIN_SUBMIT_MS,
      );
      navigate(res.is_confirmed ? routes.Terminal : routes.RegisterStep2);
    } catch (err) {
      if (err instanceof ApiError && isDepositRequiredError(err)) {
        persistDepositRequiredPayload(err);
        notify.error(messages.confirmDepositRequired);
        navigate(routes.RegisterStep2);
        return;
      }
      notify.error(err instanceof ApiError ? localizeAuthApiError(err.message, messages, messages.registerError) : messages.registerError);
    }
  }

  return (
    <>
      <Seo
        title={publicT.auth.register.seoTitle}
        description={publicT.auth.register.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.Register}
        noIndex
      />

      <AuthCard
        title={publicT.auth.register.title}
        subtitle={publicT.auth.register.subtitle}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate autoComplete="off">
          <GoogleAuthButton mode="register" search={search} />

          <TextInput
            label={publicT.auth.emailLabel}
            required
            type="email"
            placeholder={publicT.auth.emailPlaceholder}
            error={errors.email?.message}
            {...register("email", getEmailRules(locale))}
          />
          <p className="-mt-3 text-[0.8125rem] leading-snug text-[#BABDC3]">
            {publicT.auth.register.emailHint}
          </p>

          <PasswordField
            label={publicT.auth.passwordLabel}
            placeholder={publicT.auth.passwordPlaceholder}
            error={errors.password?.message}
            registerProps={register("password", getPasswordRules(locale))}
          />

          <PasswordField
            label={publicT.auth.confirmPasswordLabel}
            placeholder={publicT.auth.confirmPasswordPlaceholder}
            error={errors.confirmPassword?.message}
            registerProps={register("confirmPassword", getConfirmPasswordRules(locale, passwordValue))}
          />

          <Button type="submit" loading={isSubmitting} fullWidth>
            {publicT.auth.register.submit}
          </Button>

          <p className="text-center text-[0.875rem] text-gray-500">
            {publicT.auth.alreadyHaveAccount}{" "}
            <Link
              to={routes.Login}
              className="text-accent underline transition-colors hover:text-accent-hover"
            >
              {publicT.auth.register.loginLink}
            </Link>
          </p>
        </form>
      </AuthCard>
    </>
  );
}
