-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "contentText" TEXT;

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "attendees" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "recurrence" TEXT;

-- CreateTable
CREATE TABLE "AiDecision" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEntry" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "detail" JSONB,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiDecision_messageId_idx" ON "AiDecision"("messageId");

-- CreateIndex
CREATE INDEX "AiDecision_status_createdAt_idx" ON "AiDecision"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEntry_createdAt_idx" ON "AuditEntry"("createdAt");

-- CreateIndex
CREATE INDEX "Attachment_contentHash_idx" ON "Attachment"("contentHash");

-- AddForeignKey
ALTER TABLE "AiDecision" ADD CONSTRAINT "AiDecision_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
