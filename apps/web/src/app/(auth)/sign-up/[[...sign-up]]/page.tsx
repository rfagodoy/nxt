import { redirect } from 'next/navigation'

/**
 * Cadastro é gerido no Keycloak (ou provisionado por convite/organização).
 * Mantemos a rota por compatibilidade, redirecionando ao login SSO.
 */
export default function SignUpPage() {
  redirect('/sign-in')
}
