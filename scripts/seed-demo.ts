// Seeds a local demo user + MOCK account and runs one sync pass.
// Usage: npm run db:seed
import { prisma } from "@unwalled/database";
import { syncAccount } from "@unwalled/sync-engine";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "me@unwalled.local" },
    update: {},
    create: { email: "me@unwalled.local", name: "Local User" },
  });

  const account = await prisma.emailAccount.upsert({
    where: {
      userId_emailAddress: { userId: user.id, emailAddress: "demo@unwalled.local" },
    },
    update: {},
    create: {
      userId: user.id,
      provider: "MOCK",
      emailAddress: "demo@unwalled.local",
      displayName: "Demo Inbox",
    },
  });

  const outcome = await syncAccount(account.id);
  const count = await prisma.message.count({ where: { emailAccountId: account.id } });
  console.log(`Sync complete: ${JSON.stringify(outcome)} — total messages: ${count}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
