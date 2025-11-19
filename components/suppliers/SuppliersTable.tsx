"use client";

import { useMemo, useState } from "react";
import type { Supplier } from "@/lib/data/providers";
import styles from "./SuppliersTable.module.css";
import { formatDateTime } from "@/lib/utils/format";
import { Badge } from "../Badge";

type Props = {
  suppliers: Supplier[];
};

export function SuppliersTable({ suppliers }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) {
      return suppliers;
    }
    return suppliers.filter(supplier =>
      `${supplier.name} ${supplier.code} ${supplier.region}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [query, suppliers]);

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Fornecedores</h1>
          <p>Base completa para contato rápido durante a negociação.</p>
        </div>
        <label>
          Buscar
          <input
            type="search"
            placeholder="Nome, código ou região"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>
      </header>
      <div className="scroll-container">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Código</th>
              <th>Fornecedor</th>
              <th>DDD</th>
              <th>Telefone</th>
              <th>Contatos</th>
              <th>Região</th>
              <th>Veículos ativos</th>
              <th>Última interação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(supplier => (
              <tr key={supplier.id}>
                <td>{supplier.code}</td>
                <td>
                  <strong>{supplier.name}</strong>
                </td>
                <td>{supplier.ddd}</td>
                <td>{supplier.phone}</td>
                <td>
                  <ul className={styles.contacts}>
                    {supplier.contacts.map(contact => (
                      <li key={contact}>{contact}</li>
                    ))}
                  </ul>
                </td>
                <td>{supplier.region}</td>
                <td>
                  <Badge variant={supplier.activeVehicles > 150 ? "success" : "info"}>
                    {supplier.activeVehicles}
                  </Badge>
                </td>
                <td>{formatDateTime(supplier.lastInteraction)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

