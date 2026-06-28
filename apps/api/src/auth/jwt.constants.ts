// Parâmetros de auth, compartilhados entre quem assina e quem valida.
// O segredo vem sempre de AUTH_JWT_SECRET (env).
export const JWT_ISSUER = process.env.AUTH_JWT_ISSUER || 'nxt'

// Access token curto (stateless). A continuidade da sessão vem do refresh token.
export const ACCESS_TTL = process.env.AUTH_JWT_TTL || '15m'
export const REFRESH_TTL_DAYS = Number(process.env.AUTH_REFRESH_TTL_DAYS || 7)

// Anti-brute-force por conta (persistido no banco).
export const MAX_FAILED_ATTEMPTS = Number(process.env.AUTH_MAX_FAILED || 5)
export const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES || 15)

// Throttle por IP (in-memory, janela deslizante).
export const IP_MAX_HITS = Number(process.env.AUTH_IP_MAX || 20)
export const IP_WINDOW_MS = Number(process.env.AUTH_IP_WINDOW_MS || 60_000)
