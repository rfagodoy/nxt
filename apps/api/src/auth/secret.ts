// Marcadores de segredos de exemplo/dev que NUNCA podem ir para produção.
const DEV_MARKERS = ['dev-secret', 'troque', 'changeme', 'example', 'placeholder']

/**
 * Valida o AUTH_JWT_SECRET no boot. Em produção, recusa subir se o segredo
 * estiver ausente, curto demais ou parecer um placeholder de dev — evita o pior
 * cenário (qualquer um forjar tokens válidos).
 */
export function assertJwtSecret(): void {
  const secret = process.env.AUTH_JWT_SECRET
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET não configurado — auth não pode inicializar.')
  }
  if (process.env.NODE_ENV === 'production') {
    const weak = secret.length < 32 || DEV_MARKERS.some((m) => secret.toLowerCase().includes(m))
    if (weak) {
      throw new Error(
        'AUTH_JWT_SECRET inseguro em produção. Gere um segredo aleatório de 64+ caracteres ' +
          '(ex.: `openssl rand -base64 48`) e defina via variável de ambiente.',
      )
    }
  }
}
