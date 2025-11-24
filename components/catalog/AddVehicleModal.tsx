"use client";

import { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import type { Supplier } from "@/lib/data/providers";
import type { VehicleStatus } from "@/lib/data/vehicles";
import styles from "./AddVehicleModal.module.css";

export type VehicleDraft = {
  model: string;
  version: string;
  color: string;
  modelYear: string;
  status: VehicleStatus;
  optional?: string;
  sitePrice: number;
  salePrice: number;
  supplierCode: string;
  logistics?: string;
};

type Props = {
  open: boolean;
  suppliers: Supplier[];
  onClose: () => void;
  onSubmit: (draft: VehicleDraft) => void;
};

const emptyDraft: Omit<VehicleDraft, "sitePrice" | "salePrice"> & {
  sitePrice: string;
  salePrice: string;
} = {
  model: "",
  version: "",
  color: "",
  modelYear: "",
  status: "A faturar",
  optional: "",
  supplierCode: "",
  logistics: "",
  salePrice: "",
  sitePrice: ""
};

export function AddVehicleModal({
  open,
  suppliers,
  onClose,
  onSubmit
}: Props) {
  const [form, setForm] = useState(emptyDraft);

  if (!open) {
    return null;
  }

  const handleChange = (field: keyof typeof form, value: string) => {
    setForm(current => ({
      ...current,
      [field]: value
    }));
  };

  const parseCurrency = (value: string) => {
    const normalized = value
      .replace(/\s/g, "")
      .replace(/R\$/gi, "")
      .replace(/\./g, "")
      .replace(",", ".")
      .trim();
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.model || !form.version || !form.color || !form.modelYear) {
      return;
    }
    if (!form.salePrice || !form.sitePrice) {
      return;
    }
    const salePrice = parseCurrency(form.salePrice);
    const sitePrice = parseCurrency(form.sitePrice);
    onSubmit({
      model: form.model,
      version: form.version,
      color: form.color,
      modelYear: form.modelYear,
      status: form.status,
      optional: form.optional || undefined,
      logistics: form.logistics || undefined,
      supplierCode: form.supplierCode,
      salePrice,
      sitePrice
    });
    setForm(emptyDraft);
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className={styles.dialog} onClick={event => event.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Adicionar veículo</h2>
            <p className={styles.description}>
              Preencha os dados principais conforme planilha padrão. A margem é calculada
              automaticamente após salvar.
            </p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Fechar modal de cadastro"
          >
            ×
          </button>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.fieldGroup}>
            <div className={styles.field}>
              <span className={styles.label}>Modelo</span>
              <input
                className={styles.control}
                value={form.model}
                onChange={event => handleChange("model", event.target.value)}
                placeholder="Ex.: ARGO DRIVE 1.0"
                required
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Versão</span>
              <input
                className={styles.control}
                value={form.version}
                onChange={event => handleChange("version", event.target.value)}
                placeholder="Ex.: MT"
                required
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Cor</span>
              <input
                className={styles.control}
                value={form.color}
                onChange={event => handleChange("color", event.target.value)}
                placeholder="Ex.: Branco Banchisa"
                required
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Ano/Modelo</span>
              <input
                className={styles.control}
                value={form.modelYear}
                onChange={event => handleChange("modelYear", event.target.value)}
                placeholder="25/26"
                required
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.field}>
              <span className={styles.label}>Status</span>
              <select
                className={styles.control}
                value={form.status}
                onChange={event =>
                  handleChange("status", event.target.value as VehicleStatus)
                }
              >
                <option value="A faturar">A faturar</option>
                <option value="Refaturamento">Refaturamento</option>
                <option value="Licenciado">Licenciado</option>
              </select>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Fornecedor</span>
              <select
                className={styles.control}
                value={form.supplierCode}
                onChange={event => handleChange("supplierCode", event.target.value)}
              >
                <option value="">Selecionar</option>
                {suppliers.map(supplier => (
                  <option key={supplier.id} value={supplier.code}>
                    {supplier.code} · {supplier.name}
                  </option>
                ))}
              </select>
              <span className={styles.helper}>
                Utiliza código padrão para cálculo de duplicidade.
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Preço venda</span>
              <input
                className={styles.control}
                value={form.salePrice}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleChange("salePrice", event.target.value)
                }
                placeholder="R$ 99.990,00"
                inputMode="decimal"
                required
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Preço site montadora</span>
              <input
                className={styles.control}
                value={form.sitePrice}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  handleChange("sitePrice", event.target.value)
                }
                placeholder="R$ 108.990,00"
                inputMode="decimal"
                required
              />
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.field}>
              <span className={styles.label}>Opcional / Observações</span>
              <input
                className={styles.control}
                value={form.optional}
                onChange={event => handleChange("optional", event.target.value)}
                placeholder="Pack S-Design, pronto faturamento..."
              />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Transportadora</span>
              <input
                className={styles.control}
                value={form.logistics}
                onChange={event => handleChange("logistics", event.target.value)}
                placeholder="Nome da transportadora"
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className={styles.submitButton}>
              Salvar veículo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
