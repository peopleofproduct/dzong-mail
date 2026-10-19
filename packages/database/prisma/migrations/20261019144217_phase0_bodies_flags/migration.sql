-- AlterTable
ALTER TABLE "AISettings" ADD COLUMN     "customLabels" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "bodyText" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "scheduledAt" TIMESTAMP(3),
ADD COLUMN     "snoozedUntil" TIMESTAMP(3);
