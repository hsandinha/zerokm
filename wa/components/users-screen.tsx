"use client";

// Quem entra no painel.
//
// A CONTA é a mesma da CNV (cnv0km.com.br, Firebase) — o painel não cria nem
// troca senha. O que se dá aqui é PERMISSÃO: quem opera e com que papel.
//
// Enquanto a lista estiver vazia, todo administrador da zerokm entra (é o
// bootstrap — sem isso ninguém criaria o primeiro nome). Ao cadastrar o
// primeiro, a lista passa a mandar.

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  Check,
  Loader2,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
} from "lucide-react";
import { dateTime, timeAgo } from "@wa/lib/stages";
import { useFeedback } from "@/components/ui/Feedback";

type PanelUser = {
  email: string;
  name: string | null;
  role: "admin" | "operador";
  createdAt: string;
  createdBy: string | null;
  lastSignInAt: string | null;
  hasAccount: boolean;
  zerokmProfiles: string[];
};

const ROLE_HINT: Record<"admin" | "operador", string> = {
  admin: "configura IA, WABA, campanhas, base e usuários",
  operador: "só a Central e a leitura das campanhas",
};

export function UsersScreen() {
  const { confirm: confirmar, feedback } = useFeedback();
  const [users, setUsers] = useState<PanelUser[] | null>(null);
  const [bootstrap, setBootstrap] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [role, setRole] = useState<"admin" | "operador">("operador");

  const load = useCallback(async () => {
    const res = await fetch("/api/wa/users");
    const body = await res.json();
    if (!res.ok) {
      setErro(body.error ?? "Falha ao carregar");
      return;
    }
    setUsers(body.users ?? []);
    setBootstrap(Boolean(body.bootstrap));
    setErro(null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function adicionar() {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch("/api/wa/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name: nome, role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setErro(body.error ?? "Falha ao dar acesso");
        return;
      }
      setAviso(body.message ?? null);
      setEmail("");
      setNome("");
      await load();
    } finally {
      setSalvando(false);
    }
  }

  async function trocarPapel(u: PanelUser, novo: "admin" | "operador") {
    setErro(null);
    const res = await fetch(`/api/wa/users/${encodeURIComponent(u.email)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: novo }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(body.error ?? "Falha ao alterar o papel");
    }
    await load();
  }

  async function remover(u: PanelUser) {
    if (!(await confirmar({ title: "Remover o acesso ao painel?", description: `${u.email} deixa de entrar no módulo WhatsApp. A conta na CNV continua existindo.`, confirmLabel: "Remover acesso", danger: true }))) {
      return;
    }
    setErro(null);
    const res = await fetch(`/api/wa/users/${encodeURIComponent(u.email)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(body.error ?? "Falha ao remover");
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="brand-kicker">Gestão</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <UserCog size={22} /> Usuários do painel
        </h1>
        <p className="mt-1 text-sm text-muted">
          A senha é a mesma do cnv0km.com.br. Aqui se define quem opera o WhatsApp e com que papel.
        </p>
      </div>

      {bootstrap && (
        <p className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          A lista está vazia: no momento, <b>qualquer administrador da CNV</b> consegue entrar. Ao
          cadastrar o primeiro nome aqui, só quem estiver na lista entra — comece por você.
        </p>
      )}

      {erro && (
        <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-600">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="rounded-2xl border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
          {aviso}
        </p>
      )}

      <div className="card space-y-3">
        <p className="text-sm font-bold">Dar acesso</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem]">
          <input
            className="input"
            type="email"
            placeholder="email@cnv0km.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            placeholder="Nome (opcional)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as "admin" | "operador")}
          >
            <option value="operador">Operador</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{ROLE_HINT[role]}</p>
          <button className="btn-primary px-4 py-2 text-xs" disabled={salvando || !email} onClick={adicionar}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Dar acesso
          </button>
        </div>
      </div>

      <div className="card p-0">
        {users === null ? (
          <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted">
            <Loader2 size={15} className="animate-spin" /> Carregando…
          </p>
        ) : users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Ninguém cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {users.map((u) => (
              <li key={u.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{u.name ?? u.email}</span>
                    {u.role === "admin" && (
                      <ShieldCheck size={14} className="shrink-0 text-brand-700" />
                    )}
                    {!u.hasAccount && (
                      <span
                        className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                        title="Sem conta na CNV: a pessoa precisa se cadastrar em cnv0km.com.br"
                      >
                        sem conta
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {u.name ? `${u.email} · ` : ""}
                    {u.lastSignInAt ? `último acesso ${timeAgo(u.lastSignInAt)}` : "nunca entrou"}
                    {u.createdBy ? ` · liberado por ${u.createdBy}` : ""}
                    {` · desde ${dateTime(u.createdAt)}`}
                  </span>
                </span>
                <select
                  className={clsx(
                    "shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-semibold",
                    u.role === "admin" ? "bg-brand-50 text-brand-700" : "bg-paper",
                  )}
                  value={u.role}
                  onChange={(e) => trocarPapel(u, e.target.value as "admin" | "operador")}
                >
                  <option value="operador">Operador</option>
                  <option value="admin">Administrador</option>
                </select>
                <button
                  className="shrink-0 rounded-full p-2 text-muted transition hover:bg-red-50 hover:text-red-600"
                  onClick={() => remover(u)}
                  title="Remover o acesso ao painel"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted">
        <Check size={13} className="mt-0.5 shrink-0" />
        Remover daqui tira só a permissão de operar o painel — a conta na CNV continua valendo para
        o site. As travas impedem remover ou rebaixar o último administrador.
      </p>
      <div className="zk-ui">{feedback}</div>
    </div>
  );
}
