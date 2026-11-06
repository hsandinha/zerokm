import { Resultados } from "@wa/components/resultados";

export const dynamic = "force-dynamic";

// Resultados da loja: toda a equipe vê; o desempenho por atendente, só o
// gestor (a rota /api/wa/resultados decide pelo papel).
export default function ResultadosDaLojaPage() {
  return <Resultados />;
}
