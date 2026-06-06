import Modal from "./Modal";
import Button from "../ui/Button";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button uses the dark (neutral) variant. */
  neutral?: boolean;
  loading?: boolean;
}

/**
 * Yes/no confirmation dialog. Used e.g. for "Выйти из аккаунта?".
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  neutral = false,
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={neutral ? "dark" : "primary"}
            fullWidth
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && <p>{description}</p>}
    </Modal>
  );
}
