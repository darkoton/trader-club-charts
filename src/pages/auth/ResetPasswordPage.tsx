import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import routes from "../../configs/routes";
import Seo from "../shared/components/seo/Seo";
import Button from "../shared/components/ui/Button";
import TextInput from "../shared/components/ui/TextInput";
import { EnvelopeIcon } from "../shared/components/icons";
import { ApiError, forgotPassword } from "../shared/api/terminalAuth";
import { MIN_SUBMIT_MS, withMinDelay } from "../config";
import { usePublicI18n } from "../shared/publicI18n";
import { getEmailRules } from "../shared/utils/validators";
import { getValidationMessages } from "../shared/utils/validationMessages";
import { notify } from "../shared/utils/notify";
import useRedirectIfConfirmed from "../shared/hooks/useRedirectIfConfirmed";
import AuthCard from "./components/AuthCard";

interface ResetPasswordFormData {
  email: string;
}

export default function ResetPasswordPage() {
  useRedirectIfConfirmed();
  const { locale, publicT } = usePublicI18n();
  const messages = getValidationMessages(locale);
  const navigate = useNavigate();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormData>();

  async function onSubmit(data: ResetPasswordFormData) {
    try {
      await withMinDelay(forgotPassword(data.email), MIN_SUBMIT_MS);
      setSentTo(data.email);
    } catch (err) {
      notify.error(err instanceof ApiError ? err.message : messages.sendError);
    }
  }

  return (
    <>
      <Seo
        title={publicT.auth.reset.seoTitle}
        description={publicT.auth.reset.seoDescription}
        locale={publicT.meta.ogLocale}
        canonical={routes.ResetPassword}
        noIndex
      />

      {sentTo ? (
        <CheckEmailView email={sentTo} onBack={() => navigate(routes.Login)} />
      ) : (
        <AuthCard
          title={publicT.auth.reset.title}
          subtitle={publicT.auth.reset.subtitle}
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
            autoComplete="off"
          >
            <TextInput
              label={publicT.auth.emailLabel}
              type="email"
              placeholder={publicT.auth.emailPlaceholder}
              error={errors.email?.message}
              {...register("email", getEmailRules(locale))}
            />

            <Button type="submit" loading={isSubmitting} fullWidth>
              {publicT.auth.reset.submit}
            </Button>

            <Button type="button" variant="dark" fullWidth onClick={() => navigate(routes.Login)}>
              {publicT.auth.reset.cancel}
            </Button>
          </form>
        </AuthCard>
      )}
    </>
  );
}

function CheckEmailView({ email, onBack }: { email: string; onBack: () => void }) {
  const { publicT } = usePublicI18n();

  return (
    <AuthCard
      title={publicT.auth.reset.sentTitle}
      subtitle={publicT.auth.reset.sentSubtitle(email)}
    >
      <div className="space-y-4">
        <div className="flex justify-center">
          <EnvelopeIcon size={64} className="text-accent" />
        </div>

        <p className="text-center text-sm text-[#BABDC3]">
          {publicT.auth.reset.sentHint}
        </p>

        <Button type="button" variant="dark" fullWidth onClick={onBack}>
          {publicT.auth.reset.backToLogin}
        </Button>
      </div>
    </AuthCard>
  );
}
