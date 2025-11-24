import { calculateMargin } from "@/lib/utils/format";

export type VehicleStatus = "A faturar" | "Refaturamento" | "Licenciado";

export type Vehicle = {
  id: string;
  date: string;
  model: string;
  version: string;
  color: string;
  modelYear: string;
  optional?: string;
  status: VehicleStatus;
  supplierCode: string;
  supplierName: string;
  sitePrice: number;
  salePrice: number;
  logistics?: string;
  lastUpdate: string;
  flags?: {
    duplicate?: boolean;
    outlier?: boolean;
    stale?: boolean;
  };
};

const rawVehicles: Omit<Vehicle, "flags">[] = [
  {
    id: "argo-1",
    date: "2025-10-06T10:30:00Z",
    model: "ARGO 1.0 ASPIRADO",
    version: "SÉRIE",
    color: "CINZA SILVERSTONE",
    modelYear: "25/26",
    optional: "SÉRIE",
    status: "A faturar",
    supplierCode: "ATAC.",
    supplierName: "Atacadão Jeep/RAM e BYD",
    salePrice: 77900,
    sitePrice: 94980,
    logistics: "Transportadora Fênix",
    lastUpdate: "2025-10-06T13:45:00Z"
  },
  {
    id: "argo-2",
    date: "2025-10-06T10:30:00Z",
    model: "ARGO DRIVE 1.0",
    version: "MT",
    color: "BRANCO BANCHISA",
    modelYear: "25/26",
    optional: "ISENTO DE IPVA",
    status: "A faturar",
    supplierCode: "ATAC.",
    supplierName: "Atacadão Jeep/RAM e BYD",
    salePrice: 83900,
    sitePrice: 95480,
    logistics: "Transportadora Fênix",
    lastUpdate: "2025-10-06T13:45:00Z"
  },
  {
    id: "argo-3",
    date: "2025-10-10T14:00:00Z",
    model: "CRONOS DRIVE 1.0",
    version: "MT",
    color: "CINZA SILVERSTONE",
    modelYear: "25/26",
    optional: "PACK DRIVE PLUS",
    status: "A faturar",
    supplierCode: "ATAC.",
    supplierName: "Atacadão Jeep/RAM e BYD",
    salePrice: 102900,
    sitePrice: 112070,
    logistics: "Transportadora Fênix",
    lastUpdate: "2025-10-17T19:12:00Z"
  },
  {
    id: "argo-4",
    date: "2025-09-30T09:00:00Z",
    model: "ARGO TREKKING MT",
    version: "TREKKING TOP",
    color: "PRETO VULCANO",
    modelYear: "25/26",
    optional: "TREKKING TOP",
    status: "A faturar",
    supplierCode: "ATAC.",
    supplierName: "Atacadão Jeep/RAM e BYD",
    salePrice: 108900,
    sitePrice: 121570,
    logistics: "Transportadora Fênix",
    lastUpdate: "2025-10-10T08:02:00Z"
  },
  {
    id: "argo-5",
    date: "2025-10-06T10:30:00Z",
    model: "ARGO DRIVE 1.3 AT",
    version: "S-DESIGN",
    color: "PRETO",
    modelYear: "25/26",
    optional: "S-DESIGN",
    status: "Licenciado",
    supplierCode: "VENTU",
    supplierName: "Ventura Motors",
    salePrice: 112890,
    sitePrice: 121570,
    logistics: "Transportadora Rápida",
    lastUpdate: "2025-10-06T16:52:00Z"
  },
  {
    id: "argo-6",
    date: "2025-10-06T10:30:00Z",
    model: "ARGO DRIVE 1.3 AT",
    version: "ISENTO DE IPVA",
    color: "CINZA SILVERSTONE",
    modelYear: "25/26",
    optional: "ISENTO DE IPVA",
    status: "Refaturamento",
    supplierCode: "VENTU",
    supplierName: "Ventura Motors",
    salePrice: 107900,
    sitePrice: 117480,
    logistics: "Transportadora Norte Sul",
    lastUpdate: "2025-10-01T10:12:00Z"
  },
  {
    id: "argo-7",
    date: "2025-10-06T10:30:00Z",
    model: "ARGO DRIVE 1.3 AT",
    version: "SÉRIE",
    color: "BRANCO BANCHISA",
    modelYear: "25/26",
    optional: "SÉRIE",
    status: "A faturar",
    supplierCode: "BEST",
    supplierName: "Best Distribuidora",
    salePrice: 109900,
    sitePrice: 118480,
    logistics: "Transportadora Norte Sul",
    lastUpdate: "2025-09-20T10:12:00Z"
  },
  {
    id: "argo-duplicate-1",
    date: "2025-10-06T10:30:00Z",
    model: "ARGO DRIVE 1.0",
    version: "MT",
    color: "BRANCO BANCHISA",
    modelYear: "25/26",
    optional: "ISENTO DE IPVA",
    status: "A faturar",
    supplierCode: "BEST",
    supplierName: "Best Distribuidora",
    salePrice: 83500,
    sitePrice: 95480,
    logistics: "Transportadora Norte Sul",
    lastUpdate: "2025-10-06T11:52:00Z"
  },
  {
    id: "argo-outlier-1",
    date: "2025-10-12T10:30:00Z",
    model: "CRONOS DRIVE 1.3 AT",
    version: "S-DESIGN",
    color: "PRETO",
    modelYear: "25/26",
    optional: "S-DESIGN",
    status: "A faturar",
    supplierCode: "VENTU",
    supplierName: "Ventura Motors",
    salePrice: 104900,
    sitePrice: 104900,
    logistics: "Transportadora Fênix",
    lastUpdate: "2025-10-12T09:00:00Z"
  }
];

const MARGIN_OUTLIER_THRESHOLD = 18000;
const STALE_THRESHOLD_DAYS = 7;

function flagVehicles(data: Omit<Vehicle, "flags">[]): Vehicle[] {
  const duplicates = new Map<string, number>();

  data.forEach(vehicle => {
    const key = `${vehicle.model}-${vehicle.version}-${vehicle.color}`;
    duplicates.set(key, (duplicates.get(key) || 0) + 1);
  });

  const now = new Date("2025-10-20T00:00:00Z");

  return data.map(vehicle => {
    const margin = calculateMargin(vehicle.sitePrice, vehicle.salePrice);
    const key = `${vehicle.model}-${vehicle.version}-${vehicle.color}`;
    const duplicate = (duplicates.get(key) || 0) > 1;

    const lastUpdate = new Date(vehicle.lastUpdate);
    const stale =
      (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24) >
      STALE_THRESHOLD_DAYS;
    const outlier = Math.abs(margin) > MARGIN_OUTLIER_THRESHOLD || margin < 0;

    return {
      ...vehicle,
      flags: {
        duplicate,
        outlier,
        stale
      }
    };
  });
}

export function getVehicles(): Vehicle[] {
  return flagVehicles(rawVehicles);
}

