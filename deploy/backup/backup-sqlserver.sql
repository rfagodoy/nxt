/* Backup COMPLETO do banco do Nxt, com verificação.
 *
 * Este arquivo é a fonte única da rotina: os scripts .ps1 e .sh só o executam com
 * sqlcmd, para que Windows e Linux façam exatamente a mesma coisa — e para que a
 * lógica de backup possa ser lida e revisada por um DBA sem ler PowerShell.
 *
 * Parâmetros (via sqlcmd -v):
 *   BANCO    nome do banco            ex.: nxt
 *   DESTINO  pasta de destino, com separador final, VISTA PELO SQL SERVER
 *            ex.: /var/opt/mssql/backup/  ou  D:\backup\
 *   ROTULO   sufixo do arquivo, normalmente data-hora  ex.: 20260727-0930
 *
 * Por que COMPRESSION: o arquivo cabe melhor na janela de cópia para fora da máquina,
 * e backup que não sai da máquina não protege contra a perda da máquina.
 *
 * Por que CHECKSUM + RESTORE VERIFYONLY: sem isso, corrupção só aparece no dia do
 * restore — que é o pior dia possível para descobrir.
 */
SET NOCOUNT ON;

DECLARE @arquivo NVARCHAR(512) = N'$(DESTINO)' + N'$(BANCO)-$(ROTULO).bak';

BACKUP DATABASE [$(BANCO)]
  TO DISK = @arquivo
  WITH INIT, COMPRESSION, CHECKSUM, STATS = 25,
       NAME = N'Nxt - backup completo',
       DESCRIPTION = N'Backup completo gerado pela rotina do Nxt';

RESTORE VERIFYONLY
  FROM DISK = @arquivo
  WITH CHECKSUM;

PRINT 'Backup verificado: ' + @arquivo;
