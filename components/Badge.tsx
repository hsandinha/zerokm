"use client";

import styles from "./Badge.module.css";

type BadgeProps = {
  variant?: "default" | "warning" | "danger" | "success" | "info" | "admin" | "operator" | "dealership" | "client";
  children: React.ReactNode;
};

export function Badge({ variant = "default", children }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[variant]}`}>{children}</span>;
}

