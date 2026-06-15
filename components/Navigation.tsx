"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Navigation.module.css";

const links = [
  { href: "/veiculos", label: "Veículos" },
  { href: "/logistica", label: "Logística" },
  { href: "/fornecedores", label: "Fornecedores" },
  { href: "/auditoria", label: "Auditoria" },
  { href: "/configuracoes", label: "Configurações" }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav}>
      <ul className={styles.list}>
        {links.map(link => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                className={`${styles.link} ${active ? styles.active : ""}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
