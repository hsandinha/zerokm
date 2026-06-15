"use client";

import styles from "./FunnelChart.module.css";

type FunnelStage = {
  stage: string;
  value: number;
};

type Props = {
  data: FunnelStage[];
};

export function FunnelChart({ data }: Props) {
  const max = Math.max(...data.map(item => item.value));

  return (
    <div className={styles.container}>
      {data.map((item, index) => {
        const width = (item.value / max) * 100;
        return (
          <div key={item.stage} className={styles.stage}>
            <div className={styles.meta}>
              <span className={styles.label}>{item.stage}</span>
              <span className={styles.value}>{item.value}</span>
            </div>
            <div className={styles.barWrapper}>
              <div
                className={styles.bar}
                style={{
                  width: `${width}%`,
                  opacity: 1 - index * 0.1
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

