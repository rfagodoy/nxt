/**
 * Reconhecimento de keys de anexo pelo SHAPE — não por lista de campos.
 *
 * Todo anexo é salvo com a key `<orgId>__<uuid-v4>__<nome>` (ver files.controller.ts,
 * `upload`). O UUID entre "__" é a assinatura: reconhecível e praticamente impossível de
 * aparecer por acidente em qualquer outro dado do contrato.
 *
 * Detectar por shape (e não por uma lista de `documentos/aditivos/pagamentos/...`) elimina
 * duas fontes de bug de uma vez:
 *   - o drift: um tipo de anexo novo é coberto sozinho, sem ninguém lembrar de cadastrá-lo;
 *   - a falha DESTRUTIVA da varredura: sem lista, é impossível a varredura tratar um anexo
 *     real como órfão só porque o campo dele não estava na lista — e apagá-lo.
 *
 * ⚠️ Se o formato da key mudar em files.controller.ts, atualizar esta assinatura E a cópia
 *    em scripts/limpar-anexos-orfaos.mjs (o script roda fora do build, não importa este TS).
 */
const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** A key inteira: orgId + "__" + uuid + "__" + nome (o nome pode ser vazio). Global, para
 *  extrair TODAS as keys de uma string — inclusive de um campo JSON ainda serializado. */
const ATTACHMENT_KEY_G = new RegExp(`[\\w.-]+__${UUID_V4}__[\\w.-]*`, 'gi')

/**
 * Varre recursivamente um valor qualquer (uma linha de contrato, com os campos JSON já
 * desserializados OU ainda como string) e devolve toda key de anexo encontrada. Para strings
 * usa `match` global — assim tanto um `arquivo_key` limpo quanto um bloco JSON inteiro
 * (`'[{"arquivo_key":"org__uuid__nome"}]'`) rendem as keys corretas, sem depender de parse.
 */
export function collectAttachmentKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const m of value.match(ATTACHMENT_KEY_G) ?? []) out.add(m)
  } else if (Array.isArray(value)) {
    for (const v of value) collectAttachmentKeys(v, out)
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectAttachmentKeys(v, out)
  }
  return out
}
