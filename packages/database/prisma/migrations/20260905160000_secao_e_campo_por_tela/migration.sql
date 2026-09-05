BEGIN TRY

BEGIN TRAN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Seção e campo passam a ter UMA LINHA POR TELA.
--
-- O construtor gera ids DETERMINÍSTICOS por tipo (`nsec_<subject>_<chave>` e
-- `nfld_<subject>_<chave>`, ver buildNativeSeed) — iguais em todas as telas do mesmo
-- subject. Como o save fazia `upsert` POR ID, a segunda tela nunca criava linha
-- própria: caía no ramo update e sobrescrevia a linha da primeira. Efeito: esconder
-- ou travar uma seção/campo numa tela mexia na outra, e a tela personalizada ficava
-- com zero seções e zero campos nativos no banco.
--
-- A partir daqui o par (screenId, chave) é a identidade. O id continua sendo da linha.
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable
ALTER TABLE [dbo].[screen_sections] ADD [sectionKey] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
