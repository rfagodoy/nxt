BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[process_definition_versions] (
    [id] NVARCHAR(1000) NOT NULL,
    [processId] NVARCHAR(1000) NOT NULL,
    [version] INT NOT NULL,
    [bpmnXml] NVARCHAR(max) NOT NULL,
    [formSchema] NVARCHAR(max) NOT NULL,
    [compiledGraph] NVARCHAR(max),
    [status] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(1000) NOT NULL,
    [atividades] INT NOT NULL CONSTRAINT [process_definition_versions_atividades_df] DEFAULT 0,
    [user] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [process_definition_versions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [process_definition_versions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[process_audit_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [processId] NVARCHAR(1000) NOT NULL,
    [user] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [event] NVARCHAR(1000) NOT NULL,
    [changes] NVARCHAR(max) NOT NULL CONSTRAINT [process_audit_logs_changes_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [process_audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [process_audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [process_definition_versions_processId_createdAt_idx] ON [dbo].[process_definition_versions]([processId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [process_audit_logs_processId_idx] ON [dbo].[process_audit_logs]([processId]);

-- AddForeignKey
ALTER TABLE [dbo].[process_definition_versions] ADD CONSTRAINT [process_definition_versions_processId_fkey] FOREIGN KEY ([processId]) REFERENCES [dbo].[process_definitions]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[process_audit_logs] ADD CONSTRAINT [process_audit_logs_processId_fkey] FOREIGN KEY ([processId]) REFERENCES [dbo].[process_definitions]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
