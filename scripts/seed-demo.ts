// Seeds a local demo user + MOCK account and runs one sync pass.
// Usage: npm run db:seed
import { prisma } from "@dzong/database";
import { syncAccount } from "@dzong/sync-engine";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "me@dzong.local" },
    update: {},
    create: { email: "me@dzong.local", name: "Local User" },
  });

  const account = await prisma.emailAccount.upsert({
    where: {
      userId_emailAddress: { userId: user.id, emailAddress: "demo@dzong.local" },
    },
    update: {},
    create: {
      userId: user.id,
      provider: "MOCK",
      emailAddress: "demo@dzong.local",
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
