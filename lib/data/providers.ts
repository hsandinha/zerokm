export type Supplier = {
  id: string;
  code: string;
  name: string;
  ddd: string;
  phone: string;
  contacts: string[];
  region: string;
  activeVehicles: number;
  lastInteraction: string;
};

const suppliers: Supplier[] = [
  {
    id: "atacado-jeep",
    code: "ATAC.",
    name: "Atacadão Jeep/RAM e BYD",
    ddd: "16",
    phone: "98124-0015",
    contacts: ["Denis (16)98124-0015"],
    region: "Ribeirão Preto/SP",
    activeVehicles: 194,
    lastInteraction: "2025-10-18T17:12:00Z"
  },
  {
    id: "ventu",
    code: "VENTU",
    name: "Ventura Motors",
    ddd: "11",
    phone: "2255-6305",
    contacts: ["Thais (11) 2255-6305", "Marcelo (11) 9187-2170"],
    region: "São Paulo/SP",
    activeVehicles: 122,
    lastInteraction: "2025-10-19T11:45:00Z"
  },
  {
    id: "best",
    code: "BEST",
    name: "Best Distribuidora",
    ddd: "21",
    phone: "99888-8884",
    contacts: ["Serafim Esteves - Embaixador dos Automóveis"],
    region: "Rio de Janeiro/RJ",
    activeVehicles: 87,
    lastInteraction: "2025-10-17T08:00:00Z"
  },
  {
    id: "athena",
    code: "ATHEN.",
    name: "Athena Motors",
    ddd: "14",
    phone: "3572-3291",
    contacts: ["Rodrigo (14) 2033-0548", "Thais 80*49413"],
    region: "Bauru/SP",
    activeVehicles: 66,
    lastInteraction: "2025-10-15T16:10:00Z"
  }
];

export function getSuppliers(): Supplier[] {
  return suppliers;
}

