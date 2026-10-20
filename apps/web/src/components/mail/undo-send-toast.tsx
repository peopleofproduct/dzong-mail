"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Send } from "lucide-react";
import { cancelScheduledSend, dispatchQueuedSend } from "@/lib/actions";
import { buildParams } from "./params";

/**
 * The undo-send toast - floats bottom-center while a queued send counts
 * down. Undo returns the message to Drafts; Send now skips the wait.
 */
export function UndoSendToast({ messageId, subject }: { messageId: string; subject: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [left, setLeft] = useState<number | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      setLeft((l) => (l === null ? l : Math.max(0, l - 1)));
    };
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Seed the countdown from the server's scheduledAt on mount.
  useEffect(() => {
    fetch(`/api/v1/messages/${messageId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const at = d?.message?.scheduledAt;
        if (at) {
          setLeft(Math.max(1, Math.round((new Date(at).getTime() - Date.now()) / 1000)));
        }
      })
      .catch(() => {});
  }, [messageId]);

  const clearParam = () =>
    router.replace(buildParams(searchParams, { undo: undefined }), { scroll: false });

  const undo = async () => {
    await cancelScheduledSend(messageId);
    setDone("Send cancelled - moved back to Drafts");
    setTimeout(clearParam, 1600);
  };
  const sendNow = async () => {
    const r = await dispatchQueuedSend(messageId);
    setDone(r.ok ? "Sent" : `Send failed - ${r.reason ?? "check Drafts"}`);
    setTimeout(clearParam, 1600);
  };

  if (done) {
    return (
      <div className="anim-toast fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 shadow-2xl dark:bg-zinc-100 dark:text-zinc-900">
        {done}
      </div>
    );
  }
  return (
    <div className="anim-toast fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-zinc-900 py-2.5 pr-2.5 pl-4 text-sm text-zinc-100 shadow-2xl dark:bg-zinc-100 dark:text-zinc-900">
      <span className="max-w-56 truncate">
        Sending{left !== null ? ` in ${left}s` : "…"} · {subject}
      </span>
      <button
        onClick={sendNow}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-indigo-300 hover:bg-white/10 dark:text-indigo-600 dark:hover:bg-black/10"
      >
        <Send size={12} /> Send now
      </button>
      <button
        onClick={undo}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-amber-300 hover:bg-white/10 dark:text-amber-600 dark:hover:bg-black/10"
      >
        <RotateCcw size={12} /> Undo
      </button>
    </div>
  );
}
