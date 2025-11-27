import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function proxy(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;
    const profile = token?.profile as string | undefined;

    // Se não tiver perfil, o callback authorized já deve ter barrado, mas por segurança:
    if (!profile) return NextResponse.next();

    // Função auxiliar para obter a URL correta do dashboard baseada no perfil
    const getDashboardUrl = (p: string) => {
      switch (p) {
        case 'administrador': return '/dashboard/admin';
        case 'concessionaria': return '/dashboard/dealership';
        case 'operador': return '/dashboard/operator';
        case 'cliente': return '/dashboard/cliente';
        default: return '/dashboard/operator';
      }
    };

    // Regras de Proteção de Rotas (RBAC)

    // 1. Admin Dashboard: Apenas Administradores
    if (path.startsWith('/dashboard/admin') && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 2. Dealership Dashboard: Concessionárias e Administradores
    if (path.startsWith('/dashboard/dealership') && profile !== 'concessionaria' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 3. Operator Dashboard: Operadores e Administradores
    if (path.startsWith('/dashboard/operator') && profile !== 'operador' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 4. Client Dashboard: Clientes e Administradores
    if (path.startsWith('/dashboard/cliente') && profile !== 'cliente' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

// Configuração das rotas protegidas
export const config = {
  matcher: [
    "/dashboard/:path*"
  ]
}
