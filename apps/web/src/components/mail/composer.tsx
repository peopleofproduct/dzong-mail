"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { sendEmailAction } from "@/lib/actions";
import { buildParams } from "./params";

interface AccountOption {
  id: string;
  emailAddress: string;
  provider: string;
}

interface ComposerProps {
  accounts: AccountOption[];
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black placeholder-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export function Composer({ accounts }: ComposerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("compose");
  if (!mode) return null;

  const close = () => router.push(buildParams(searchParams, { compose: undefined }));
  const isReply = mode === "reply";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={close}
    >
      <div
        className="w-full max-w-xl rounded-t-xl bg-white shadow-2xl sm:rounded-xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isReply ? "Reply" : "New message"}
          </h3>
          <button onClick={close} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <form action={sendEmailAction} className="flex flex-col gap-2 p-4">
          <select
            name="accountId"
            defaultValue={searchParams.get("accountId") ?? accounts[0]?.id}
            className={inputClass}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                From: {a.emailAddress}
              </option>
            ))}
          </select>
          <input
            name="to"
            type="text"
            placeholder="To"
            required
            defaultValue={searchParams.get("to") ?? ""}
            className={inputClass}
            autoFocus={!isReply}
          />
          <input name="cc" type="text" placeholder="Cc" className={inputClass} />
          <input
            name="subject"
            type="text"
            placeholder="Subject"
            defaultValue={searchParams.get("subject") ?? ""}
            className={inputClass}
          />
          <input type="hidden" name="threadId" value={searchParams.get("threadId") ?? ""} />
          <input type="hidden" name="inReplyTo" value={searchParams.get("inReplyTo") ?? ""} />
          <textarea
            name="body"
            rows={10}
            placeholder="Write your message…"
            required
            className={`${inputClass} resize-y font-mono`}
            autoFocus={isReply}
          />
          <div className="flex items-center justify-between">
            <select
              name="sendLater"
              defaultValue=""
              className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Send now</option>
              <option value="1">In 1 hour</option>
              <option value="4">In 4 hours</option>
              <option value="24">Tomorrow</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
