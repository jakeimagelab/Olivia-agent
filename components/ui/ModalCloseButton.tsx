import { X } from "lucide-react";
import styles from "./ModalCloseButton.module.css";

export function ModalCloseButton({
  onClick,
  className = "",
  dark = false,
  absolute = false,
}: {
  onClick: () => void;
  className?: string;
  dark?: boolean;
  absolute?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label="닫기"
      className={[styles.button, dark ? styles.dark : "", absolute ? styles.absolute : "", className]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      <X aria-hidden="true" size={20} strokeWidth={2} />
    </button>
  );
}
