"use client";

import styles from "./SummaryCard.module.css";

type SummaryCardProps = {
  title: string;
  value: string;
  subtitle?: string;
  accent?: "default" | "warning" | "danger" | "success";
  change?: string;
  trend?: "up" | "down" | "neutral";
  icon?: string;
};

export function SummaryCard({
  title,
  value,
  subtitle,
  accent = "default",
  change,
  trend,
  icon
}: SummaryCardProps) {
  return (
    <article className={`${styles.card} ${styles[accent]}`}>
      <header className={styles.header}>
        {icon && <span className={styles.icon}>{icon}</span>}
        {title}
      </header>
      <strong className={styles.value}>{value}</strong>
      {change && (
        <div className={`${styles.change} ${trend ? styles[trend] : ""}`}>
          {change}
        </div>
      )}
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </article>
  );
}

