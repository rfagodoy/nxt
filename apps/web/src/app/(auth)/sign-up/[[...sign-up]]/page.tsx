import { redirect } from 'next/navigation'

/**
 * Não há auto-cadastro: usuários são provisionados por um administrador na tela
 * de gestão de usuários. Mantemos a rota por compatibilidade, redirecionando ao login.
 */
export default function SignUpPage() {
  redirect('/sign-in')
}
