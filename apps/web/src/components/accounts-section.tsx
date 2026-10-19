import { connection } from "next/server";
import { getAccounts } from "@/lib/queries";
import {
  connectMockAccount,
  connectOAuthAccount,
  syncAccountNow,
  updateAccountDisplayName,
  verifyAccountNow,
} from "@/lib/actions";
import { DisconnectButton } from "@/components/disconnect-button";
import { GmailConnectCard, OtherProviderCard } from "@/components/connect-forms";

const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: "Gmail",
  MICROSOFT: "Microsoft",
  IMAP_SMTP: "IMAP/SMTP",
  MOCK: "Demo",
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export async function AccountsSection() {
  await connection();
  const accounts = await getAccounts();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
        Accounts
      </h2>

      {accounts.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          No accounts connected yet. Add a demo inbox to see the sync engine in action, or connect a
          real provider below.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-black dark:text-zinc-100">
                  {account.displayName ?? account.emailAddress}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {account.emailAddress} · {PROVIDER_LABEL[account.provider] ?? account.provider} ·{" "}
                  {account._count.messages} messages
                  {account.lastSyncedAt
                    ? ` · synced ${account.lastSyncedAt.toLocaleString()}`
                    : " · never synced"}
                </span>
              </div>
              {account.provider !== "MOCK" && account.provider !== "IMPORTED" && (
                <form
                  action={verifyAccountNow.bind(null, account.id)}
                  title="Live-check credentials and connectivity"
                >
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Verify
                  </button>
                </form>
              )}
              <form action={syncAccountNow.bind(null, account.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                >
                  Sync now
                </button>
              </form>
              <DisconnectButton
                accountId={account.id}
                emailAddress={account.emailAddress}
                messageCount={account._count.messages}
                provider={account.provider}
              />
              <form
                action={updateAccountDisplayName}
                className="flex w-full items-center gap-2"
                title="Used as your From name and AI sign-off"
              >
                <input type="hidden" name="accountId" value={account.id} />
                <input
                  name="displayName"
                  defaultValue={account.displayName ?? ""}
                  placeholder="Your name (used in sign-offs)"
                  className={`${inputClass} w-56`}
                />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Save
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <details className="group" open={accounts.length === 0}>
        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-indigo-600 marker:hidden hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
          <span className="text-base leading-none">＋</span>
          {accounts.length === 0 ? "Connect an email account" : "Add another email account"}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <GmailConnectCard connectedEmails={accounts.map((a) => a.emailAddress)} />
          <OtherProviderCard connectedEmails={accounts.map((a) => a.emailAddress)} />

          <div className="flex flex-col gap-3">
            {/* Demo is first-run education only — once a real provider is
                connected it would just pollute the inbox with fake mail. */}
            {!accounts.some((a) => a.provider !== "MOCK") && (
              <form
                action={connectMockAccount}
                className="flex flex-1 flex-col justify-between gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
              >
                <div>
                  <p className="text-sm font-medium text-black dark:text-zinc-100">Demo inbox</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Just exploring? A pretend mailbox — no credentials, nothing leaves the machine.
                  </p>
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                >
                  Add demo account
                </button>
              </form>
            )}

            <details className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
              <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-100">
                Advanced: Google / Microsoft OAuth
              </summary>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Uses the Gmail / Microsoft Graph APIs instead of IMAP. Requires your own OAuth app
                credentials — see docs/SETUP.md.
              </p>
              <form action={connectOAuthAccount} className="mt-3 flex flex-col gap-2">
                <select name="provider" className={inputClass} defaultValue="GOOGLE">
                  <option value="GOOGLE">Google</option>
                  <option value="MICROSOFT">Microsoft</option>
                </select>
                <input
                  name="clientId"
                  placeholder="OAuth client ID"
                  required
                  className={inputClass}
                />
                <input
                  name="clientSecret"
                  placeholder="OAuth client secret"
                  type="password"
                  required
                  className={inputClass}
                />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  Connect via OAuth
                </button>
              </form>
            </details>
          </div>
        </div>
      </details>
    </section>
  );
}
