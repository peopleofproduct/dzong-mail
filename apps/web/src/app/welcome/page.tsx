import { connection } from "next/server";
import { Lock, Mail, Search, Sparkles, Workflow } from "lucide-react";
import { connectMockAccount } from "@/lib/actions";
import { getAccounts } from "@/lib/queries";
import { ThemeToggle } from "@/components/mail/theme-toggle";

const features = [
  {
    icon: Lock,
    title: "Local-first",
    body: "Messages, AI features, and settings live in Postgres on this machine. Nothing is sent to a vendor cloud or used for training.",
  },
  {
    icon: Sparkles,
    title: "Bring your own AI",
    body: "Ollama runs free and fully offline, or plug in your own OpenAI / Anthropic key. Classify, summarise, and draft replies automatically.",
  },
  {
    icon: Search,
    title: "Search that understands",
    body: "Semantic search finds mail by meaning — “weekend plans” finds the hiking thread — plus an Ask-my-inbox Q&A that cites its sources.",
  },
  {
    icon: Workflow,
    title: "Automation built in",
    body: "Natural-language rules, cold-email blocking, digest rollups, snooze, send-later, and keyboard-first triage out of the box.",
  },
];

export default async function WelcomePage() {
  await connection();
  // The demo is onboarding education — hide it once a real provider exists.
  const showDemo = !(await getAccounts()).some((a) => a.provider !== "MOCK");
  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-white dark:bg-zinc-950">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="flex items-center gap-2">
          <Mail size={18} className="text-indigo-600 dark:text-indigo-400" />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Unwalled Mail
          </span>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-10 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
          Open source · Local-first · MIT
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
          Your messages, your models, your machine.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-zinc-500 sm:text-base dark:text-zinc-400">
          Unwalled Mail is an AI email client that runs entirely on your computer. Connect Gmail,
          Outlook, or any IMAP provider — sync, search, and send locally, with AI that never sees a
          cloud unless you give it your own key. No paywalls, ever.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="/settings"
            className="rounded-lg bg-indigo-600 px-5 py-3 text-center text-sm font-medium text-white hover:bg-indigo-500"
          >
            Connect Gmail
          </a>
          <a
            href="/settings"
            className="rounded-lg border border-zinc-300 px-5 py-3 text-center text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Connect another provider
          </a>
          {showDemo && (
            <form action={connectMockAccount}>
              <button
                type="submit"
                className="w-full rounded-lg px-5 py-3 text-sm font-medium text-zinc-500 hover:bg-zinc-50 sm:w-auto dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Explore the demo inbox →
              </button>
            </form>
          )}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800"
            >
              <f.icon size={18} className="text-indigo-600 dark:text-indigo-400" />
              <h2 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {f.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
        Free and open source (MIT) ·{" "}
        <a
          href="https://github.com/peopleofproduct/unwalled-mail"
          className="underline hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          github.com/peopleofproduct/unwalled-mail
        </a>
      </footer>
    </div>
  );
}
