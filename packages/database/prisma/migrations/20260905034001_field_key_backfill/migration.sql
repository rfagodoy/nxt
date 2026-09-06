BEGIN TRY

BEGIN TRAN;

-- Backfill: para tudo que já existe, a identidade do campo É o próprio id da linha.
-- É isto que faz a mudança ser aditiva: valor preenchido, condição de workflow
-- (`contrato.<fieldId>`), trava por atividade (`lockedFields`) e linha de auditoria
-- (`custom.<fieldId>`) continuam apontando para a mesma string.
UPDATE [dbo].[screen_fields] SET [fieldKey] = [id] WHERE [fieldKey] IS NULL;

-- CreateIndex
CREATE NONCLUSTERED INDEX [screen_fields_fieldKey_idx] ON [dbo].[screen_fields]([fieldKey]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
