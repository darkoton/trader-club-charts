import type { Locale } from "../../../i18n";
import { getPublicValidationMessages, type ValidationMessages } from "../publicI18n";

/**
 * Centralised user-facing validation & form feedback messages.
 *
 * Keep ALL error / success strings here so copy changes happen in one place
 * and the whole marketing site stays consistent.
 *
 *   import { MSG } from "../utils/validationMessages";
 *   { required: MSG.required }
 */

export function getValidationMessages(locale: Locale) {
  return getPublicValidationMessages(locale);
}

function normalizeApiMessage(message: string | null | undefined): string {
  return (message ?? "").trim().toLowerCase();
}

export function localizeAuthApiError(
  message: string | null | undefined,
  messages: ValidationMessages,
  fallback: string,
): string {
  const normalized = normalizeApiMessage(message);

  switch (normalized) {
    case 'email already registered':
      return messages.registerEmailAlreadyRegistered;
    case 'pocket login failed':
    case 'login failed':
    case 'invalid credentials':
    case 'invalid login or password':
      return messages.loginInvalidCredentials;
    default:
      return message?.trim() || fallback;
  }
}

export const MSG = getValidationMessages("ru");
