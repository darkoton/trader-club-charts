import { useState, forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { inputClassFor, INPUT_STYLE, type InputVariant } from "./inputClass";
import { NO_AUTOCOMPLETE_PROPS } from "../../../config";
import { EyeIcon, EyeOffIcon } from "../icons";

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  inputVariant?: InputVariant;
};

/**
 * Password input with eye-toggle button.
 * Uses inline styles on the toggle button to bypass Tailwind-Preflight gap
 * (pages are scoped to `.po-pages` and don't inherit the preflight resets).
 */
const PasswordInput = forwardRef<HTMLInputElement, InputProps>(function PasswordInput(props, ref) {
  const [show, setShow] = useState(false);
  const { style, inputVariant = "primary", ...rest } = props;

  return (
    <div className="relative">
      <input
        ref={ref}
        type={show ? "text" : "password"}
        {...NO_AUTOCOMPLETE_PROPS}
        className={`${inputClassFor(inputVariant)} pr-12`}
        style={{ ...INPUT_STYLE, ...style }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        tabIndex={-1}
        aria-label={show ? "Скрыть пароль" : "Показать пароль"}
        style={{
          position: "absolute",
          right: 16,
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#6b7280",
        }}
      >
        {show ? <EyeIcon size={20} /> : <EyeOffIcon size={20} />}
      </button>
    </div>
  );
});

export default PasswordInput;
