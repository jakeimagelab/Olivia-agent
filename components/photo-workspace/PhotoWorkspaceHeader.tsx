import styles from "./PhotoWorkspace.module.css";

export default function PhotoWorkspaceHeader() {
  return (
    <header className={styles.workspaceHeader}>
      <h1>사진작업실</h1>
      <p>사진 셀렉부터 RAW 매칭, 분류, 변환까지 한 곳에서 작업합니다.</p>
    </header>
  );
}
