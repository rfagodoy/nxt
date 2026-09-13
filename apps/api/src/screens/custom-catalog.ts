/**
 * Catálogo de campos personalizados de um TIPO (Contrato/Fornecedor).
 *
 * Um campo personalizado não pertence à tela que o criou: pertence ao tipo. Cada tela do
 * mesmo subject guarda uma LINHA para ele, com as três chaves dela (aparece / pode editar /
 * obrigatório). O que amarra as linhas é a `fieldKey`.
 *
 * Duas identidades, e confundi-las é o bug caro desta área:
 *  - `id`       → esta LINHA, nesta tela. É por ela que a tela é salva/podada.
 *  - `fieldKey` → o CAMPO no tipo. É por ela que o VALOR é gravado, que a condição do
 *                 workflow referencia, que a atividade trava e que a auditoria registra.
 *
 * Nos campos que já existiam, `fieldKey = id` (backfill) — é isso que faz a mudança ser
 * aditiva: nada que estava gravado apontando para o id antigo deixou de resolver.
 */

/** A identidade do CAMPO. Linha sem chave é anterior ao backfill: vale o próprio id. */
export const chaveDoCampo = (f: { id: string; fieldKey?: string | null }): string => f.fieldKey ?? f.id

export interface LinhaCatalogo {
  id: string
  fieldKey?: string | null
  source: string
  updatedAt: Date
}

/**
 * Reduz as linhas de TODAS as telas do tipo a uma definição canônica por chave.
 *
 * Canônica é a linha que nasceu com o campo — aquela cujo `id` É a chave. Se a tela de
 * origem foi apagada, ela não existe mais; aí vale a alteração mais recente, para a
 * definição não voltar no tempo. Só campos CUSTOM entram: nativo é do sistema.
 */
export function catalogoCanonico<T extends LinhaCatalogo>(linhas: readonly T[]): Map<string, T> {
  const out = new Map<string, T>()
  for (const f of linhas) {
    if (f.source !== 'CUSTOM') continue
    const k = chaveDoCampo(f)
    const atual = out.get(k)
    if (!atual) { out.set(k, f); continue }
    if (chaveDoCampo(atual) === atual.id) continue       // a canônica de verdade já está
    if (f.id === k || f.updatedAt > atual.updatedAt) out.set(k, f)
  }
  return out
}

/* Aqui existia `chavesRemovidas`, que DEDUZIA a exclusão a partir de "a chave não veio no
   payload". A dedução era errada: três caminhos omitiam campo sem querer — a gaveta de
   edição remontava o objeto sem a chave, excluir uma seção levava os campos junto, e uma
   aba aberta antes de um colega criar um campo em outra tela salvava sem ele. Qualquer um
   apagava o campo de TODAS as telas e órfanava os valores. Agora a exclusão é DITA:
   `SaveScreenDto.removedFieldKeys`, alimentada pelo diálogo de confirmação do construtor. */

/**
 * A identidade da SEÇÃO dentro da tela. Nativa responde pela `nativeKey` (a mesma chave em
 * todas as telas do tipo); personalizada, pelo próprio id, que o construtor gera por tela.
 * Ver o porquê em saveChildren: o id que chega é determinístico e não serve de identidade.
 */
export const chaveDaSecao = (s: { id: string; sectionKey?: string | null; nativeKey?: string | null }): string =>
  s.nativeKey ?? s.sectionKey ?? s.id
