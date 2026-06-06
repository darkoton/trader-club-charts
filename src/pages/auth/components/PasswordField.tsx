import type { ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import PasswordInput from "../../shared/components/ui/PasswordInput";

interface PasswordFieldProps {
  label: ReactNode;
  placeholder?: string;
  error?: string;
  /** Pass the result of `register("password", rules)` here. */
  registerProps: UseFormRegisterReturn;
  required?: boolean;
}

/**
 * Uniform password field used across auth forms:
 * labelled group + `PasswordInput` + inline error message.
 */
export default function PasswordField({
  label,
  placeholder,
  error,
  registerProps,
  required = true,
}: PasswordFieldProps) {
  return (
    <div>
      <label className="mb-2 block text-[0.875rem] text-[#BABDC3]">
        {label}
        {required && <span className="text-accent"> *</span>}
      </label>
      <PasswordInput placeholder={placeholder} {...registerProps} />
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
