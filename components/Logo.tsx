"use client";

import styles from "./Logo.module.css";

export function Logo() {
  return (
    <div className={styles.logo}>
      <div className={styles.mark}>ZKM</div>
      <div className={styles.text}>
        <span className={styles.primary}>Zero</span>
        <span className={styles.secondary}>Kilômetro</span>
      </div>
    </div>
  );
}

