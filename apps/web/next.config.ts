import type { NextConfig } from 'next'

const isProd = process.env.NODE_ENV === 'production'

// Content-Security-Policy. Bloqueia as classes que mais doem (clickjacking via
// frame-ancestors, injeção de <base>, plugins/objetos, form-action externa),
// mas permite o que o Next e o app realmente usam:
//  - script/style inline: o Next injeta o bootstrap de hidratação inline (sem nonce);
//  - blob:/data: em img/frame/worker: preview de documento (PDF/imagem via objectURL)
//    e exportação Excel geram objectURLs;
//  - connect-src fica em 'self': com o BFF (app/bff), o browser só fala com a própria
//    origem (o Next anexa o Bearer no servidor) — a API não é mais chamada direto.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob:",
  // fonts.gstatic: a janela de preview de documento carrega Manrope do Google Fonts.
  "font-src 'self' data: https://fonts.gstatic.com",
  // fonts.googleapis: folha de estilo da fonte do preview (style-src já tem unsafe-inline).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "frame-src 'self' blob: data:",
  "worker-src 'self' blob:",
]
  .join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  // HSTS só em produção (só faz sentido sob HTTPS; on-prem em http interno não deve forçar).
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
]

const nextConfig: NextConfig = {
  devIndicators: false,
  // Não anunciar o framework (remove o header X-Powered-By: Next.js).
  poweredByHeader: false,
  transpilePackages: ['@nxt/types', '@nxt/contracts-core'],
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }]
    return config
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
