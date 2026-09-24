// Formato canônico de uma linha de audiência. É o contrato ÚNICO entre as
// fontes de entrada (CSV hoje, CNPJá e Procob depois) e a gravação no banco:
// cada adapter só precisa devolver AudienceRow, e o ingest não sabe de onde
// veio o dado.

export type AudienceRow = {
  // ── Empresa (o alvo da abordagem) ──────────────────────────
  cnpj?: string;
  company?: string; // razão social ou nome fantasia
  city?: string;
  state?: string;
  cnae?: string;

  // ── Contato ────────────────────────────────────────────────
  phone?: string;
  contactName?: string;
  email?: string;

  // ── Sócio, quando a lista já traz ──────────────────────────
  partnerName?: string;
  partnerTaxId?: string; // CPF

  /** Variáveis extras do template, na ordem das colunas marcadas. */
  var1?: string;
  var2?: string;
  var3?: string;
};

export type AudienceField = keyof AudienceRow;

/** De → para de colunas do arquivo: { "CNPJ": "cnpj" }. */
export type ColumnMapping = Record<string, AudienceField | "">;

export type IngestResult = {
  rowsTotal: number;
  rowsOk: number;
  rowsError: number;
  targetsUpserted: number;
  contactsUpserted: number;
  /** Descartados por já serem clientes da CNV — resultado esperado de parte
   *  da lista, não erro. */
  alreadyCustomers: number;
  errors: Array<{ line: number; error: string }>;
};
