"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { composeBodyWithAI, sendEmailAction } from "@/lib/actions";
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
  const searchParams = useSearchParams();
  if (!searchParams.get("compose")) return null;
  // Key by the compose-relevant params so each compose session mounts fresh
  // state (prefilled body, draft id) without losing a half-typed email when
  // unrelated params change.
  const sessionKey = ["compose", "draftId", "to", "subject", "body", "threadId", "accountId"]
    .map((k) => `${k}=${searchParams.get(k) ?? ""}`)
    .join("&");
  return <ComposerInner accounts={accounts} key={sessionKey} />;
}

function ComposerInner({ accounts }: ComposerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("compose")!;
  const [body, setBody] = useState(searchParams.get("body") ?? "");
  const [aiError, setAiError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLInputElement>(null);

  const close = () => router.push(buildParams(searchParams, { compose: undefined }));
  const isReply = mode === "reply";
  const isDraft = mode === "draft";

  const writeWithAI = () => {
    setAiError(null);
    startTransition(async () => {
      const result = await composeBodyWithAI({
        to: toRef.current?.value,
        subject: subjectRef.current?.value,
        instructions: hintRef.current?.value,
      });
      if (result.ok && result.body) setBody(result.body);
      else setAiError(result.reason ?? "AI failed");
    });
  };

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
            {isReply ? "Reply" : isDraft ? "Edit draft" : "New message"}
          </h3>
          <button onClick={close} className="text-zinc-400 hover:text-zinc-600" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <form
          action={sendEmailAction}
          className="flex flex-col gap-2 p-4"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.requestSubmit();
            }
          }}
        >
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
            autoFocus={!isReply && !isDraft}
            ref={toRef}
          />
          <input name="cc" type="text" placeholder="Cc" className={inputClass} />
          <input
            name="subject"
            type="text"
            placeholder="Subject"
            defaultValue={searchParams.get("subject") ?? ""}
            className={inputClass}
            ref={subjectRef}
          />
          <input type="hidden" name="threadId" value={searchParams.get("threadId") ?? ""} />
          <input type="hidden" name="inReplyTo" value={searchParams.get("inReplyTo") ?? ""} />
          <input type="hidden" name="draftId" value={searchParams.get("draftId") ?? ""} />
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Optional: tell the AI what to write (e.g. 'politely decline')"
              className={`${inputClass} flex-1 text-xs`}
              ref={hintRef}
            />
            <button
              type="button"
              onClick={writeWithAI}
              disabled={pending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-indigo-300 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              <Sparkles size={13} />
              {pending ? "Writing…" : "Write with AI"}
            </button>
          </div>
          {aiError && <p className="text-xs text-red-500">{aiError}</p>}
          <textarea
            name="body"
            rows={10}
            placeholder="Write your message…"
            required
            className={`${inputClass} resize-y font-mono`}
            autoFocus={isReply}
            value={body}
            onChange={(e) => setBody(e.target.value)}
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
