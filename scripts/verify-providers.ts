/**
 * Live provider verification harness — exercises every connected account's
 * real connectivity path without touching mail data:
 *   IMAP_SMTP  -> IMAP login + INBOX lock, SMTP probe
 *   GOOGLE     -> token refresh (if needed) + gmail.users.getProfile
 *   MICROSOFT  -> token refresh (if needed) + Graph /me
 *
 * Usage: npm run verify:providers
 * Exit code is non-zero when any account fails, so it doubles as a
 * pre-release smoke check.
 */
import { verifyAllAccounts } from "../packages/sync-engine/src/verify";

const outcomes = await verifyAllAccounts();
if (outcomes.length === 0) {
  console.log("No accounts connected - nothing to verify.");
  process.exit(0);
}
for (const o of outcomes) {
  console.log(`${o.ok ? "PASS" : "FAIL"}  ${o.provider.padEnd(10)} ${o.emailAddress}`);
  console.log(`      ${o.detail}`);
}
const failed = outcomes.filter((o) => !o.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} account(s) failed verification.`);
  process.exit(1);
}
console.log("\nAll accounts verified.");
