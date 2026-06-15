"use client";

import Image from "next/image";
import styles from "./Logo.module.css";

export function Logo() {
  return (
    <div className={styles.logo}>
      <Image
        src="/images/logo.png"
        alt="Logomarca CNV"
        width={240}
        height={80}
        className={styles.logoImage}
      />
    </div>
  );
}
