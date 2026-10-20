import { prisma } from "@dzong/database";
import {
  classifyAccountMessages,
  draftAiReply,
  generateRuleFromPrompt,
  summarizeThread,
  applyAutomationRules,
} from "@dzong/sync-engine";

async function main() {
  const user = await prisma.user.findFirstOrThrow();
  await prisma.aISettings.upsert({
    where: { userId: user.id },
    update: { provider: "OLLAMA", model: "llama3.2:3b", enabled: true },
    create: {
      userId: user.id,
      provider: "OLLAMA",
      model: "llama3.2:3b",
      enabled: true,
      temperature: 0.2,
    },
  });
  console.log("AI settings enabled (Ollama / llama3.2:3b)");

  const account = await prisma.emailAccount.findFirstOrThrow({ where: { provider: "MOCK" } });

  console.log(
    "CLASSIFY:",
    JSON.stringify(await classifyAccountMessages(account.id, prisma, { limit: 10 })),
  );

  const msg = await prisma.message.findFirstOrThrow({
    where: { isDraft: false, threadId: { not: null } },
  });
  console.log("DRAFT:", JSON.stringify(await draftAiReply(msg.id)));

  console.log("SUMMARY:", JSON.stringify(await summarizeThread(msg.threadId!)));

  console.log(
    "NL RULE:",
    JSON.stringify(
      await generateRuleFromPrompt(user.id, "archive newsletters from noreply senders"),
    ),
  );

  // Ensure the cold-email preset exists, then run all rules
  await prisma.automationRule.upsert({
    where: { id: "preset-cold-email" },
    update: {},
    create: {
      id: "preset-cold-email",
      userId: user.id,
      name: "Cold email blocker",
      trigger: "ON_AI_CLASSIFICATION",
      matchMode: "ALL",
      conditions: [{ field: "aiLabel", operator: "contains", value: "COLD_PITCH" }],
      actions: [{ type: "ADD_LABEL", value: "COLD_EMAIL" }, { type: "ARCHIVE" }],
    },
  });
  console.log("RULES:", JSON.stringify(await applyAutomationRules(account.id)));

  const labelRows = await prisma.message.groupBy({ by: ["aiLabels"], _count: true });
  console.log("LABEL DIST:", JSON.stringify(labelRows.slice(0, 10)));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
