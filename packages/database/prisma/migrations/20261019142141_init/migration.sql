-- CreateEnum
CREATE TYPE "MailProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'IMAP_SMTP', 'MOCK');

-- CreateEnum
CREATE TYPE "EncryptionType" AS ENUM ('NONE', 'SSL_TLS', 'STARTTLS');

-- CreateEnum
CREATE TYPE "AIProvider" AS ENUM ('OLLAMA', 'OPENAI', 'ANTHROPIC');

-- CreateEnum
CREATE TYPE "RuleTrigger" AS ENUM ('ON_MESSAGE_SYNC', 'ON_AI_CLASSIFICATION', 'MANUAL');

-- CreateEnum
CREATE TYPE "RuleMatchMode" AS ENUM ('ALL', 'ANY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarPath" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "MailProvider" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "displayName" TEXT,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "imapSecurity" "EncryptionType",
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecurity" "EncryptionType",
    "username" TEXT,
    "passwordEncrypted" TEXT,
    "oauthClientId" TEXT,
    "oauthClientSecret" TEXT,
    "oauthAccessToken" TEXT,
    "oauthRefreshToken" TEXT,
    "oauthTokenExpiresAt" TIMESTAMP(3),
    "oauthScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncToken" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "threadId" TEXT,
    "folder" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "fromAddress" TEXT NOT NULL,
    "fromName" TEXT,
    "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "headers" JSONB,
    "sizeBytes" INTEGER,
    "localBodyPath" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "providerLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiLabels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AIProvider" NOT NULL DEFAULT 'OLLAMA',
    "baseUrl" TEXT,
    "apiKeyEncrypted" TEXT,
    "model" TEXT NOT NULL DEFAULT 'llama3.1',
    "embeddingModel" TEXT,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailAccountId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "trigger" "RuleTrigger" NOT NULL DEFAULT 'ON_MESSAGE_SYNC',
    "matchMode" "RuleMatchMode" NOT NULL DEFAULT 'ALL',
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "EmailAccount_userId_idx" ON "EmailAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_userId_emailAddress_key" ON "EmailAccount"("userId", "emailAddress");

-- CreateIndex
CREATE INDEX "Message_emailAccountId_receivedAt_idx" ON "Message"("emailAccountId", "receivedAt");

-- CreateIndex
CREATE INDEX "Message_threadId_idx" ON "Message"("threadId");

-- CreateIndex
CREATE INDEX "Message_fromAddress_idx" ON "Message"("fromAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Message_emailAccountId_providerMessageId_key" ON "Message"("emailAccountId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AISettings_userId_key" ON "AISettings"("userId");

-- CreateIndex
CREATE INDEX "AutomationRule_userId_isEnabled_priority_idx" ON "AutomationRule"("userId", "isEnabled", "priority");

-- AddForeignKey
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISettings" ADD CONSTRAINT "AISettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
