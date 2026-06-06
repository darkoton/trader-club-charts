import { useEffect, useEffectEvent, useRef, useState } from "react";
import routes from "../../../configs/routes";
import { GOOGLE_CLIENT_ID } from "../../config";
import {
  ApiError,
  getStoredBotRef,
  getStoredUtm,
  isDepositRequiredError,
  loginWithGoogle,
  persistDepositRequiredPayload,
} from "../../shared/api/terminalAuth";
import { usePublicI18n } from "../../shared/publicI18n";
import { getValidationMessages, localizeAuthApiError } from "../../shared/utils/validationMessages";
import { notify } from "../../shared/utils/notify";
import { useNavigate } from "react-router-dom";

type GoogleAuthMode = "login" | "register";

interface GoogleAuthButtonProps {
  mode: GoogleAuthMode;
  search: string;
}

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  use_fedcm_for_button?: boolean;
  ux_mode?: "popup" | "redirect";
}

interface GoogleButtonConfiguration {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
}

interface GoogleAccountsIdApi {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsIdApi;
      };
    };
  }
}

const GOOGLE_GSI_SRC = "https://accounts.google.com/gsi/client";
const GOOGLE_BUTTON_MAX_WIDTH = 400;
const GOOGLE_BUTTON_NATIVE_HEIGHT = 40;
const GOOGLE_BUTTON_VISIBLE_HEIGHT = 48;

function GoogleIcon({ muted = false }: { muted?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={muted ? "opacity-60" : undefined}
    >
      <path
        d="M23.04 12.2615C23.04 11.4459 22.9668 10.6615 22.8309 9.90918H12V14.3578H18.1895C17.9227 15.7953 17.1123 17.0122 15.8955 17.8278V20.7122H19.6091C21.7827 18.7103 23.04 15.7634 23.04 12.2615Z"
        fill="#4285F4"
      />
      <path
        d="M12 23.4997C15.105 23.4997 17.7086 22.4703 19.6091 20.7122L15.8955 17.8278C14.8664 18.5172 13.5509 18.9284 12 18.9284C9.00409 18.9284 6.46864 16.9059 5.56591 14.1865H1.72726V17.1653C3.61726 20.9203 7.50136 23.4997 12 23.4997Z"
        fill="#34A853"
      />
      <path
        d="M5.56591 14.1864C5.33636 13.4971 5.205 12.7609 5.205 11.9996C5.205 11.2382 5.33636 10.5021 5.56591 9.81273V6.83398H1.72726C0.949091 8.38455 0.505909 10.1387 0.505909 11.9996C0.505909 13.8605 0.949091 15.6146 1.72726 17.1652L5.56591 14.1864Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.07091C13.6923 5.07091 15.2114 5.65273 16.4059 6.79636L19.6923 3.50999C17.7032 1.64909 15.0995 0.5 12 0.5C7.50136 0.5 3.61726 3.07955 1.72726 6.83455L5.56591 9.81318C6.46864 7.09364 9.00409 5.07091 12 5.07091Z"
        fill="#EA4335"
      />
    </svg>
  );
}

let googleScriptPromise: Promise<void> | null = null;

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScriptPromise) return googleScriptPromise;

  googleScriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_GSI_SRC}"]`);

    const handleLoad = () => resolve();
    const handleError = () => {
      googleScriptPromise = null;
      reject(new Error("Google Identity Services failed to load"));
    };

    if (existingScript) {
      existingScript.addEventListener("load", handleLoad, { once: true });
      existingScript.addEventListener("error", handleError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = GOOGLE_GSI_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

function readSearchValue(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key)?.trim();
  return value || undefined;
}

function buildGoogleOptions(search: string) {
  const params = new URLSearchParams(search);
  const storedUtm = getStoredUtm();
  const utm = {
    utm_source: readSearchValue(params, "utm_source") ?? storedUtm.utm_source,
    utm_campaign: readSearchValue(params, "utm_campaign") ?? storedUtm.utm_campaign,
    utm_medium: readSearchValue(params, "utm_medium") ?? storedUtm.utm_medium,
    utm_term: readSearchValue(params, "utm_term") ?? storedUtm.utm_term,
    utm_content: readSearchValue(params, "utm_content") ?? storedUtm.utm_content,
  };

  return {
    ref_code: readSearchValue(params, "ref") ?? getStoredBotRef() ?? undefined,
    bot: readSearchValue(params, "bot"),
    al: readSearchValue(params, "al"),
    click_id: readSearchValue(params, "click_id"),
    site_id: readSearchValue(params, "site_id"),
    sub_id1: readSearchValue(params, "sub_id1"),
    sub_id2: readSearchValue(params, "sub_id2"),
    sub_id3: readSearchValue(params, "sub_id3"),
    sub_id4: readSearchValue(params, "sub_id4"),
    sub_id5: readSearchValue(params, "sub_id5"),
    utm,
  };
}

export default function GoogleAuthButton({ mode, search }: GoogleAuthButtonProps) {
  const navigate = useNavigate();
  const { locale, publicT } = usePublicI18n();
  const messages = getValidationMessages(locale);
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [buttonWidth, setButtonWidth] = useState(GOOGLE_BUTTON_MAX_WIDTH);

  const handleCredentialResponse = useEffectEvent(async (response: GoogleCredentialResponse) => {
    const credential = response.credential?.trim();
    if (!credential || isSubmitting) {
      if (!isSubmitting) notify.error(mode === "login" ? messages.loginError : messages.registerError);
      return;
    }

    setIsSubmitting(true);
    try {
      const auth = await loginWithGoogle(credential, buildGoogleOptions(search));
      navigate(auth.is_confirmed ? routes.Terminal : routes.RegisterStep2);
    } catch (err) {
      if (err instanceof ApiError && isDepositRequiredError(err)) {
        persistDepositRequiredPayload(err);
        notify.error(messages.confirmDepositRequired);
        navigate(routes.RegisterStep2);
        return;
      }
      notify.error(
        err instanceof ApiError
          ? localizeAuthApiError(err.message, messages, mode === "login" ? messages.loginError : messages.registerError)
          : mode === "login"
            ? messages.loginError
            : messages.registerError,
      );
    } finally {
      setIsSubmitting(false);
    }
  });

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(button.getBoundingClientRect().width);
      if (nextWidth > 0) {
        setButtonWidth(Math.min(nextWidth, GOOGLE_BUTTON_MAX_WIDTH));
      }
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(button);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !containerRef.current) return;

    let disposed = false;
    setIsReady(false);
    setIsUnavailable(false);

    void loadGoogleScript()
      .then(() => {
        if (disposed || !containerRef.current) return;

        const googleId = window.google?.accounts?.id;
        if (!googleId) return;

        const container = containerRef.current;
        container.innerHTML = "";

        googleId.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            void handleCredentialResponse(response);
          },
          ux_mode: "popup",
        });

        googleId.renderButton(container, {
          theme: "outline",
          size: "large",
          shape: "rectangular",
          logo_alignment: "left",
          text: mode === "register" ? "signup_with" : "signin_with",
          width: GOOGLE_BUTTON_MAX_WIDTH,
        });

        setIsReady(true);
      })
      .catch(() => {
        if (!disposed) setIsUnavailable(true);
      });

    return () => {
      disposed = true;
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [mode]);

  if (!GOOGLE_CLIENT_ID || isUnavailable) return null;

  const isDisabled = isSubmitting || !isReady;
  const scaleX = buttonWidth / GOOGLE_BUTTON_MAX_WIDTH;
  const scaleY = GOOGLE_BUTTON_VISIBLE_HEIGHT / GOOGLE_BUTTON_NATIVE_HEIGHT;
  const buttonLabel = mode === "register" ? publicT.auth.googleRegisterButton : publicT.auth.googleButton;

  return (
    <div ref={buttonRef} className="relative h-12 w-full min-h-12" aria-busy={isSubmitting || !isReady || undefined}>
      <button
        type="button"
        disabled={isDisabled}
        className={[
          "pointer-events-none flex h-12 w-full min-h-12 items-center justify-center gap-3 rounded-full border px-6 text-[0.95rem] font-medium transition-colors duration-150",
          isDisabled
            ? "border-white/10 bg-[#141519] text-white/50"
            : "border-white/12 bg-[#141519] text-white group-hover:bg-[#1a1b20]",
        ].join(" ")}
      >
        {isSubmitting ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        ) : (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
              <GoogleIcon muted={!isReady} />
            </span>
            <span>{buttonLabel}</span>
          </>
        )}
      </button>

      <div
        className={[
          "absolute inset-0 z-10 overflow-hidden rounded-full",
          isDisabled ? "pointer-events-none" : "",
        ].join(" ")}
      >
        <div
          className="absolute left-0 top-0 opacity-[0.01]"
          style={{
            width: GOOGLE_BUTTON_MAX_WIDTH,
            height: GOOGLE_BUTTON_NATIVE_HEIGHT,
            transform: `scale(${scaleX}, ${scaleY})`,
            transformOrigin: "left top",
          }}
        >
          <div ref={containerRef} />
        </div>
      </div>
    </div>
  );
}