/*
  Código das telas (PO, 23/11/2026): TELA_CTR_001 (Contrato), TELA_PAR_001 (Parceiro),
  TELA_GEN_001 (Genérica), gerado pelo sistema e somente leitura. As telas existentes
  recebem o código por organização e tipo, na ordem de criação, com as do sistema
  primeiro. O UPDATE vai por EXEC porque o SQL Server compila o lote antes de a coluna
  existir.
*/
BEGIN TRY

BEGIN TRAN;

ALTER TABLE [dbo].[screens] ADD [code] NVARCHAR(1000) NULL;

EXEC('
WITH numeradas AS (
  SELECT [id],
         CASE [subjectType] WHEN ''CONTRATO'' THEN ''CTR'' WHEN ''FORNECEDOR'' THEN ''PAR'' ELSE ''GEN'' END AS [prefixo],
         ROW_NUMBER() OVER (
           PARTITION BY [organizationId], CASE [subjectType] WHEN ''CONTRATO'' THEN ''CTR'' WHEN ''FORNECEDOR'' THEN ''PAR'' ELSE ''GEN'' END
           ORDER BY [isSystem] DESC, [createdAt], [id]
         ) AS [n]
  FROM [dbo].[screens]
)
UPDATE s
SET [code] = ''TELA_'' + numeradas.[prefixo] + ''_'' +
             CASE WHEN numeradas.[n] < 1000 THEN RIGHT(''000'' + CAST(numeradas.[n] AS VARCHAR(10)), 3) ELSE CAST(numeradas.[n] AS VARCHAR(10)) END
FROM [dbo].[screens] s
JOIN numeradas ON numeradas.[id] = s.[id];
');

ALTER TABLE [dbo].[screens] ALTER COLUMN [code] NVARCHAR(1000) NOT NULL;

-- CreateIndex
ALTER TABLE [dbo].[screens] ADD CONSTRAINT [screens_organizationId_code_key] UNIQUE NONCLUSTERED ([organizationId], [code]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
