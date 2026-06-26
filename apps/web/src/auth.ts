import NextAuth, { type NextAuthResult } from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import Keycloak from 'next-auth/providers/keycloak'

/**
 * Renova o access token usando o refresh token do Keycloak quando o atual expira.
 * Mantém a sessão viva sem novo login.
 */
async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    const res = await fetch(
      `${process.env.AUTH_KEYCLOAK_ISSUER}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: process.env.AUTH_KEYCLOAK_ID ?? '',
          client_secret: process.env.AUTH_KEYCLOAK_SECRET ?? '',
          refresh_token: String(token.refreshToken ?? ''),
        }),
      },
    )
    const refreshed = await res.json()
    if (!res.ok) throw refreshed
    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + Number(refreshed.expires_in),
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    }
  } catch {
    return { ...token, error: 'RefreshAccessTokenError' }
  }
}

const result = NextAuth({
  providers: [
    Keycloak({
      issuer: process.env.AUTH_KEYCLOAK_ISSUER,
      clientId: process.env.AUTH_KEYCLOAK_ID,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Login inicial: guarda tokens e o tenant (claim org_id do Keycloak).
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.expiresAt = account.expires_at
        token.orgId = (profile as Record<string, unknown> | undefined)?.org_id as string | undefined
        return token
      }
      // Token ainda válido.
      if (token.expiresAt && Date.now() < Number(token.expiresAt) * 1000) {
        return token
      }
      // Expirado: tenta renovar.
      return refreshAccessToken(token)
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined
      session.orgId = token.orgId as string | undefined
      session.error = token.error as string | undefined
      return session
    },
  },
  pages: {
    signIn: '/sign-in',
  },
})

// Anotação explícita com o tipo público evita o TS2742 (tipo inferido
// referenciando internals não-portáveis do next-auth).
export const handlers: NextAuthResult['handlers'] = result.handlers
export const auth: NextAuthResult['auth'] = result.auth
export const signIn: NextAuthResult['signIn'] = result.signIn
export const signOut: NextAuthResult['signOut'] = result.signOut
