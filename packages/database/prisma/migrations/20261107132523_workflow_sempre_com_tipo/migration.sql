/*
  Todo workflow tem tipo (decisão do PO, 07/11/2026): o "sem tipo" saiu.
  Workflows antigos sem tipo passam a Contrato, o tipo padrão, antes de a coluna
  virar obrigatória. O legado PARCEIRO não é tocado: definições e processos antigos
  continuam como estão, e a API só deixa de aceitá-lo ao gravar ou ativar.
*/
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[process_definitions] SET [kind] = 'CONTRATO' WHERE [kind] IS NULL OR [kind] = '';

-- AlterTable
ALTER TABLE [dbo].[process_definitions] ALTER COLUMN [kind] NVARCHAR(1000) NOT NULL;
ALTER TABLE [dbo].[process_definitions] ADD CONSTRAINT [process_definitions_kind_df] DEFAULT 'CONTRATO' FOR [kind];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
