import Modal from "./Modal";

interface IdInfoModalProps {
  open: boolean;
  onClose: () => void;
}

export default function IdInfoModal({ open, onClose }: IdInfoModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Зачем вам мой ID?"
      titleIcon={
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-contrast">
          !
        </span>
      }
    >
      <p>
        Если у вас уже есть аккаунт на брокере POCKET без реферальной системы, вам нужно создать
        новый по нашей ссылке, иначе вы не сможете пользоваться этим сервисом.
      </p>
    </Modal>
  );
}
