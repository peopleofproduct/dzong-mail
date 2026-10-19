"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Maximize2,
  Minimize2,
  Minus,
  Paperclip,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  discardComposerDraft,
  generateComposeVariantsNow,
  removeDraftAttachment,
  saveComposerDraft,
  sendEmailAction,
} from "@/lib/actions";
import { buildParams } from "./params";
import { VariantPicker } from "./variant-picker";
import type { DraftVariant } from "./variant-picker";
import { RichBody } from "./rich-body";
import type { RichBodyHandle } from "./rich-body";

interface AccountOption {
  id: string;
  emailAddress: string;
  provider: string;
}

interface StoredAttachment {
  id: string;
  filename: string;
  sizeBytes: number | null;
}

interface SnippetOption {
  id: string;
  name: string;
  body: string;
}

interface ComposerProps {
  accounts: AccountOption[];
  /** Files already stored on the draft being edited (compose=draft). */
  draftAttachments?: StoredAttachment[];
  /** Formatted body stored on the draft - restores rich text on reopen. */
  draftBodyHtml?: string;
  snippets?: SnippetOption[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

const field =
  "w-full bg-transparent px-4 py-2.5 text-sm text-black placeholder-zinc-400 focus:outline-none dark:text-zinc-100";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Composer({ accounts, draftAttachments, draftBodyHtml, snippets }: ComposerProps) {
  const searchParams = useSearchParams();
  if (!searchParams.get("compose")) return null;
  // Key by the compose-relevant params so each compose session mounts fresh
  // state (prefilled body, draft id) without losing a half-typed email when
  // unrelated params change.
  const sessionKey = ["compose", "draftId", "to", "subject", "body", "threadId", "accountId"]
    .map((k) => `${k}=${searchParams.get(k) ?? ""}`)
    .join("&");
  return (
    <ComposerInner
      accounts={accounts}
      draftAttachments={draftAttachments}
      draftBodyHtml={draftBodyHtml}
      snippets={snippets}
      key={sessionKey}
    />
  );
}

function ComposerInner({ accounts, draftAttachments, draftBodyHtml, snippets }: ComposerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("compose")!;
  const initial = {
    to: searchParams.get("to") ?? "",
    cc: searchParams.get("cc") ?? "",
    bcc: searchParams.get("bcc") ?? "",
    subject: searchParams.get("subject") ?? "",
    body: searchParams.get("body") ?? "",
  };
  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState(initial.bcc);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [bodyHtml, setBodyHtml] = useState(() => draftBodyHtml ?? escapeHtml(initial.body));
  const [files, setFiles] = useState<File[]>([]);
  const [stored, setStored] = useState<StoredAttachment[]>(draftAttachments ?? []);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(initial.cc || initial.bcc));
  const [expanded, setExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showAiHint, setShowAiHint] = useState(false);
  const [saving, setSaving] = useState<"saving" | "saved" | null>(null);
  const [draftId] = useState(searchParams.get("draftId") ?? "");
  const [aiError, setAiError] = useState<string | null>(null);
  const [variants, setVariants] = useState<DraftVariant[] | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLInputElement>(null);
  const accountRef = useRef<HTMLSelectElement>(null);
  const bodyRef = useRef<RichBodyHandle>(null);

  const isReply = mode === "reply";
  const isDraft = mode === "draft";
  const title = isReply ? "Reply" : isDraft ? "Draft" : "New message";

  // Keep the real file input in sync with state so the native form action
  // ships exactly the files the chips show (input.files is read-only, so a
  // DataTransfer rebuild is the trick).
  useEffect(() => {
    if (!fileRef.current) return;
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    fileRef.current.files = dt.files;
  }, [files]);

  const navigateClose = () => router.push(buildParams(searchParams, { compose: undefined }));

  const dirty =
    to !== initial.to ||
    cc !== initial.cc ||
    bcc !== initial.bcc ||
    subject !== initial.subject ||
    body !== initial.body ||
    files.length > 0;

  const draftFormData = () => {
    const fd = new FormData();
    fd.set("accountId", accountRef.current?.value ?? accounts[0]?.id ?? "");
    fd.set("draftId", draftId);
    fd.set("to", to);
    fd.set("cc", cc);
    fd.set("bcc", bcc);
    fd.set("subject", subject);
    fd.set("body", body);
    fd.set("bodyHtml", bodyHtml);
    fd.set("threadId", searchParams.get("threadId") ?? "");
    for (const f of files) fd.append("attachments", f);
    return fd;
  };

  /** X = close; anything written lands in Drafts, like Gmail autosave. */
  const close = async () => {
    if (dirty) {
      setSaving("saving");
      const result = await saveComposerDraft(draftFormData());
      if (!result.ok) {
        // Keep the window open - losing a typed draft is worse than nagging.
        setSaving(null);
        setAiError(result.reason ?? "Could not save draft");
        return;
      }
      if (result.saved) setSaving("saved");
    }
    navigateClose();
  };

  const discard = async () => {
    await discardComposerDraft(draftId || null);
    navigateClose();
  };

  if (accounts.length === 0) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={navigateClose}
      >
        <div
          className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-2xl dark:bg-zinc-950 dark:ring-1 dark:ring-zinc-800"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            No mail account connected
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Connect an account in Settings before composing.
          </p>
          <a
            href="/settings"
            className="mt-4 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  const writeWithAI = () => {
    setAiError(null);
    startTransition(async () => {
      const result = await generateComposeVariantsNow({
        to,
        subject,
        instructions: hintRef.current?.value,
        accountId: accountRef.current?.value,
      });
      if (result.ok && result.variants && result.variants.length > 0) {
        setVariants(result.variants);
      } else {
        setAiError(result.reason ?? "AI failed");
      }
    });
  };

  const iconBtn =
    "rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200";

  const shell = expanded
    ? "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    : "fixed inset-x-0 bottom-0 z-50 sm:inset-x-auto sm:right-5 sm:w-[30rem]";

  return (
    <div className={shell} onClick={expanded ? close : undefined}>
      <div
        className={`flex w-full flex-col overflow-hidden bg-white shadow-2xl ring-1 ring-zinc-200 sm:rounded-t-xl dark:bg-zinc-950 dark:ring-zinc-800 ${
          expanded ? "h-full max-h-[calc(100vh-4rem)] max-w-3xl sm:rounded-xl" : "max-h-[70vh] sm:h-[32rem]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar - Gmail's dark strip with window controls. */}
        <div className="flex items-center gap-1 bg-zinc-100 px-4 py-2 dark:bg-zinc-900">
          <h3 className="flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {title}
            {saving === "saving" && <span className="ml-2 text-xs text-zinc-400">Saving…</span>}
            {saving === "saved" && <span className="ml-2 text-xs text-zinc-400">Draft saved</span>}
          </h3>
          <button
            type="button"
            onClick={() => setMinimized((v) => !v)}
            title={minimized ? "Restore" : "Minimize"}
            aria-label={minimized ? "Restore" : "Minimize"}
            className={iconBtn}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Exit full screen" : "Full screen"}
            aria-label={expanded ? "Exit full screen" : "Full screen"}
            className={iconBtn}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            type="button"
            onClick={close}
            title="Save & close"
            aria-label="Save and close"
            className={iconBtn}
          >
            <X size={16} />
          </button>
        </div>

        {!minimized && (
          <form
            action={sendEmailAction}
            className="flex min-h-0 flex-1 flex-col"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.requestSubmit();
              }
            }}
          >
            <select
              name="accountId"
              ref={accountRef}
              defaultValue={searchParams.get("accountId") ?? accounts[0]?.id}
              className="w-full bg-transparent px-4 py-1.5 text-xs text-zinc-500 focus:outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  From: {a.emailAddress}
                </option>
              ))}
            </select>

            <div className="flex items-center border-b border-zinc-200 dark:border-zinc-800">
              <input
                name="to"
                type="text"
                placeholder="To"
                required
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={field}
                autoFocus={!isReply && !isDraft}
              />
              {!showCcBcc && (
                <span className="flex shrink-0 gap-2 pr-4 text-xs text-zinc-400">
                  <button type="button" onClick={() => setShowCcBcc(true)} className="hover:text-zinc-600">Cc</button>
                  <button type="button" onClick={() => setShowCcBcc(true)} className="hover:text-zinc-600">Bcc</button>
                </span>
              )}
            </div>
            {showCcBcc && (
              <>
                <input
                  name="cc"
                  type="text"
                  placeholder="Cc"
                  value={cc}
                  onChange={(e) => setCc(e.target.value)}
                  className={`${field} border-b border-zinc-200 dark:border-zinc-800`}
                />
                <input
                  name="bcc"
                  type="text"
                  placeholder="Bcc"
                  value={bcc}
                  onChange={(e) => setBcc(e.target.value)}
                  className={`${field} border-b border-zinc-200 dark:border-zinc-800`}
                />
              </>
            )}
            <input
              name="subject"
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={`${field} border-b border-zinc-200 dark:border-zinc-800`}
            />
            <input type="hidden" name="threadId" value={searchParams.get("threadId") ?? ""} />
            <input type="hidden" name="inReplyTo" value={searchParams.get("inReplyTo") ?? ""} />
            <input type="hidden" name="draftId" value={draftId} />
            {/* Real file input kept in sync with the chips state via DataTransfer. */}
            <input ref={fileRef} type="file" name="attachments" multiple className="hidden" />

            {showAiHint && (
              <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
                <input
                  type="text"
                  placeholder="Optional: tell the AI what to write (e.g. 'politely decline')"
                  className="flex-1 bg-transparent text-xs text-black placeholder-zinc-400 focus:outline-none dark:text-zinc-100"
                  ref={hintRef}
                />
              </div>
            )}
            {aiError && <p className="px-4 pt-2 text-xs text-red-500">{aiError}</p>}

            <input type="hidden" name="body" value={body} />
            <input type="hidden" name="bodyHtml" value={bodyHtml} />
            <RichBody
              ref={bodyRef}
              initialHtml={draftBodyHtml ?? escapeHtml(initial.body)}
              autoFocus={isReply}
              onTextChange={(text, html) => {
                setBody(text);
                setBodyHtml(html);
              }}
            />

            {(files.length > 0 || stored.length > 0) && (
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800/60">
                {stored.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {a.filename}
                    <span className="text-zinc-400">{formatBytes(a.sizeBytes)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${a.filename}`}
                      onClick={async () => {
                        await removeDraftAttachment(a.id);
                        setStored((s) => s.filter((x) => x.id !== a.id));
                      }}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
                {files.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {f.name}
                    <span className="text-zinc-400">{formatBytes(f.size)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((s) => s.filter((_, j) => j !== i))}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Footer toolbar: Send + scheduling on the left, action icons
                through the middle, discard on the right. */}
            <div className="flex items-center gap-1 border-t border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <button
                type="submit"
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
              >
                Send
              </button>
              <select
                name="sendLater"
                defaultValue=""
                title="Schedule send"
                className="rounded-md bg-transparent px-1 py-1.5 text-xs text-zinc-500 focus:outline-none"
              >
                <option value="">Now</option>
                <option value="1">In 1h</option>
                <option value="4">In 4h</option>
                <option value="24">Tomorrow</option>
              </select>
              <span className="mx-1 h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                title="Attach files"
                aria-label="Attach files"
                className={iconBtn}
              >
                <Paperclip size={15} />
              </button>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  if (picked.length) setFiles((s) => [...s, ...picked]);
                  e.target.value = "";
                }}
                ref={(el) => {
                  // Separate picker input; fileRef above is the submit carrier.
                  if (el) el.dataset.role = "picker";
                }}
              />
              {snippets && snippets.length > 0 && (
                <select
                  defaultValue=""
                  title="Insert a snippet"
                  aria-label="Insert a snippet"
                  className="rounded-md bg-transparent px-1 py-1.5 text-xs text-zinc-500 focus:outline-none"
                  onChange={(e) => {
                    const s = snippets.find((x) => x.id === e.target.value);
                    if (s) bodyRef.current?.insert(escapeHtml(s.body));
                    e.target.value = "";
                  }}
                >
                  <option value="" disabled>
                    Snippet…
                  </option>
                  {snippets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => (showAiHint ? writeWithAI() : setShowAiHint(true))}
                disabled={pending}
                title={showAiHint ? "Write with AI" : "AI writing options"}
                aria-label="Write with AI"
                className={`${iconBtn} text-indigo-500 hover:text-indigo-700 dark:text-indigo-400`}
              >
                <Sparkles size={15} />
              </button>
              {pending && <span className="text-[11px] text-zinc-400">Drafting 3 versions…</span>}
              <button
                type="button"
                onClick={discard}
                title="Discard draft"
                aria-label="Discard draft"
                className={`${iconBtn} ml-auto`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          </form>
        )}
      </div>
      {variants && (
        <VariantPicker
          variants={variants}
          busy={pending}
          pickLabel="Insert into reply"
          onPick={(b) => {
            bodyRef.current?.set(escapeHtml(b));
            setVariants(null);
          }}
          onRegenerate={writeWithAI}
          onClose={() => setVariants(null)}
        />
      )}
    </div>
  );
}
