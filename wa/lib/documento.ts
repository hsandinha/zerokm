// Validação de CPF e CNPJ pelos dígitos verificadores (módulo 11).
// Espelha lib/utils/cpf.ts da zerokm: o cadastro criado por aqui vai para a
// mesma base e é cobrado pelo mesmo Mercado Pago, que recusa documento inválido.

export function validateCPF(cpf: string): boolean {
  const n = (cpf || "").replace(/\D/g, "");
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
  let d1 = 11 - (sum % 11);
  if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(n[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
  let d2 = 11 - (sum % 11);
  if (d2 >= 10) d2 = 0;
  return d2 === parseInt(n[10]);
}

export function validateCNPJ(cnpj: string): boolean {
  const n = (cnpj || "").replace(/\D/g, "");
  if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;

  const digito = (base: string, pesos: number[]) => {
    const soma = base
      .split("")
      .reduce((acc, char, i) => acc + parseInt(char) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = digito(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== parseInt(n[12])) return false;

  const d2 = digito(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === parseInt(n[13]);
}

// ── Formatação e comparação (usadas pela base e pelo enriquecimento) ──

export function onlyDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Formata CNPJ para exibição (a persistência é sempre em dígitos). */
export function formatCnpj(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Formata CPF para exibição (a persistência é sempre em dígitos). */
export function formatCpf(raw: string): string {
  const d = onlyDigits(raw);
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF ou CNPJ, pelo tamanho. */
export function formatDocument(raw: string): string {
  const d = onlyDigits(raw);
  return d.length === 11 ? formatCpf(d) : d.length === 14 ? formatCnpj(d) : raw;
}

/**
 * O CNPJá (e a Receita) entregam o CPF do sócio mascarado: `***.123.456-**`.
 * Compara os dígitos conhecidos com o CPF completo. Seis dígitos casam pela
 * posição (3..8); qualquer outra quantidade, por substring.
 */
export function matchesPartialCpf(fullCpf: string, partial: string | null | undefined): boolean {
  const full = onlyDigits(fullCpf);
  const known = onlyDigits(partial);
  if (full.length !== 11 || known.length === 0) return false;
  if (known.length === 6) return full.slice(3, 9) === known;
  if (known.length === 11) return full === known;
  return full.includes(known);
}

/** Sem acento, maiúsculo, espaços únicos — para comparar nomes. */
export function normalizeName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Nomes "parecidos": um é prefixo do outro ou compartilham primeiro + último nome. */
export function namesLookAlike(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  const px = x.split(" ");
  const py = y.split(" ");
  return px[0] === py[0] && px[px.length - 1] === py[py.length - 1];
}

/** Mesmos validadores, tolerando null — é como a importação recebe o dado. */
export function isValidCpf(raw: string | null | undefined): boolean {
  return validateCPF(raw ?? "");
}
export function isValidCnpj(raw: string | null | undefined): boolean {
  return validateCNPJ(raw ?? "");
}
