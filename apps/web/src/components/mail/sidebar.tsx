import Link from "next/link";
import {
  Archive,
  BellOff,
  ClipboardCheck,
  Folder,
  Inbox,
  LayoutList,
  MailX,
  Newspaper,
  Pencil,
  ReplyAll,
  Send,
  Settings,
  Sparkles,
  Star,
  Timer,
  FileEdit,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import type { SidebarData } from "@/lib/queries";
import { VIEW_LABELS } from "@/lib/queries";
import type { MailView } from "@/lib/queries";
import { SidebarMore } from "./sidebar-more";

const VIEW_ICONS: Record<MailView, typeof Inbox> = {
  inbox: Inbox,
  starred: Star,
  snoozed: BellOff,
  drafts: FileEdit,
  sent: Send,
  archive: Archive,
  newsletters: Newspaper,
  "needs-reply": ReplyAll,
  awaiting: Timer,
  "reply-queue": Sparkles,
  review: ClipboardCheck,
  digest: LayoutList,
};

/** Gmail's primary list stays visible; the rest live behind More. */
const PRIMARY_VIEWS: MailView[] = ["inbox", "starred", "snoozed", "sent", "drafts"];
const MORE_VIEWS = (Object.keys(VIEW_LABELS) as MailView[]).filter(
  (v) => !PRIMARY_VIEWS.includes(v),
);

interface SidebarProps {
  data: SidebarData;
  activeView: MailView;
  activeLabel?: string;
  activeFolder?: string;
  query?: string;
}

function viewHref(view: string, q?: string): string {
  const params = new URLSearchParams({ view });
  if (q) params.set("q", q);
  return `/?${params}`;
}

const itemClass = (active: boolean) =>
  `flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${
    active
      ? "bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
      : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
  }`;

export function Sidebar({ data, activeView, activeLabel, activeFolder, query }: SidebarProps) {
  const viewItem = (view: MailView) => {
    const Icon = VIEW_ICONS[view];
    const active = view === activeView && !activeLabel && !activeFolder;
    return (
      <Link key={view} href={viewHref(view, query)} className={itemClass(active)}>
        <Icon size={14} className="shrink-0" />
        <span className="truncate">{VIEW_LABELS[view]}</span>
        {data.counts[view] > 0 && (
          <span className="ml-auto text-[11px] text-zinc-400">{data.counts[view]}</span>
        )}
      </Link>
    );
  };

  const moreOpen = MORE_VIEWS.includes(activeView) || !!activeFolder;

  return (
    <aside className="flex h-full w-full shrink-0 flex-col gap-1 overflow-y-auto border-r border-zinc-200 bg-zinc-50/50 px-3 py-4 dark:border-zinc-800 dark:bg-zinc-950">
      <Link
        href="/"
        className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
      >
        <BrandMark size={18} />
        Dzong Mail
      </Link>

      <Link
        href="/?compose=new"
        className="mb-3 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
      >
        <Pencil size={15} />
        Compose
      </Link>

      <nav className="flex flex-col gap-0.5">{PRIMARY_VIEWS.map(viewItem)}</nav>

      <nav className="flex flex-col gap-0.5">
        <SidebarMore defaultOpen={moreOpen}>
          {MORE_VIEWS.map(viewItem)}

          <Link
            href="/subscriptions"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <MailX size={14} className="shrink-0" />
            <span className="truncate">Subscriptions</span>
          </Link>

          {data.folders.length > 0 && (
            <>
              <p className="mt-2 px-2 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
                Folders
              </p>
              {data.folders.map((folder) => (
                <Link
                  key={folder}
                  href={`/?folder=${encodeURIComponent(folder)}`}
                  className={itemClass(folder === activeFolder)}
                >
                  <Folder size={14} className="shrink-0" />
                  <span className="truncate">{folder}</span>
                </Link>
              ))}
            </>
          )}
        </SidebarMore>
      </nav>

      {data.labels.length > 0 && (
        <>
          <p className="mt-4 px-2 text-[11px] font-semibold tracking-wide text-zinc-400 uppercase">
            Labels
          </p>
          <nav className="flex flex-col gap-0.5">
            {data.labels.map((label) => (
              <Link
                key={label}
                href={`/?label=${encodeURIComponent(label)}`}
                className={`rounded-md px-2 py-1.5 text-[13px] ${
                  label === activeLabel
                    ? "bg-indigo-100 font-medium text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                # {label}
              </Link>
            ))}
          </nav>
        </>
      )}

      <div className="mt-auto pt-4">
        <Link
          href="/settings"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          <Settings size={14} />
          Settings
        </Link>
        <p className="mt-2 px-2 text-[10px] leading-4 text-zinc-400">
          local-first · data never leaves this machine
        </p>
      </div>
    </aside>
  );
}
