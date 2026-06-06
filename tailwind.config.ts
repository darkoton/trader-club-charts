import { type Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Tailwind config for the public marketing pages.
 *
 * Colors are defined via `rgb(var(--token, <fallback>) / <alpha-value>)` so:
 *   • every Tailwind opacity modifier works (bg-accent/20, border-accent/30…)
 *   • if the CSS variable somehow isn't reachable, the hardcoded fallback
 *     RGB triplet is used — guarantees brand colors never degrade to a
 *     transparent / legacy value.
 *
 * Token values live in `src/pages/styles/pages.css` (at :root).
 */
function withAlpha(variable: string, fallback: string): string {
  return `rgb(var(${variable}, ${fallback}) / <alpha-value>)`;
}

export default {
  content: ["./index.html", "./src/pages/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "16px",
        sm: "24px",
        lg: "32px",
        xl: "40px",
      },
      screens: {
        sm: "480px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1488px",
      },
    },
    screens: {
      sm: "480px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1488px",
    },
    extend: {
      fontFamily: {
        heading: ["Unbounded", "sans-serif"],
        body: ["Montserrat", "sans-serif"],
      },
      colors: {
        background: withAlpha("--page-bg", "11 14 23"),
        "background-secondary": withAlpha("--page-bg-secondary", "13 15 26"),
        card: withAlpha("--page-card", "13 15 26"),
        "card-hover": withAlpha("--page-card-hover", "16 18 30"),
        elevated: withAlpha("--page-elevated", "20 23 34"),
        "input-bg": withAlpha("--page-input-bg", "8 10 18"),
        border: withAlpha("--page-border", "255 255 255"),
        "border-accent": withAlpha("--page-border-accent", "128 178 255"),

        accent: withAlpha("--page-accent", "128 178 255"),
        "accent-hover": withAlpha("--page-accent-hover", "156 194 255"),
        "accent-contrast": withAlpha("--page-accent-contrast", "11 26 51"),

        danger: withAlpha("--page-danger", "255 90 120"),
      },
      boxShadow: {
        accent: "0 0 20px rgb(var(--page-accent, 128 178 255) / 0.3)",
        "accent-lg": "0 0 40px rgb(var(--page-accent, 128 178 255) / 0.45)",
      },
      borderRadius: {
        lg: "12px",
        md: "8px",
        sm: "6px",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
      },
    },
  },
  future: {
    hoverOnlyWhenSupported: true,
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
