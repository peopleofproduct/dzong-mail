import { getAccounts } from "@/lib/queries";
import {
  connectImapAccount,
  connectMockAccount,
  connectOAuthAccount,
  removeAccount,
  syncAccountNow,
} from "@/lib/actions";

const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: "Gmail",
  MICROSOFT: "Microsoft",
  IMAP_SMTP: "IMAP/SMTP",
  MOCK: "Demo",
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export async function AccountsSection() {
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
              <form action={syncAccountNow.bind(null, account.id)}>
                <button
                  type="submit"
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
                >
                  Sync now
                </button>
              </form>
              <form action={removeAccount.bind(null, account.id)}>
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <form
          action={connectMockAccount}
          className="flex flex-col justify-between gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
        >
          <div>
            <p className="text-sm font-medium text-black dark:text-zinc-100">Demo inbox</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Local mock provider — no credentials needed.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            Add demo account
          </button>
        </form>

        <form
          action={connectOAuthAccount}
          className="flex flex-col gap-2 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
        >
          <p className="text-sm font-medium text-black dark:text-zinc-100">
            Gmail / Microsoft (BYOK)
          </p>
          <select name="provider" className={inputClass} defaultValue="GOOGLE">
            <option value="GOOGLE">Google</option>
            <option value="MICROSOFT">Microsoft</option>
          </select>
          <input name="clientId" placeholder="OAuth client ID" required className={inputClass} />
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

        <details className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
          <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-100">
            IMAP / SMTP
          </summary>
          <form action={connectImapAccount} className="mt-3 flex flex-col gap-2">
            <input
              name="emailAddress"
              type="email"
              placeholder="you@example.com"
              required
              className={inputClass}
            />
            <input name="imapHost" placeholder="imap.example.com" required className={inputClass} />
            <div className="flex gap-2">
              <input name="imapPort" placeholder="993" className={inputClass} />
              <select name="imapSecurity" className={inputClass} defaultValue="SSL_TLS">
                <option value="SSL_TLS">SSL/TLS</option>
                <option value="STARTTLS">STARTTLS</option>
                <option value="NONE">None</option>
              </select>
            </div>
            <input
              name="smtpHost"
              placeholder="smtp.example.com (optional)"
              className={inputClass}
            />
            <input name="smtpPort" placeholder="465" className={inputClass} />
            <input name="username" placeholder="Username" required className={inputClass} />
            <input
              name="password"
              type="password"
              placeholder="Password / app password"
              required
              className={inputClass}
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Connect mailbox
            </button>
          </form>
        </details>
      </div>
    </section>
  );
}
