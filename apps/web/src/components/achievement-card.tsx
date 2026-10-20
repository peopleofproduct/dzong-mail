"use client";

import { useState } from "react";
import { Download, Share2, Trophy } from "lucide-react";
import type { AchievementStats } from "@/lib/achievements";

const CARD_W = 1200;
const CARD_H = 630;

/** Paint the share asset on canvas - same layout as the DOM card. */
function paintCard(ctx: CanvasRenderingContext2D, stats: AchievementStats, name: string) {
  // Backdrop: deep zinc-to-indigo gradient with a soft radial glow.
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, "#09090b");
  bg.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const glow = ctx.createRadialGradient(950, 120, 40, 950, 120, 560);
  glow.addColorStop(0, "rgba(99,102,241,0.45)");
  glow.addColorStop(1, "rgba(99,102,241,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Faint grid.
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= CARD_W; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CARD_H);
    ctx.stroke();
  }
  for (let y = 0; y <= CARD_H; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CARD_W, y);
    ctx.stroke();
  }

  // Header.
  ctx.fillStyle = "#a5b4fc";
  ctx.font = "600 26px Arial, sans-serif";
  ctx.fillText("DZONG MAIL", 80, 110);
  ctx.fillStyle = "#fafafa";
  ctx.font = "700 56px Arial, sans-serif";
  ctx.fillText("Inbox Zero, kept.", 80, 185);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "400 26px Arial, sans-serif";
  ctx.fillText(`${name}'s email achievements`, 80, 232);

  // Three stat columns.
  const cells: [string, string][] = [
    [String(stats.longestWeeks), `week${stats.longestWeeks === 1 ? "" : "s"} longest streak`],
    [String(stats.currentDays), `day${stats.currentDays === 1 ? "" : "s"} inbox clear`],
    [String(stats.totalDone), "conversations done"],
  ];
  cells.forEach(([num, label], i) => {
    const x = 80 + i * 360;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(x, 320, 320, 190, 20);
    ctx.fill();
    ctx.fillStyle = "#818cf8";
    ctx.font = "700 80px Arial, sans-serif";
    ctx.fillText(num, x + 32, 420);
    ctx.fillStyle = "#d4d4d8";
    ctx.font = "400 24px Arial, sans-serif";
    ctx.fillText(label, x + 32, 470);
  });

  // Footer.
  ctx.fillStyle = "#71717a";
  ctx.font = "400 22px Arial, sans-serif";
  ctx.fillText("Local-first mail - my data never left my machine.", 80, 575);
  ctx.fillStyle = "#a5b4fc";
  ctx.font = "700 22px Arial, sans-serif";
  ctx.fillText("dzong-mail", 1000, 575);
}

/** The visible card plus a Share button that renders the same design to a
 *  PNG - Web Share API where the platform supports files, download
 *  otherwise. */
export function AchievementCard({ stats, name }: { stats: AchievementStats; name: string }) {
  const [sharing, setSharing] = useState(false);

  const renderPng = async (): Promise<Blob | null> => {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_W;
    canvas.height = CARD_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    paintCard(ctx, stats, name);
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  };

  const share = async () => {
    setSharing(true);
    try {
      const blob = await renderPng();
      if (!blob) return;
      const file = new File([blob], "dzong-achievements.png", { type: "image/png" });
      const text = `Inbox zero streak: ${stats.currentDays} days running, best ${stats.longestWeeks} weeks, ${stats.totalDone} conversations done - on Dzong Mail`;
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "My inbox achievements", text });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "dzong-achievements.png";
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // User dismissed the share sheet - nothing to do.
    } finally {
      setSharing(false);
    }
  };

  const cells: [string, string][] = [
    [String(stats.longestWeeks), `week${stats.longestWeeks === 1 ? "" : "s"} longest streak`],
    [String(stats.currentDays), `day${stats.currentDays === 1 ? "" : "s"} inbox clear`],
    [String(stats.totalDone), "conversations done"],
  ];

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          Achievements
        </h2>
        <button
          type="button"
          onClick={share}
          disabled={sharing}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          {sharing ? <Download size={13} /> : <Share2 size={13} />}
          {sharing ? "Rendering…" : "Share card"}
        </button>
      </div>

      {/* Mirrors the PNG design so what you see is what gets shared. */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-950 to-indigo-950 p-8 text-white ring-1 ring-indigo-500/30">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-indigo-500/25 blur-3xl"
        />
        <div className="relative">
          <p className="text-xs font-semibold tracking-widest text-indigo-300">DZONG MAIL</p>
          <p className="mt-2 flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Trophy size={26} className="text-indigo-300" />
            Inbox Zero, kept.
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {name}&apos;s email achievements{stats.inboxClear ? " - inbox is clear right now" : ""}
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4">
            {cells.map(([num, label]) => (
              <div
                key={label}
                className="rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10 sm:p-5"
              >
                <p className="text-4xl font-bold text-indigo-300 sm:text-5xl">{num}</p>
                <p className="mt-1 text-xs text-zinc-300 sm:text-sm">{label}</p>
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-zinc-500">
            Local-first mail - data never leaves the machine.
          </p>
          <p className="mt-1 text-[10px] text-zinc-600">
            Streaks count forward from when you started using Dzong - there is no historical
            record of past clear-inbox days to backfill, so early numbers are honest ones.
          </p>
        </div>
      </div>
    </section>
  );
}
