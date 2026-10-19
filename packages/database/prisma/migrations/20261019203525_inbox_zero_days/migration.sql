-- CreateTable
CREATE TABLE "InboxZeroDay" (
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxZeroDay_pkey" PRIMARY KEY ("date")
);
