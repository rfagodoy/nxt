BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[organizations] (
    [id] NVARCHAR(1000) NOT NULL,
    [externalId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [organizations_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [organizations_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [organizations_externalId_key] UNIQUE NONCLUSTERED ([externalId]),
    CONSTRAINT [organizations_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[users] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [passwordHash] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [users_role_df] DEFAULT 'user',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [users_status_df] DEFAULT 'ATIVO',
    [lastLoginAt] DATETIME2,
    [failedLoginAttempts] INT NOT NULL CONSTRAINT [users_failedLoginAttempts_df] DEFAULT 0,
    [lockedUntil] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [users_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [users_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [users_organizationId_email_key] UNIQUE NONCLUSTERED ([organizationId],[email])
);

-- CreateTable
CREATE TABLE [dbo].[refresh_tokens] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [tokenHash] NVARCHAR(1000) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2,
    [userAgent] NVARCHAR(1000),
    [ipAddress] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [refresh_tokens_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [refresh_tokens_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

-- CreateTable
CREATE TABLE [dbo].[login_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000),
    [userId] NVARCHAR(1000),
    [email] NVARCHAR(1000) NOT NULL,
    [success] BIT NOT NULL,
    [reason] NVARCHAR(1000),
    [ipAddress] NVARCHAR(1000),
    [userAgent] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [login_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [login_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[process_definitions] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [bpmnXml] NVARCHAR(max) NOT NULL,
    [formSchema] NVARCHAR(max) NOT NULL,
    [compiledGraph] NVARCHAR(max),
    [version] INT NOT NULL CONSTRAINT [process_definitions_version_df] DEFAULT 1,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [process_definitions_status_df] DEFAULT 'DRAFT',
    [kind] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [process_definitions_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [process_definitions_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[process_instances] (
    [id] NVARCHAR(1000) NOT NULL,
    [processDefinitionId] NVARCHAR(1000) NOT NULL,
    [numero] INT,
    [definitionVersion] INT NOT NULL CONSTRAINT [process_instances_definitionVersion_df] DEFAULT 1,
    [revision] INT NOT NULL CONSTRAINT [process_instances_revision_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [process_instances_status_df] DEFAULT 'RUNNING',
    [currentStep] NVARCHAR(1000),
    [data] NVARCHAR(max) NOT NULL CONSTRAINT [process_instances_data_df] DEFAULT '{}',
    [state] NVARCHAR(max) NOT NULL CONSTRAINT [process_instances_state_df] DEFAULT '{}',
    [graphSnapshot] NVARCHAR(max),
    [startedBy] NVARCHAR(1000),
    [startedById] NVARCHAR(1000),
    [startedAt] DATETIME2 NOT NULL CONSTRAINT [process_instances_startedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [completedAt] DATETIME2,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [process_instances_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_compensations] (
    [id] NVARCHAR(1000) NOT NULL,
    [instanceId] NVARCHAR(1000) NOT NULL,
    [nodeId] NVARCHAR(1000) NOT NULL,
    [connector] NVARCHAR(1000) NOT NULL,
    [undoData] NVARCHAR(max) NOT NULL,
    [undoneAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [workflow_compensations_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [entityType] NVARCHAR(1000),
    [entityId] NVARCHAR(1000),
    [kind] NVARCHAR(1000),
    [compensable] BIT NOT NULL CONSTRAINT [workflow_compensations_compensable_df] DEFAULT 0,
    CONSTRAINT [workflow_compensations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_events] (
    [id] NVARCHAR(1000) NOT NULL,
    [instanceId] NVARCHAR(1000) NOT NULL,
    [taskId] NVARCHAR(1000),
    [event] NVARCHAR(1000) NOT NULL,
    [detail] NVARCHAR(1000),
    [payload] NVARCHAR(max),
    [fromUser] NVARCHAR(1000),
    [toUser] NVARCHAR(1000),
    [toUserId] NVARCHAR(1000),
    [reason] NVARCHAR(max) NOT NULL,
    [user] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [workflow_events_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [workflow_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_returns] (
    [id] NVARCHAR(1000) NOT NULL,
    [instanceId] NVARCHAR(1000) NOT NULL,
    [fromNodeId] NVARCHAR(1000) NOT NULL,
    [fromName] NVARCHAR(1000),
    [toNodeId] NVARCHAR(1000) NOT NULL,
    [toName] NVARCHAR(1000),
    [reason] NVARCHAR(max) NOT NULL,
    [user] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [workflow_returns_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [workflow_returns_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_tasks] (
    [id] NVARCHAR(1000) NOT NULL,
    [instanceId] NVARCHAR(1000) NOT NULL,
    [tokenId] NVARCHAR(1000) NOT NULL,
    [nodeId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [role] NVARCHAR(1000),
    [assignee] NVARCHAR(1000),
    [assignees] NVARCHAR(max) NOT NULL CONSTRAINT [workflow_tasks_assignees_df] DEFAULT '[]',
    [formRef] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [workflow_tasks_status_df] DEFAULT 'PENDING',
    [dueAt] DATETIME2,
    [escalatedAt] DATETIME2,
    [data] NVARCHAR(max) NOT NULL CONSTRAINT [workflow_tasks_data_df] DEFAULT '{}',
    [completedBy] NVARCHAR(1000),
    [completedById] NVARCHAR(1000),
    [completedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [workflow_tasks_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [workflow_tasks_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[workflow_roles] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [members] NVARCHAR(max) NOT NULL CONSTRAINT [workflow_roles_members_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [workflow_roles_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [workflow_roles_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [workflow_roles_organizationId_name_key] UNIQUE NONCLUSTERED ([organizationId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[role_assignments] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [papelId] NVARCHAR(1000) NOT NULL,
    [entityType] NVARCHAR(1000) NOT NULL,
    [entityId] NVARCHAR(1000),
    [userId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [role_assignments_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [role_assignments_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[modules] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [processDefinitionId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [schema] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [modules_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [modules_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [modules_processDefinitionId_key] UNIQUE NONCLUSTERED ([processDefinitionId]),
    CONSTRAINT [modules_organizationId_slug_key] UNIQUE NONCLUSTERED ([organizationId],[slug])
);

-- CreateTable
CREATE TABLE [dbo].[module_records] (
    [id] NVARCHAR(1000) NOT NULL,
    [moduleId] NVARCHAR(1000) NOT NULL,
    [processInstanceId] NVARCHAR(1000) NOT NULL,
    [data] NVARCHAR(max) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [module_records_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [module_records_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [module_records_processInstanceId_key] UNIQUE NONCLUSTERED ([processInstanceId])
);

-- CreateTable
CREATE TABLE [dbo].[partners] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [categoria] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [partners_status_df] DEFAULT 'EM_CADASTRAMENTO',
    [documento] NVARCHAR(1000),
    [razaoSocial] NVARCHAR(1000) NOT NULL,
    [nomeFantasia] NVARCHAR(1000),
    [ie] NVARCHAR(1000),
    [im] NVARCHAR(1000),
    [rg] NVARCHAR(1000),
    [orgaoExpedidor] NVARCHAR(1000),
    [dataNascimento] NVARCHAR(1000),
    [dataAbertura] NVARCHAR(1000),
    [naturezaJuridica] NVARCHAR(1000),
    [cnaePrincipal] NVARCHAR(1000),
    [cnaesSecundarios] NVARCHAR(max) NOT NULL CONSTRAINT [partners_cnaesSecundarios_df] DEFAULT '[]',
    [paisOrigem] NVARCHAR(1000),
    [contatos] NVARCHAR(max) NOT NULL CONSTRAINT [partners_contatos_df] DEFAULT '[]',
    [enderecos] NVARCHAR(max) NOT NULL CONSTRAINT [partners_enderecos_df] DEFAULT '[]',
    [bancos] NVARCHAR(max) NOT NULL CONSTRAINT [partners_bancos_df] DEFAULT '[]',
    [socios] NVARCHAR(max) NOT NULL CONSTRAINT [partners_socios_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [partners_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [partners_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[partner_audit_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [partnerId] NVARCHAR(1000) NOT NULL,
    [user] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [event] NVARCHAR(1000) NOT NULL,
    [motivo] NVARCHAR(1000),
    [changes] NVARCHAR(max) NOT NULL CONSTRAINT [partner_audit_logs_changes_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [partner_audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [partner_audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[cnaes] (
    [code] NVARCHAR(1000) NOT NULL,
    [descricao] NVARCHAR(max) NOT NULL,
    CONSTRAINT [cnaes_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[naturezas_juridicas] (
    [code] NVARCHAR(1000) NOT NULL,
    [descricao] NVARCHAR(max) NOT NULL,
    CONSTRAINT [naturezas_juridicas_pkey] PRIMARY KEY CLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[contracts] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [numero] NVARCHAR(1000) NOT NULL,
    [titulo] NVARCHAR(1000) NOT NULL,
    [tipo] NVARCHAR(1000) NOT NULL,
    [natureza] NVARCHAR(1000),
    [descricao] NVARCHAR(max),
    [objeto] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_objeto_df] DEFAULT '[]',
    [situacao] NVARCHAR(1000) NOT NULL CONSTRAINT [contracts_situacao_df] DEFAULT 'PENDENTE',
    [inicioVigencia] NVARCHAR(1000),
    [terminoVigencia] NVARCHAR(1000),
    [prazoIndeterminado] BIT NOT NULL CONSTRAINT [contracts_prazoIndeterminado_df] DEFAULT 0,
    [acaoTermino] NVARCHAR(1000),
    [renovacaoAnos] INT,
    [renovacaoMeses] INT,
    [renovacaoDias] INT,
    [dataAssinatura] NVARCHAR(1000),
    [moeda] NVARCHAR(1000) NOT NULL CONSTRAINT [contracts_moeda_df] DEFAULT 'BRL',
    [valorTotal] FLOAT(53) NOT NULL CONSTRAINT [contracts_valorTotal_df] DEFAULT 0,
    [valorParcela] FLOAT(53),
    [qtdParcelas] INT,
    [condicaoPagamento] NVARCHAR(1000),
    [formaPagamento] NVARCHAR(1000),
    [complementoValor] NVARCHAR(max),
    [renovacaoAutomatica] BIT NOT NULL CONSTRAINT [contracts_renovacaoAutomatica_df] DEFAULT 0,
    [observacoes] NVARCHAR(max),
    [partes] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_partes_df] DEFAULT '[]',
    [reajustes] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_reajustes_df] DEFAULT '[]',
    [pagamentos] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_pagamentos_df] DEFAULT '[]',
    [recebimentos] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_recebimentos_df] DEFAULT '[]',
    [aditivos] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_aditivos_df] DEFAULT '[]',
    [documentos] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_documentos_df] DEFAULT '[]',
    [renovacoes] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_renovacoes_df] DEFAULT '[]',
    [reajustesRealizados] NVARCHAR(max) NOT NULL CONSTRAINT [contracts_reajustesRealizados_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [contracts_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [contracts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[contract_audit_logs] (
    [id] NVARCHAR(1000) NOT NULL,
    [contractId] NVARCHAR(1000) NOT NULL,
    [user] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000),
    [event] NVARCHAR(1000) NOT NULL,
    [motivo] NVARCHAR(1000),
    [changes] NVARCHAR(max) NOT NULL CONSTRAINT [contract_audit_logs_changes_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [contract_audit_logs_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [contract_audit_logs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [contractId] NVARCHAR(1000),
    [userId] NVARCHAR(1000),
    [instanceId] NVARCHAR(1000),
    [taskId] NVARCHAR(1000),
    [tipo] NVARCHAR(1000) NOT NULL,
    [severidade] NVARCHAR(1000) NOT NULL CONSTRAINT [notifications_severidade_df] DEFAULT 'INFO',
    [titulo] NVARCHAR(1000) NOT NULL,
    [mensagem] NVARCHAR(max) NOT NULL,
    [dedupKey] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [notifications_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [emailedAt] DATETIME2,
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [notifications_organizationId_dedupKey_key] UNIQUE NONCLUSTERED ([organizationId],[dedupKey])
);

-- CreateTable
CREATE TABLE [dbo].[notification_reads] (
    [id] NVARCHAR(1000) NOT NULL,
    [notificationId] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [readAt] DATETIME2 NOT NULL CONSTRAINT [notification_reads_readAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [notification_reads_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [notification_reads_notificationId_userId_key] UNIQUE NONCLUSTERED ([notificationId],[userId])
);

-- CreateTable
CREATE TABLE [dbo].[documents] (
    [id] NVARCHAR(1000) NOT NULL,
    [moduleRecordId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [fileKey] NVARCHAR(1000) NOT NULL,
    [fileSize] INT NOT NULL,
    [mimeType] NVARCHAR(1000) NOT NULL,
    [uploadedAt] DATETIME2 NOT NULL CONSTRAINT [documents_uploadedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [documents_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[app_settings] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL CONSTRAINT [app_settings_userId_df] DEFAULT '',
    [key] NVARCHAR(1000) NOT NULL,
    [value] NVARCHAR(max) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [app_settings_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [app_settings_organizationId_userId_key_key] UNIQUE NONCLUSTERED ([organizationId],[userId],[key])
);

-- CreateTable
CREATE TABLE [dbo].[screens] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [subjectType] NVARCHAR(1000) NOT NULL CONSTRAINT [screens_subjectType_df] DEFAULT 'FORNECEDOR',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [screens_status_df] DEFAULT 'DRAFT',
    [isDefault] BIT NOT NULL CONSTRAINT [screens_isDefault_df] DEFAULT 0,
    [isSystem] BIT NOT NULL CONSTRAINT [screens_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [screens_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [screens_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[screen_sections] (
    [id] NVARCHAR(1000) NOT NULL,
    [screenId] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [screen_sections_source_df] DEFAULT 'CUSTOM',
    [nativeKey] NVARCHAR(1000),
    [visible] BIT NOT NULL CONSTRAINT [screen_sections_visible_df] DEFAULT 1,
    [order] INT NOT NULL CONSTRAINT [screen_sections_order_df] DEFAULT 0,
    [defaultOpen] BIT NOT NULL CONSTRAINT [screen_sections_defaultOpen_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [screen_sections_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [screen_sections_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[screen_fields] (
    [id] NVARCHAR(1000) NOT NULL,
    [screenId] NVARCHAR(1000) NOT NULL,
    [sectionId] NVARCHAR(1000),
    [name] NVARCHAR(1000) NOT NULL,
    [label] NVARCHAR(1000) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [screen_fields_source_df] DEFAULT 'CUSTOM',
    [nativeKey] NVARCHAR(1000),
    [mode] NVARCHAR(1000) NOT NULL CONSTRAINT [screen_fields_mode_df] DEFAULT 'EDIT',
    [visible] BIT NOT NULL CONSTRAINT [screen_fields_visible_df] DEFAULT 1,
    [required] BIT NOT NULL CONSTRAINT [screen_fields_required_df] DEFAULT 0,
    [placeholder] NVARCHAR(1000),
    [options] NVARCHAR(max),
    [validation] NVARCHAR(max),
    [hiddenCategories] NVARCHAR(max),
    [requiredCategories] NVARCHAR(max),
    [order] INT NOT NULL CONSTRAINT [screen_fields_order_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [screen_fields_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [screen_fields_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[screen_field_values] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [fieldId] NVARCHAR(1000) NOT NULL,
    [subjectType] NVARCHAR(1000) NOT NULL,
    [subjectId] NVARCHAR(1000) NOT NULL,
    [value] NVARCHAR(max) NOT NULL,
    [fieldNameSnapshot] NVARCHAR(1000) NOT NULL,
    [fieldLabelSnapshot] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [screen_field_values_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [screen_field_values_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [screen_field_values_subjectType_subjectId_fieldId_key] UNIQUE NONCLUSTERED ([subjectType],[subjectId],[fieldId])
);

-- CreateTable
CREATE TABLE [dbo].[group_companies] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [codigo] NVARCHAR(1000),
    [razaoSocial] NVARCHAR(1000) NOT NULL,
    [nomeFantasia] NVARCHAR(1000),
    [cnpj] NVARCHAR(1000),
    [ie] NVARCHAR(1000),
    [im] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [group_companies_status_df] DEFAULT 'ATIVA',
    [contatos] NVARCHAR(max) NOT NULL CONSTRAINT [group_companies_contatos_df] DEFAULT '[]',
    [enderecos] NVARCHAR(max) NOT NULL CONSTRAINT [group_companies_enderecos_df] DEFAULT '[]',
    [bancos] NVARCHAR(max) NOT NULL CONSTRAINT [group_companies_bancos_df] DEFAULT '[]',
    [socios] NVARCHAR(max) NOT NULL CONSTRAINT [group_companies_socios_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [group_companies_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [group_companies_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[org_units] (
    [id] NVARCHAR(1000) NOT NULL,
    [organizationId] NVARCHAR(1000) NOT NULL,
    [groupCompanyId] NVARCHAR(1000) NOT NULL,
    [parentId] NVARCHAR(1000),
    [natureza] NVARCHAR(1000) NOT NULL CONSTRAINT [org_units_natureza_df] DEFAULT 'ADMINISTRATIVA',
    [codigo] NVARCHAR(1000),
    [nome] NVARCHAR(1000) NOT NULL,
    [responsavel] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [org_units_status_df] DEFAULT 'ATIVA',
    [usuarios] NVARCHAR(max) NOT NULL CONSTRAINT [org_units_usuarios_df] DEFAULT '[]',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [org_units_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [org_units_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [users_organizationId_idx] ON [dbo].[users]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [refresh_tokens_userId_idx] ON [dbo].[refresh_tokens]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [login_events_email_idx] ON [dbo].[login_events]([email]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [login_events_createdAt_idx] ON [dbo].[login_events]([createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [workflow_compensations_instanceId_idx] ON [dbo].[workflow_compensations]([instanceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [workflow_events_instanceId_idx] ON [dbo].[workflow_events]([instanceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [workflow_returns_instanceId_idx] ON [dbo].[workflow_returns]([instanceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [workflow_tasks_instanceId_idx] ON [dbo].[workflow_tasks]([instanceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [workflow_tasks_status_idx] ON [dbo].[workflow_tasks]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [workflow_roles_organizationId_idx] ON [dbo].[workflow_roles]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [role_assignments_organizationId_entityType_entityId_idx] ON [dbo].[role_assignments]([organizationId], [entityType], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [role_assignments_organizationId_papelId_idx] ON [dbo].[role_assignments]([organizationId], [papelId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [role_assignments_organizationId_userId_idx] ON [dbo].[role_assignments]([organizationId], [userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [partners_organizationId_idx] ON [dbo].[partners]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [partner_audit_logs_partnerId_idx] ON [dbo].[partner_audit_logs]([partnerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [contracts_organizationId_idx] ON [dbo].[contracts]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [contract_audit_logs_contractId_idx] ON [dbo].[contract_audit_logs]([contractId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_organizationId_idx] ON [dbo].[notifications]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_organizationId_userId_idx] ON [dbo].[notifications]([organizationId], [userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_taskId_idx] ON [dbo].[notifications]([taskId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_organizationId_createdAt_idx] ON [dbo].[notifications]([organizationId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notification_reads_notificationId_idx] ON [dbo].[notification_reads]([notificationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [app_settings_organizationId_key_idx] ON [dbo].[app_settings]([organizationId], [key]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [screens_organizationId_subjectType_idx] ON [dbo].[screens]([organizationId], [subjectType]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [screen_sections_screenId_idx] ON [dbo].[screen_sections]([screenId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [screen_fields_screenId_idx] ON [dbo].[screen_fields]([screenId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [screen_field_values_organizationId_subjectType_subjectId_idx] ON [dbo].[screen_field_values]([organizationId], [subjectType], [subjectId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [screen_field_values_fieldId_idx] ON [dbo].[screen_field_values]([fieldId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [group_companies_organizationId_idx] ON [dbo].[group_companies]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [org_units_organizationId_idx] ON [dbo].[org_units]([organizationId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [org_units_groupCompanyId_idx] ON [dbo].[org_units]([groupCompanyId]);

-- AddForeignKey
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[refresh_tokens] ADD CONSTRAINT [refresh_tokens_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[users]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[process_definitions] ADD CONSTRAINT [process_definitions_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[process_instances] ADD CONSTRAINT [process_instances_processDefinitionId_fkey] FOREIGN KEY ([processDefinitionId]) REFERENCES [dbo].[process_definitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[workflow_compensations] ADD CONSTRAINT [workflow_compensations_instanceId_fkey] FOREIGN KEY ([instanceId]) REFERENCES [dbo].[process_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[workflow_events] ADD CONSTRAINT [workflow_events_instanceId_fkey] FOREIGN KEY ([instanceId]) REFERENCES [dbo].[process_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[workflow_returns] ADD CONSTRAINT [workflow_returns_instanceId_fkey] FOREIGN KEY ([instanceId]) REFERENCES [dbo].[process_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[workflow_tasks] ADD CONSTRAINT [workflow_tasks_instanceId_fkey] FOREIGN KEY ([instanceId]) REFERENCES [dbo].[process_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[modules] ADD CONSTRAINT [modules_organizationId_fkey] FOREIGN KEY ([organizationId]) REFERENCES [dbo].[organizations]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[modules] ADD CONSTRAINT [modules_processDefinitionId_fkey] FOREIGN KEY ([processDefinitionId]) REFERENCES [dbo].[process_definitions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[module_records] ADD CONSTRAINT [module_records_moduleId_fkey] FOREIGN KEY ([moduleId]) REFERENCES [dbo].[modules]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[module_records] ADD CONSTRAINT [module_records_processInstanceId_fkey] FOREIGN KEY ([processInstanceId]) REFERENCES [dbo].[process_instances]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[partner_audit_logs] ADD CONSTRAINT [partner_audit_logs_partnerId_fkey] FOREIGN KEY ([partnerId]) REFERENCES [dbo].[partners]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[contract_audit_logs] ADD CONSTRAINT [contract_audit_logs_contractId_fkey] FOREIGN KEY ([contractId]) REFERENCES [dbo].[contracts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_contractId_fkey] FOREIGN KEY ([contractId]) REFERENCES [dbo].[contracts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[notification_reads] ADD CONSTRAINT [notification_reads_notificationId_fkey] FOREIGN KEY ([notificationId]) REFERENCES [dbo].[notifications]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[documents] ADD CONSTRAINT [documents_moduleRecordId_fkey] FOREIGN KEY ([moduleRecordId]) REFERENCES [dbo].[module_records]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[screen_sections] ADD CONSTRAINT [screen_sections_screenId_fkey] FOREIGN KEY ([screenId]) REFERENCES [dbo].[screens]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[screen_fields] ADD CONSTRAINT [screen_fields_screenId_fkey] FOREIGN KEY ([screenId]) REFERENCES [dbo].[screens]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[org_units] ADD CONSTRAINT [org_units_groupCompanyId_fkey] FOREIGN KEY ([groupCompanyId]) REFERENCES [dbo].[group_companies]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[org_units] ADD CONSTRAINT [org_units_parentId_fkey] FOREIGN KEY ([parentId]) REFERENCES [dbo].[org_units]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

