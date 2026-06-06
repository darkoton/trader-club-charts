/**
 * Shared form validators for `react-hook-form` register options.
 * Messages come from `validationMessages.ts` — single source of truth.
 */

import type { Locale } from "../../../i18n";
import { MSG, getValidationMessages } from "./validationMessages";

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** At least one letter + one digit. */
export const PASSWORD_PATTERN = /^(?=.*[a-zA-Z])(?=.*\d)/;

export const PASSWORD_MIN_LENGTH = 8;

export function getEmailRules(locale: Locale) {
  const messages = getValidationMessages(locale);
  return {
    required: messages.required,
    pattern: { value: EMAIL_PATTERN, message: messages.emailInvalid },
  } as const;
}

export function getPasswordRules(locale: Locale) {
  const messages = getValidationMessages(locale);
  return {
    required: messages.required,
    minLength: { value: PASSWORD_MIN_LENGTH, message: messages.passwordMin(PASSWORD_MIN_LENGTH) },
    pattern: { value: PASSWORD_PATTERN, message: messages.passwordPattern },
  } as const;
}

export function getLoginPasswordRules(locale: Locale) {
  const messages = getValidationMessages(locale);
  return {
    required: messages.required,
  } as const;
}

export function getConfirmPasswordRules(locale: Locale, original: string | undefined) {
  const messages = getValidationMessages(locale);
  return {
    required: messages.required,
    validate: (v: string) => v === original || messages.passwordMismatch,
  };
}

export function getRequiredRule(locale: Locale) {
  const messages = getValidationMessages(locale);
  return {
    required: messages.required,
  } as const;
}

/** Ready-to-spread rules object for email fields. */
export const emailRules = {
  required: MSG.required,
  pattern: { value: EMAIL_PATTERN, message: MSG.emailInvalid },
} as const;

/** Ready-to-spread rules object for password fields (register / recover). */
export const passwordRules = {
  required: MSG.required,
  minLength: { value: PASSWORD_MIN_LENGTH, message: MSG.passwordMin(PASSWORD_MIN_LENGTH) },
  pattern: { value: PASSWORD_PATTERN, message: MSG.passwordPattern },
} as const;

/** Ready-to-spread rules object for login password (no strength checks). */
export const loginPasswordRules = {
  required: MSG.required,
} as const;

/** Builds rules for a confirm-password field, validating against the original. */
export function confirmPasswordRules(original: string | undefined) {
  return {
    required: MSG.required,
    validate: (v: string) => v === original || MSG.passwordMismatch,
  };
}

/** Required-only rule (used for the PO ID field etc.). */
export const requiredRule = {
  required: MSG.required,
} as const;
