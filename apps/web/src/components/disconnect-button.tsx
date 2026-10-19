"use client";

import { useTransition } from "react";
import { removeAccount } from "@/lib/actions";

/** Disconnect = sign-out for a mail account: deletes the account, its synced
 * mail, and its attachment files. Destructive — confirm first. */
export function DisconnectButton({
  accountId,
  emailAddress,
  messageCount,
}: {
  accountId: string;
  emailAddress: string;
  messageCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          window.confirm(
            `Disconnect ${emailAddress}?\n\nThis deletes the account and all ${messageCount} synced messages (including downloaded attachments) from this machine. It does not affect mail on the provider's server.`,
          )
        ) {
          startTransition(() => removeAccount(accountId));
        }
      }}
      className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
