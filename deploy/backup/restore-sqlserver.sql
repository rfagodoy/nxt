/* Restore de um backup do Nxt — inclusive para BANCO DE TESTE, que é o uso mais
 * importante deste arquivo.
 *
 * "Backup que nunca foi restaurado não é backup, é esperança." Restaurar num banco
 * paralelo é a única forma de saber que o arquivo presta ANTES de precisar dele — e
 * como não toca o banco de produção, pode (e deve) rodar de tempos em tempos.
 *
 * Parâmetros (via sqlcmd -v):
 *   ARQUIVO  caminho do .bak visto pelo SQL Server
 *   ALVO     nome do banco a criar/substituir  ex.: nxt_restore_teste
 *   PASTA    pasta dos arquivos de dados do ALVO, com separador final
 *
 * Os nomes lógicos dos arquivos são LIDOS DO PRÓPRIO BACKUP (FILELISTONLY) em vez de
 * escritos aqui: eles mudam conforme o banco foi criado em cada instalação, e um MOVE
 * com nome errado só falha na hora do desastre.
 *
 * MOVE é obrigatório ao restaurar ao lado do original: os caminhos gravados no backup
 * são os do banco de origem — sem redirecionar, o SQL Server recusa ou tentaria
 * escrever por cima dos arquivos do banco vivo.
 */
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @arquivo NVARCHAR(512) = N'$(ARQUIVO)';
DECLARE @alvo    SYSNAME       = N'$(ALVO)';
DECLARE @pasta   NVARCHAR(512) = N'$(PASTA)';

/* Guarda-corpo: este script DERRUBA o banco de destino. Apontá-lo por engano para o
   banco de produção destruiria exatamente o que o backup deveria proteger. */
IF @alvo = N'nxt' AND N'$(PERMITIR_PRODUCAO)' <> N'sim'
BEGIN
  RAISERROR(N'Recusado: o alvo "nxt" é o banco de produção e este script o DERRUBA antes de restaurar. Se é mesmo isso que você quer, passe -v PERMITIR_PRODUCAO="sim".', 16, 1);
  RETURN;
END

DECLARE @lista TABLE (
  LogicalName NVARCHAR(128), PhysicalName NVARCHAR(260), [Type] CHAR(1), FileGroupName NVARCHAR(128),
  Size NUMERIC(20,0), MaxSize NUMERIC(20,0), FileId BIGINT, CreateLSN NUMERIC(25,0), DropLSN NUMERIC(25,0),
  UniqueId UNIQUEIDENTIFIER, ReadOnlyLSN NUMERIC(25,0), ReadWriteLSN NUMERIC(25,0), BackupSizeInBytes BIGINT,
  SourceBlockSize INT, FileGroupId INT, LogGroupGUID UNIQUEIDENTIFIER, DifferentialBaseLSN NUMERIC(25,0),
  DifferentialBaseGUID UNIQUEIDENTIFIER, IsReadOnly BIT, IsPresent BIT, TDEThumbprint VARBINARY(32),
  SnapshotUrl NVARCHAR(360)
);
INSERT INTO @lista EXEC ('RESTORE FILELISTONLY FROM DISK = N''$(ARQUIVO)''');

DECLARE @move NVARCHAR(MAX) = N'';
SELECT @move = @move + N', MOVE N''' + LogicalName + N''' TO N''' + @pasta + @alvo +
       CASE WHEN [Type] = 'L' THEN N'_log.ldf' ELSE N'_' + CAST(FileId AS NVARCHAR(10)) + N'.mdf' END + N''''
FROM @lista;

IF DB_ID(@alvo) IS NOT NULL
BEGIN
  DECLARE @drop NVARCHAR(MAX) = N'ALTER DATABASE ' + QUOTENAME(@alvo) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE ' + QUOTENAME(@alvo) + N';';
  EXEC (@drop);
END

DECLARE @sql NVARCHAR(MAX) =
  N'RESTORE DATABASE ' + QUOTENAME(@alvo) + N' FROM DISK = N''' + @arquivo + N''' WITH RECOVERY, REPLACE, STATS = 25' + @move + N';';
EXEC (@sql);

PRINT 'Restaurado em: ' + @alvo;
