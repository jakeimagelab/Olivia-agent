"use client";

import dynamic from "next/dynamic";
import styles from "./OliviaMobileShell.module.css";

const PrompterWorkspace = dynamic(() => import("@/app/prompter/PrompterClient").then((module) => module.PrompterWorkspace), { ssr: false, loading: () => <div className={styles.emptyState}>프롬프터를 준비하고 있어요...</div> });

export default function MobilePrompter() {
  return <section className={`${styles.screenWithHeader} ${styles.mobilePrompter}`} aria-label="모바일 프롬프터" data-mobile-swipe-lock><PrompterWorkspace embedded /></section>;
}
