export type LogisticsPartner = {
  id: string;
  name: string;
  coverage: string;
  leadTime: string;
  contact: string;
  phone: string;
  baseFee: number;
  kmFee: number;
  notes?: string;
};

const partners: LogisticsPartner[] = [
  {
    id: "fenix",
    name: "Transportadora Fênix",
    coverage: "Sudeste, Centro-Oeste",
    leadTime: "3-5 dias",
    contact: "Márcio Andrade",
    phone: "(31) 98812-4450",
    baseFee: 820,
    kmFee: 2.8,
    notes: "Seguro incluso; permite rastreio em tempo real."
  },
  {
    id: "rapida",
    name: "Transportadora Rápida",
    coverage: "Sul, Sudeste",
    leadTime: "2-3 dias",
    contact: "Lorena Fernandes",
    phone: "(41) 99221-9988",
    baseFee: 950,
    kmFee: 3.25,
    notes: "Especializada em pronta entrega e veículos premium."
  },
  {
    id: "nortesul",
    name: "Norte Sul Log",
    coverage: "Nacional",
    leadTime: "5-7 dias",
    contact: "Ricardo Alves",
    phone: "(61) 98111-7712",
    baseFee: 1120,
    kmFee: 2.5,
    notes: "Oferece protocolo de conferência fotográfica."
  }
];

export function getLogisticsPartners(): LogisticsPartner[] {
  return partners;
}

