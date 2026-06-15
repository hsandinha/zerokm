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
        case 'administrador':
        case 'gerente':
          return '/dashboard/admin';
        case 'concessionaria': return '/dashboard/dealership';
        case 'operator':
        case 'operador': return '/dashboard/operator';
        case 'administrativo': return '/dashboard/administrativo';
        case 'vendedor': return '/dashboard/vendedor';
        case 'cliente':
        case 'gratis': return '/dashboard/cliente';
        default: return '/dashboard/operator';
      }
    };

    // Regras de Proteção de Rotas (RBAC)
    // IMPORTANTE: rotas mais específicas devem vir ANTES das mais genéricas

    // 1. Administrativo Dashboard (DEVE vir antes de /dashboard/admin!)
    if (path.startsWith('/dashboard/administrativo') && profile !== 'administrativo' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 2. Admin Dashboard: Apenas Administradores e Gerentes
    if (path.startsWith('/dashboard/admin') && !path.startsWith('/dashboard/administrativo') && profile !== 'administrador' && profile !== 'gerente') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 3. Dealership Dashboard: Concessionárias e Administradores
    if (path.startsWith('/dashboard/dealership') && profile !== 'concessionaria' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 4. Operator Dashboard: Operadores e Administradores
    if (path.startsWith('/dashboard/operator') && profile !== 'operador' && profile !== 'operator' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 5. Client Dashboard: Clientes, Grátis e Administradores
    if (path.startsWith('/dashboard/cliente') && profile !== 'cliente' && profile !== 'gratis' && profile !== 'administrador') {
      return NextResponse.redirect(new URL(getDashboardUrl(profile), req.url));
    }

    // 6. Vendedor Dashboard: Apenas perfil vendedor e administrador
    if (path.startsWith('/dashboard/vendedor') && profile !== 'vendedor' && profile !== 'administrador') {
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
