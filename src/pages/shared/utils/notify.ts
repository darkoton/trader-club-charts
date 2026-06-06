import { toast } from "react-toastify";
import { TOAST_SUCCESS_MS, TOAST_ERROR_MS, TOAST_INFO_MS } from "../../config";

/** Shared toast API wrapper — easy to swap later without touching pages. */
export const notify = {
  success(message: string) {
    toast.success(message, { autoClose: TOAST_SUCCESS_MS });
  },
  error(message: string) {
    toast.error(message, { autoClose: TOAST_ERROR_MS });
  },
  info(message: string) {
    toast.info(message, { autoClose: TOAST_INFO_MS });
  },
};
