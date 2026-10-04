BEGIN TRY

BEGIN TRAN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Executor pelo STAKEHOLDER do contrato (04/10/2026): a tarefa guarda POR QUE foi
-- para quem foi ("Solicitante da Diretoria X — Unidade contratante do contrato") e
-- se ninguém foi encontrado. Nesse caso ela vai para os administradores, com aviso,
-- em vez de cair aberta para qualquer usuário (decisão do PO).
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE [dbo].[workflow_tasks] ADD [executorNota] NVARCHAR(1000),
[semExecutor] BIT NOT NULL CONSTRAINT [workflow_tasks_semExecutor_df] DEFAULT 0;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
