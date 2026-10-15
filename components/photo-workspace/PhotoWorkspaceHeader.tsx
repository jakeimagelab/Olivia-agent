import styles from "./PhotoWorkspace.module.css";

export default function PhotoWorkspaceHeader() {
  return (
    <header className={styles.workspaceHeader}>
      <h1>사진작업실</h1>
      <p>촬영 콘티와 JPG정리부터 사진 셀렉, RAW 매칭, 분류, 파일 정리와 보정까지 한 곳에서 작업합니다.</p>
    </header>
  );
}
