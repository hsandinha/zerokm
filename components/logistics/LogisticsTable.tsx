"use client";

import type { LogisticsPartner } from "@/lib/data/logistics";
import styles from "./LogisticsTable.module.css";
import { formatCurrency } from "@/lib/utils/format";

type Props = {
  partners: LogisticsPartner[];
};

export function LogisticsTable({ partners }: Props) {
  return (
    <div className={styles.wrapper}>
      <h1>Tabela de Transportadoras</h1>
      <p className={styles.subtitle}>
        Baseada no modelo apresentado por Marcio Bernardes – centraliza dados de frete, contato e SLA.
      </p>
      <div className="scroll-container">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Transportadora</th>
              <th>Cobertura</th>
              <th>Prazo médio</th>
              <th>Contato</th>
              <th>Telefone</th>
              <th>Taxa base</th>
              <th>Taxa / km</th>
              <th>Observações</th>
            </tr>
          </thead>
          <tbody>
            {partners.map(partner => (
              <tr key={partner.id}>
                <td>
                  <strong>{partner.name}</strong>
                </td>
                <td>{partner.coverage}</td>
                <td>{partner.leadTime}</td>
                <td>{partner.contact}</td>
                <td>{partner.phone}</td>
                <td>{formatCurrency(partner.baseFee)}</td>
                <td>{formatCurrency(partner.kmFee)}</td>
                <td>{partner.notes ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

