BEGIN TRY

BEGIN TRAN;

-- 1) A chave: a nativa é a `nativeKey`; a personalizada é o próprio id (estável por tela).
UPDATE [dbo].[screen_sections]
   SET [sectionKey] = COALESCE([nativeKey], [id])
 WHERE [sectionKey] IS NULL;

-- 2) Toda tela que tem CAMPO apontando para uma seção de OUTRA tela ganha a sua própria
--    linha, copiada da que ela vinha usando. Sem isto, ao trocar a identidade os campos
--    dessas telas ficariam órfãos (o construtor lista campo por sectionId).
INSERT INTO [dbo].[screen_sections]
       ([id], [screenId], [label], [name], [source], [nativeKey], [visible], [locked], [order], [defaultOpen], [sectionKey], [createdAt], [updatedAt])
SELECT CONVERT(NVARCHAR(50), NEWID()), r.[screenId], src.[label], src.[name], src.[source], src.[nativeKey],
       src.[visible], src.[locked], src.[order], src.[defaultOpen], COALESCE(src.[nativeKey], src.[id]),
       SYSUTCDATETIME(), SYSUTCDATETIME()
  FROM (SELECT DISTINCT [screenId], [sectionId] FROM [dbo].[screen_fields] WHERE [sectionId] IS NOT NULL) r
  JOIN [dbo].[screen_sections] src ON src.[id] = r.[sectionId]
 WHERE src.[screenId] <> r.[screenId]
   AND NOT EXISTS (
        SELECT 1 FROM [dbo].[screen_sections] t
         WHERE t.[screenId] = r.[screenId]
           AND t.[sectionKey] = COALESCE(src.[nativeKey], src.[id]));

-- 3) Re-aponta os campos para a linha de seção DA PRÓPRIA tela.
UPDATE f
   SET f.[sectionId] = t.[id]
  FROM [dbo].[screen_fields] f
  JOIN [dbo].[screen_sections] src ON src.[id] = f.[sectionId]
  JOIN [dbo].[screen_sections] t   ON t.[screenId] = f.[screenId]
                                  AND t.[sectionKey] = COALESCE(src.[nativeKey], src.[id])
 WHERE t.[id] <> f.[sectionId];

-- 4) A identidade nova. Se alguma destas falhar, há duplicata de chave dentro de uma
--    tela e a migração tem de parar: seguir em frente esconderia perda de dado.
CREATE UNIQUE NONCLUSTERED INDEX [screen_sections_screenId_sectionKey_key]
    ON [dbo].[screen_sections]([screenId], [sectionKey]);
CREATE UNIQUE NONCLUSTERED INDEX [screen_fields_screenId_fieldKey_key]
    ON [dbo].[screen_fields]([screenId], [fieldKey]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
