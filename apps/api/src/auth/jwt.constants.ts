// Parâmetros do nosso JWT, compartilhados entre quem assina (AuthService) e quem
// valida (JwtStrategy). O segredo vem sempre de AUTH_JWT_SECRET (env).
export const JWT_ISSUER = process.env.AUTH_JWT_ISSUER || 'nxt'
export const JWT_TTL = process.env.AUTH_JWT_TTL || '8h'
