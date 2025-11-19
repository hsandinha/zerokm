import { withAuth } from "next-auth/middleware"

export default withAuth(
  function middleware(req) {
    // Middleware adicional se necessário
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        // Permite acesso às rotas protegidas se tem token
        return !!token
      },
    },
  }
)

// Configuração das rotas protegidas
export const config = {
  matcher: [
    "/dashboard/:path*"
  ]
}