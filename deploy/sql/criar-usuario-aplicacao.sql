/* Usuário de banco da APLICAÇÃO, com o mínimo de privilégio que o Nxt precisa.
 *
 * Por que isto existe: até aqui a aplicação conectava como `sa`. Com `sa`, qualquer
 * falha de injeção — ou o vazamento de um único arquivo `.env` — entrega a INSTÂNCIA
 * INTEIRA do SQL Server, não só o banco do Nxt: outros bancos, logins, jobs, e leitura
 * de arquivos do servidor. É a diferença entre um incidente e uma catástrofe.
 *
 * O que este usuário PODE: ler e gravar dados no banco do Nxt, e executar as migrações
 * (criar/alterar tabelas, índices e chaves).
 * O que ele NÃO pode: sair do banco do Nxt, criar logins, ler outros bancos, mexer na
 * instância.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO USAR (conectado como administrador da instância, uma única vez):
 *
 *   sqlcmd -S SERVIDOR -U sa -P *** -C -i criar-usuario-aplicacao.sql \
 *          -v BANCO="nxt" LOGIN="nxt_app" SENHA="<senha forte e única>"
 *
 * Depois aponte a DATABASE_URL para ele:
 *   sqlserver://SERVIDOR:1433;database=nxt;user=nxt_app;password=***;encrypt=true
 *
 * ⚠️ A senha aparece na linha de comando e fica no histórico do shell. Rode a partir de
 *    um arquivo, ou limpe o histórico depois.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * SOBRE db_ddladmin: o Nxt aplica migrações no próprio boot da implantação
 * (`npm run db:deploy`), então o usuário da aplicação PRECISA poder alterar o schema.
 * A alternativa — um segundo usuário só para migrar — é mais segura e mais chata: dois
 * segredos para operar, e a instalação falha se quem instala usar o errado. Ficou
 * registrado como escolha consciente, não como descuido. Se a política do cliente
 * exigir separação, veja o bloco comentado no fim deste arquivo.
 */
SET NOCOUNT ON;

DECLARE @banco SYSNAME = N'$(BANCO)';
DECLARE @login SYSNAME = N'$(LOGIN)';
DECLARE @senha NVARCHAR(128) = N'$(SENHA)';

IF DB_ID(@banco) IS NULL
BEGIN
  RAISERROR(N'O banco não existe. Crie-o antes (CREATE DATABASE) e rode de novo.', 16, 1);
  RETURN;
END

/* 1) LOGIN na instância — sem nenhum papel de servidor.
      CHECK_POLICY liga a política de senha do Windows/AD: senha fraca é recusada aqui,
      e não descoberta depois num teste de invasão. */
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @login)
BEGIN
  DECLARE @criar NVARCHAR(MAX) =
    N'CREATE LOGIN ' + QUOTENAME(@login) + N' WITH PASSWORD = ' + QUOTENAME(@senha, '''') +
    N', CHECK_POLICY = ON, DEFAULT_DATABASE = ' + QUOTENAME(@banco) + N';';
  EXEC (@criar);
  PRINT 'Login criado: ' + @login;
END
ELSE
  PRINT 'Login já existia (senha NÃO alterada): ' + @login;

/* 2) USUÁRIO dentro do banco do Nxt, com os papéis mínimos. */
DECLARE @sql NVARCHAR(MAX) = N'
USE ' + QUOTENAME(@banco) + N';
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = ' + QUOTENAME(@login, '''') + N')
BEGIN
  CREATE USER ' + QUOTENAME(@login) + N' FOR LOGIN ' + QUOTENAME(@login) + N';
END

-- ler e gravar dados
ALTER ROLE db_datareader ADD MEMBER ' + QUOTENAME(@login) + N';
ALTER ROLE db_datawriter ADD MEMBER ' + QUOTENAME(@login) + N';
-- criar/alterar tabelas: exigido pelas migrações (ver nota no cabeçalho)
ALTER ROLE db_ddladmin  ADD MEMBER ' + QUOTENAME(@login) + N';

-- NÃO entra em db_owner nem em db_securityadmin: dono do banco pode apagar o banco e
-- distribuir permissão para terceiros, que é exatamente o que se quer evitar.
';
EXEC (@sql);

PRINT 'Usuário de aplicação pronto em [' + @banco + ']: ' + @login;
PRINT 'Papéis: db_datareader, db_datawriter, db_ddladmin. Nenhum papel de servidor.';
PRINT '';
PRINT 'Verificado em SQL Server 2022: com este usuário, CREATE LOGIN, CREATE DATABASE';
PRINT 'e DROP DATABASE são NEGADOS; leitura, gravação e DDL no banco do Nxt funcionam.';
PRINT 'Ele ainda enxerga o NOME de alguns logins da instância (metadados que o SQL';
PRINT 'Server mostra por padrão) — nome, nunca senha nem hash.';
PRINT '';
PRINT 'Aponte a DATABASE_URL para ele e reinicie a aplicação:';
PRINT '  sqlserver://SERVIDOR:1433;database=' + @banco + ';user=' + @login + ';password=***;encrypt=true';

/* ─────────────────────────────────────────────────────────────────────────────
   OPCIONAL — separar quem MIGRA de quem OPERA (política mais rígida).

   Crie um segundo login só para migração, com db_ddladmin, e tire db_ddladmin do
   usuário da aplicação. A DATABASE_URL do serviço usa o usuário sem DDL; o
   `npm run db:deploy` roda com o outro, na janela de manutenção.

   Custo real: dois segredos para operar e uma instalação que falha de forma confusa
   se quem instalar usar o usuário errado. Só vale quando a política do cliente exigir.

   ALTER ROLE db_ddladmin DROP MEMBER [nxt_app];
   CREATE LOGIN [nxt_migrate] WITH PASSWORD = '***', CHECK_POLICY = ON;
   CREATE USER  [nxt_migrate] FOR LOGIN [nxt_migrate];
   ALTER ROLE db_ddladmin ADD MEMBER [nxt_migrate];
   ───────────────────────────────────────────────────────────────────────────── */
