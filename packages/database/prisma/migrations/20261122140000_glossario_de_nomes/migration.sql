-- Glossário de nomes (auditoria de UX, 22/11/2026). Troca só os textos que ainda estão
-- iguais ao padrão antigo: o que a organização renomeou na tela fica como está.
BEGIN TRY

BEGIN TRAN;

UPDATE [dbo].[screen_sections] SET [label] = N'Pagamentos', [updatedAt] = SYSUTCDATETIME()
 WHERE [nativeKey] = 'pagamentos' AND [label] = N'Pagamentos realizados';

UPDATE [dbo].[screen_sections] SET [label] = N'Recebimentos', [updatedAt] = SYSUTCDATETIME()
 WHERE [nativeKey] = 'recebimentos' AND [label] = N'Recebimentos realizados';

UPDATE [dbo].[screens] SET [name] = N'Cadastro de Parceiro (padrão do sistema)', [updatedAt] = SYSUTCDATETIME()
 WHERE [isSystem] = 1 AND [subjectType] = 'FORNECEDOR' AND [name] = N'Cadastro de Fornecedor (padrão do sistema)';

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
