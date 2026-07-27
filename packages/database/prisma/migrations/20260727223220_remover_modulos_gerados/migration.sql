/*
  Warnings:

  - You are about to drop the `documents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `module_records` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `modules` table. If the table is not empty, all the data it contains will be lost.

*/
BEGIN TRY

BEGIN TRAN;

-- DropForeignKey
ALTER TABLE [dbo].[documents] DROP CONSTRAINT [documents_moduleRecordId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[module_records] DROP CONSTRAINT [module_records_moduleId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[module_records] DROP CONSTRAINT [module_records_processInstanceId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[modules] DROP CONSTRAINT [modules_organizationId_fkey];

-- DropForeignKey
ALTER TABLE [dbo].[modules] DROP CONSTRAINT [modules_processDefinitionId_fkey];

-- DropTable
DROP TABLE [dbo].[documents];

-- DropTable
DROP TABLE [dbo].[module_records];

-- DropTable
DROP TABLE [dbo].[modules];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
