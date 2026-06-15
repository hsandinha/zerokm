"use client";

import type { AuditLog } from "@/lib/data/audit.js";
import styles from "./AuditTimeline.module.css";
import { formatDateTime } from "@/lib/utils/format";

type Props = {
  logs: AuditLog[];
};

export function AuditTimeline({ logs }: Props) {
  return (
    <div className={styles.wrapper}>
      <h1>Auditoria do Sistema</h1>
      <p className={styles.subtitle}>
        Registro completo das ações relevantes para segurança e análise de uso.
      </p>
      <ul className={styles.list}>
        {logs.map(log => (
          <li key={log.id} className={styles.item}>
            <div className={styles.meta}>
              <span className={styles.user}>{log.user}</span>
              <span className={styles.role}>{log.role}</span>
              <time dateTime={log.timestamp}>{formatDateTime(log.timestamp)}</time>
            </div>
            <div className={styles.action}>
              <strong>{log.action}</strong>
              <span className={styles.target}>{log.target}</span>
            </div>
            {log.details ? <p className={styles.details}>{log.details}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

