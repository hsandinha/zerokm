"use client";

import type { AutomationRule, MarginRule } from "@/lib/data/settings";
import styles from "./SettingsPanel.module.css";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { Badge } from "../Badge";

type Props = {
  marginRules: MarginRule[];
  automationRules: AutomationRule[];
};

export function SettingsPanel({ marginRules, automationRules }: Props) {
  return (
    <div className={styles.wrapper}>
      <section>
        <header className={styles.sectionHeader}>
          <div>
            <h1>Margens por Versão</h1>
            <p>Parâmetros para cálculo automático de lucro.</p>
          </div>
          <button type="button" className={styles.actionButton}>
            Adicionar regra
          </button>
        </header>
        <div className="scroll-container">
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Modelo / Versão</th>
                <th>Margem mínima</th>
                <th>Margem alvo</th>
                <th>Margem máxima</th>
                <th>Última atualização</th>
                <th>Por</th>
              </tr>
            </thead>
            <tbody>
              {marginRules.map(rule => (
                <tr key={rule.id}>
                  <td>
                    <strong>{rule.model}</strong>
                    <span className={styles.version}>{rule.version}</span>
                  </td>
                  <td>{formatCurrency(rule.minMargin)}</td>
                  <td>{formatCurrency(rule.targetMargin)}</td>
                  <td>{formatCurrency(rule.maxMargin)}</td>
                  <td>{formatDateTime(rule.lastUpdate)}</td>
                  <td>{rule.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Automação de Regras</h2>
            <p>Fluxos que garantem higienização do estoque e alertas proativos.</p>
          </div>
          <button type="button" className={styles.actionButton}>
            Configurar
          </button>
        </header>
        <ul className={styles.automationList}>
          {automationRules.map(rule => (
            <li key={rule.id} className={styles.automationItem}>
              <div>
                <strong>{rule.name}</strong>
                <p>{rule.description}</p>
              </div>
              <div className={styles.automationMeta}>
                <Badge variant={rule.status === "ativo" ? "success" : "info"}>
                  {rule.status}
                </Badge>
                <span>{rule.value}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.future}>
        <h2>Próximas integrações</h2>
        <p>
          Arquitetura preparada para IA: monitoramento automático de concorrentes,
          pesquisa de satisfação com voz sintetizada e geração de alertas preditivos.
        </p>
      </section>
    </div>
  );
}

