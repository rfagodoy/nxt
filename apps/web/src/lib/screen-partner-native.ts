/**
 * Resolve o valor de exibição de um campo NATIVE (visão) de uma Tela, a partir do
 * formulário do parceiro (PartnerFormValues). A `nativeKey` do campo aponta para um
 * dos campos nativos do cadastro (ver NATIVE_FIELDS em use-partner-fields).
 */
import type { PartnerFormValues } from '@/components/partners/partner-fields'

const fmtDate = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : s

export function partnerNativeValue(v: PartnerFormValues, key: string): string {
  const con = v.contatos?.[0]
  const end = v.enderecos?.[0]
  const ban = v.bancos?.[0]
  const soc = v.socios?.[0]
  switch (key) {
    case 'razao_social':      return v.razaoSocial
    case 'cnpj': case 'cpf': case 'codigo': return v.documento
    case 'nome_fantasia':     return v.nomeFantasia
    case 'data_abertura':     return fmtDate(v.dataAbertura)
    case 'natureza_juridica': return v.naturezaJuridica
    case 'ie':                return v.ie
    case 'im':                return v.im
    case 'rg':                return v.rg
    case 'orgao_expedidor':   return v.orgaoExpedidor
    case 'data_nascimento':   return fmtDate(v.dataNascimento)
    case 'pais_origem':       return v.paisOrigem
    case 'cnae_principal':    return v.cnaePrincipal
    case 'cnaes_secundarios': return (v.cnaesSecundarios ?? []).join(', ')
    case 'con_email':         return con?.email ?? ''
    case 'con_nome':          return con?.nome ?? ''
    case 'con_telefone':      return con?.telefone ?? ''
    case 'con_celular':       return con?.celular ?? ''
    case 'con_cargo':         return con?.cargo ?? ''
    case 'con_website':       return con?.website ?? ''
    case 'end_cep':           return end?.cep ?? ''
    case 'end_estado':        return end?.estado ?? ''
    case 'end_logradouro':    return end?.logradouro ?? ''
    case 'end_numero':        return end?.numero ?? ''
    case 'end_complemento':   return end?.complemento ?? ''
    case 'end_bairro':        return end?.bairro ?? ''
    case 'end_cidade':        return end?.cidade ?? ''
    case 'end_address1':      return end?.address1 ?? ''
    case 'end_address2':      return end?.address2 ?? ''
    case 'end_pais':          return end?.pais_endereco ?? ''
    case 'ban_banco':         return ban?.banco ?? ''
    case 'ban_tipo_conta':    return ban?.tipo_conta ?? ''
    case 'ban_agencia':       return ban?.agencia ?? ''
    case 'ban_conta':         return ban?.conta ?? ''
    case 'ban_pix':           return ban?.pix ?? ''
    case 'soc_nome':          return soc?.nome ?? ''
    case 'soc_documento':     return soc?.documento ?? ''
    case 'soc_participacao':  return soc?.participacao ?? ''
    case 'soc_cargo':         return soc?.cargo ?? ''
    default:                  return ''
  }
}
