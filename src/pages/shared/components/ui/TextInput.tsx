import { forwardRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { inputClassFor, INPUT_STYLE, type InputVariant } from "./inputClass";
import { NO_AUTOCOMPLETE_PROPS } from "../../../config";

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: string;
  required?: boolean;
  inputVariant?: InputVariant;
}

const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, required, inputVariant = "primary", className = "", style, ...rest },
  ref,
) {
  return (
    <div>
      {label && (
        <label className="mb-2 block text-[0.875rem] text-[#BABDC3]">
          {label}
          {required && <span className="text-accent"> *</span>}
        </label>
      )}
      <input
        ref={ref}
        {...NO_AUTOCOMPLETE_PROPS}
        aria-invalid={error ? true : undefined}
        className={`${inputClassFor(inputVariant)} ${className}`}
        style={{ ...INPUT_STYLE, ...style }}
        {...rest}
      />
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
});

export default TextInput;
