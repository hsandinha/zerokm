"use client";

import styles from "./SemaforoIndicator.module.css";

type Props = {
  status: "verde" | "amarelo" | "vermelho";
  label: string;
  detail?: string;
};

export function SemaforoIndicator({ status, label, detail }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.lights}>
        <span className={`${styles.light} ${styles.on} ${styles[status]}`} />
        <span
          className={`${styles.light} ${status === "amarelo" ? styles.on : ""} ${styles.amarelo}`}
        />
        <span
          className={`${styles.light} ${status === "vermelho" ? styles.on : ""} ${styles.vermelho}`}
        />
      </div>
      <div>
        <strong className={styles.label}>{label}</strong>
        {detail ? <p className={styles.detail}>{detail}</p> : null}
      </div>
    </div>
  );
}

