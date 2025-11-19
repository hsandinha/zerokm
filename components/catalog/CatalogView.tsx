"use client";

import { useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { Vehicle } from "@/lib/data/vehicles";
import type { Supplier } from "@/lib/data/providers";
import styles from "./CatalogView.module.css";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { Badge } from "../Badge";
import { AddVehicleModal, type VehicleDraft } from "./AddVehicleModal";

type Props = {
  vehicles: Vehicle[];
  suppliers: Supplier[];
};

type Filters = {
  model: string;
  color: string;
  status: string;
  supplier: string;
  showDuplicates: boolean;
  showOutliers: boolean;
};

const initialFilters: Filters = {
  model: "todos",
  color: "todas",
  status: "todos",
  supplier: "todos",
  showDuplicates: true,
  showOutliers: true
};

export function CatalogView({ vehicles, suppliers }: Props) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [query, setQuery] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [lastCreatedVehicle, setLastCreatedVehicle] = useState<VehicleDraft | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const models = useMemo(
    () => Array.from(new Set(vehicles.map(vehicle => vehicle.model))).sort(),
    [vehicles]
  );
  const colors = useMemo(
    () => Array.from(new Set(vehicles.map(vehicle => vehicle.color))).sort(),
    [vehicles]
  );

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(vehicle => {
      if (filters.model !== "todos" && vehicle.model !== filters.model) {
        return false;
      }
      if (filters.color !== "todas" && vehicle.color !== filters.color) {
        return false;
      }
      if (filters.status !== "todos" && vehicle.status !== filters.status) {
        return false;
      }
      if (
        filters.supplier !== "todos" &&
        vehicle.supplierCode !== filters.supplier
      ) {
        return false;
      }
      if (!filters.showDuplicates && vehicle.flags?.duplicate) {
        return false;
      }
      if (!filters.showOutliers && vehicle.flags?.outlier) {
        return false;
      }
      if (query) {
        const searchable = `${vehicle.model} ${vehicle.version} ${vehicle.color} ${vehicle.supplierName}`.toLowerCase();
        if (!searchable.includes(query.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [vehicles, filters, query]);

  const duplicatesCount = vehicles.filter(v => v.flags?.duplicate).length;
  const outliersCount = vehicles.filter(v => v.flags?.outlier).length;

  const handleAddVehicle = () => {
    setIsAddModalOpen(true);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setLastCreatedVehicle(null);
    }
  };

  const handleModalClose = () => {
    setIsAddModalOpen(false);
  };

  const handleModalSubmit = (draft: VehicleDraft) => {
    setLastCreatedVehicle(draft);
    setIsAddModalOpen(false);
  };

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <h1>Veículos Zero KM</h1>
          <p>
            {filteredVehicles.length} resultados · Margem calculada
            automaticamente
          </p>
        </div>
        <div className={styles.headerBadges}>
          <Badge variant="warning">Duplicados: {duplicatesCount}</Badge>
          <Badge variant="danger">Outliers: {outliersCount}</Badge>
        </div>
      </header>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryButton} onClick={handleAddVehicle}>
          Adicionar veículo
        </button>
        <button type="button" className={styles.secondaryButton} onClick={handleUploadClick}>
          Upload planilha (.xlsx/.csv)
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        {uploadedFileName ? (
          <span className={styles.uploadInfo}>Arquivo selecionado: {uploadedFileName}</span>
        ) : null}
      </div>

      {lastCreatedVehicle ? (
        <div className={styles.notice}>
          <strong>Veículo salvo (mock)</strong>
          <span>
            {lastCreatedVehicle.model} {lastCreatedVehicle.version} ·{" "}
            {formatCurrency(lastCreatedVehicle.sitePrice - lastCreatedVehicle.salePrice)} de margem.
          </span>
        </div>
      ) : null}

      <section className={styles.filters}>
        <div className={styles.filterRow}>
          <label className={styles.fieldLabel}>
            Busca
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Modelo, versão, fornecedor..."
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </label>
          <label className={styles.fieldLabel}>
            Modelo
            <select
              className={styles.fieldControl}
              value={filters.model}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  model: event.target.value
                }))
              }
            >
              <option value="todos">Todos</option>
              {models.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Cor
            <select
              className={styles.fieldControl}
              value={filters.color}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  color: event.target.value
                }))
              }
            >
              <option value="todas">Todas</option>
              {colors.map(color => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Status
            <select
              className={styles.fieldControl}
              value={filters.status}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  status: event.target.value
                }))
              }
            >
              <option value="todos">Todos</option>
              <option value="A FATURAR">A FATURAR</option>
              <option value="PRONTA ENTREGA">PRONTA ENTREGA</option>
              <option value="EM TRÂNSITO">EM TRÂNSITO</option>
            </select>
          </label>
          <label className={styles.fieldLabel}>
            Fornecedor
            <select
              className={styles.fieldControl}
              value={filters.supplier}
              onChange={event =>
                setFilters(current => ({
                  ...current,
                  supplier: event.target.value
                }))
              }
            >
              <option value="todos">Todos</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.code}>
                  {supplier.code} · {supplier.name}
                </option>
              ))}
            </select>
          </label>

        </div>

        <div className={styles.toggles}>
          <label className={styles.toggleLabel}>
            <input
              className={styles.toggleCheckbox}
              type="checkbox"
              checked={filters.showDuplicates}
              onChange={() =>
                setFilters(current => ({
                  ...current,
                  showDuplicates: !current.showDuplicates
                }))
              }
            />
            Exibir duplicados
          </label>
          <label className={styles.toggleLabel}>
            <input
              className={styles.toggleCheckbox}
              type="checkbox"
              checked={filters.showOutliers}
              onChange={() =>
                setFilters(current => ({
                  ...current,
                  showOutliers: !current.showOutliers
                }))
              }
            />
            Exibir outliers
          </label>
        </div>
      </section>

      <div className="scroll-container">
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Data</th>
              <th>Veículo</th>
              <th>Versão</th>
              <th>Cor</th>
              <th>Ano/Mod</th>
              <th>Status</th>
              <th>Fornecedor</th>
              <th>Preço Venda</th>
              <th>Site Montadora</th>
              <th>Margem (R$)</th>
              <th>Logística</th>
              <th>Atualização</th>
              <th>Alertas</th>
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.map(vehicle => {
              const margin = vehicle.sitePrice - vehicle.salePrice;
              return (
                <tr
                  key={vehicle.id}
                  className={[
                    vehicle.flags?.duplicate ? styles.duplicateRow : "",
                    vehicle.flags?.outlier ? styles.outlierRow : "",
                    vehicle.flags?.stale ? styles.staleRow : ""
                  ].join(" ")}
                >
                  <td>{formatDate(vehicle.date)}</td>
                  <td>
                    <strong>{vehicle.model}</strong>
                  </td>
                  <td>{vehicle.version}</td>
                  <td>{vehicle.color}</td>
                  <td>{vehicle.modelYear}</td>
                  <td>{vehicle.status}</td>
                  <td>
                    <span className={styles.supplierCode}>{vehicle.supplierCode}</span>
                    <span className={styles.supplierName}>{vehicle.supplierName}</span>
                  </td>
                  <td>{formatCurrency(vehicle.salePrice)}</td>
                  <td>{formatCurrency(vehicle.sitePrice)}</td>
                  <td className={margin >= 0 ? styles.positiveMargin : styles.negativeMargin}>
                    {formatCurrency(margin)}
                  </td>
                  <td>{vehicle.logistics ?? "-"}</td>
                  <td>{formatDate(vehicle.lastUpdate)}</td>
                  <td className={styles.alertsCell}>
                    {vehicle.flags?.duplicate ? (
                      <Badge variant="warning">Duplicado</Badge>
                    ) : null}
                    {vehicle.flags?.outlier ? (
                      <Badge variant="danger">Outlier</Badge>
                    ) : null}
                    {vehicle.flags?.stale ? (
                      <Badge variant="warning">Atenção atualização</Badge>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AddVehicleModal
        open={isAddModalOpen}
        suppliers={suppliers}
        onClose={handleModalClose}
        onSubmit={handleModalSubmit}
      />
    </div>
  );
}
