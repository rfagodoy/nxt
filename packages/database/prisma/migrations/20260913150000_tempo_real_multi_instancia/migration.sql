BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[scheduler_locks] (
    [name] NVARCHAR(1000) NOT NULL,
    [holder] NVARCHAR(1000) NOT NULL,
    [lockedUntil] DATETIME2 NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [scheduler_locks_pkey] PRIMARY KEY CLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[realtime_events] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [organizationId] NVARCHAR(1000) NOT NULL,
    [topicos] NVARCHAR(1000) NOT NULL,
    [em] DATETIME2 NOT NULL,
    CONSTRAINT [realtime_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [realtime_events_em_idx] ON [dbo].[realtime_events]([em]);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
