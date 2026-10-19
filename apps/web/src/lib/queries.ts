import { prisma } from "@/lib/db";

export async function getAccounts() {
  return prisma.emailAccount.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { messages: true } } },
  });
}

export async function getRecentMessages(take = 50) {
  return prisma.message.findMany({
    orderBy: { receivedAt: "desc" },
    take,
    include: { emailAccount: { select: { emailAddress: true, provider: true } } },
  });
}
