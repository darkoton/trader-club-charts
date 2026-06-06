/**
 * Shared input base styles. Used by `TextInput`, `PasswordInput`
 * and any ad-hoc search fields so all inputs look identical.
 *
 * Two visual variants are exposed:
 *   • primary — used in auth/forms. Bg #171717 / hover #1D1D1D / active #171717.
 *   • search  — used in blog search. Bg #101010 / hover #161616 / active #101010.
 *
 * Active state clears the placeholder (opacity 0).
 *
 * Tokens come from `config.ts` (INPUT_HEIGHT_PX / INPUT_RADIUS_PX).
 */
import { INPUT_HEIGHT_PX, INPUT_RADIUS_PX } from "../../../config";

export type InputVariant = "primary" | "search";

/** Base layout class — colors handled by `.po-input-*` variants in CSS. */
export const INPUT_CLASS =
  "po-input w-full px-5 " +
  "text-[0.9375rem] text-white outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function inputClassFor(variant: InputVariant = "primary"): string {
  return `${INPUT_CLASS} po-input-${variant}`;
}

/** Inline style with unified height/radius (colors go through CSS class). */
export const INPUT_STYLE = {
  height: `${INPUT_HEIGHT_PX}px`,
  borderRadius: `${INPUT_RADIUS_PX}px`,
  border: "none",
} as const;

export const INPUT_STYLE_TEXTAREA = {
  borderRadius: `${INPUT_RADIUS_PX - 16}px`,
  minHeight: `${INPUT_HEIGHT_PX * 2}px`,
  border: "none",
} as const;

export const INPUT_CLASS_TEXTAREA =
  "po-input po-input-primary w-full resize-y px-5 py-4 " +
  "text-[0.9375rem] text-white outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60";
