"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the offline-shell service worker and surfaces the browser's
 * install prompt as a small dismissible banner. The prompt only fires on
 * Chromium/Android/desktop when installability criteria are met; on other
 * browsers this mounts quietly and just keeps the SW registered.
 */
export function PwaRegistrar() {
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (localStorage.getItem("unwalled-install-dismissed") !== "1") {
        setInstallEvt(e as BeforeInstallPromptEvent);
      }
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!installEvt || dismissed) return null;

  return (
    <div className="anim-rise fixed bottom-4 left-4 z-40 flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-3.5 py-2.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <Download size={15} className="text-indigo-500" />
      <span className="text-xs text-zinc-600 dark:text-zinc-300">
        Install Unwalled Mail as an app
      </span>
      <button
        type="button"
        className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500"
        onClick={async () => {
          await installEvt.prompt();
          const { outcome } = await installEvt.userChoice;
          if (outcome === "accepted") setDismissed(true);
          setInstallEvt(null);
        }}
      >
        Install
      </button>
      <button
        type="button"
        title="Not now"
        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        onClick={() => {
          localStorage.setItem("unwalled-install-dismissed", "1");
          setDismissed(true);
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
