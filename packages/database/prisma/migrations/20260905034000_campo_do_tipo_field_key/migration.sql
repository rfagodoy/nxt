BEGIN TRY

BEGIN TRAN;

-- AlterTable: identidade do CAMPO no tipo (compartilhada pelas telas do mesmo subject)
ALTER TABLE [dbo].[screen_fields] ADD [fieldKey] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
