"use client";

import { useState, useTransition } from "react";
import { removeAccount } from "@/lib/actions";

/** Provider-specific "fully sign out" guidance shown in the disconnect modal. */
function revokeStep(provider: string, emailAddress: string) {
  if (provider === "GOOGLE") {
    return {
      text: "To fully sign out, also revoke access in your Google account:",
      url: "https://myaccount.google.com/permissions",
      linkLabel: "Google → Third-party access",
    };
  }
  if (provider === "MICROSOFT") {
    return {
      text: "To fully sign out, also revoke access in your Microsoft account:",
      url: "https://account.live.com/consent/Manage",
      linkLabel: "Microsoft → App permissions",
    };
  }
  if (emailAddress.endsWith("@gmail.com") || emailAddress.endsWith("@googlemail.com")) {
    return {
      text: "Since this account uses a Google app password, you can also delete it:",
      url: "https://myaccount.google.com/apppasswords",
      linkLabel: "Google → App passwords",
    };
  }
  return {
    text: "If you used an app password, you can delete it in your provider's security settings.",
    url: null,
    linkLabel: null,
  };
}

/** Disconnect = sign-out for a mail account: deletes the account, its synced
 * mail, and its attachment files. Destructive — a modal explains it first. */
export function DisconnectButton({
  accountId,
  emailAddress,
  messageCount,
  provider,
}: {
  accountId: string;
  emailAddress: string;
  messageCount: number;
  provider: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const revoke = revokeStep(provider, emailAddress);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        Disconnect
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Disconnect {emailAddress}?
            </h3>
            <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              <p>
                This removes the account and deletes its{" "}
                <strong className="text-zinc-700 dark:text-zinc-300">
                  {messageCount} synced message{messageCount === 1 ? "" : "s"}
                </strong>{" "}
                — including downloaded attachments — from this machine.
              </p>
              <p>Mail on the provider&apos;s server is not affected.</p>
              <p>
                {revoke.text}{" "}
                {revoke.url && (
                  <a
                    href={revoke.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-600 underline dark:text-indigo-400"
                  >
                    {revoke.linkLabel} ↗
                  </a>
                )}
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Keep connected
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => removeAccount(accountId))}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "Disconnecting…" : "Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
