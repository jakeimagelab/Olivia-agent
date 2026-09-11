import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react";
import styles from "./OliviaMobileShell.module.css";

export default function MobileHeader({
  title,
  subtitle,
  onBack,
  onAdd,
  onMore,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onAdd?: () => void;
  onMore?: () => void;
}) {
  return (
    <header className={styles.screenHeader}>
      <div className={styles.screenHeaderSide}>
        {onBack ? <button type="button" onClick={onBack} aria-label="뒤로가기"><ArrowLeft size={22} /></button> : null}
      </div>
      <div className={styles.screenHeaderTitle}>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className={styles.screenHeaderSide}>
        {onAdd ? <button type="button" onClick={onAdd} aria-label={`${title} 추가`}><Plus size={22} /></button> : null}
        {onMore ? <button type="button" onClick={onMore} aria-label="더보기"><MoreHorizontal size={23} /></button> : null}
      </div>
    </header>
  );
}

