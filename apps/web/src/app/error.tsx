"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Something went wrong</p>
      <p className="max-w-md text-xs text-zinc-400">
        {error.message || "An unexpected error occurred."} Your mail is safe — this is a display
        problem, not a data problem.
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Try again
      </button>
    </div>
  );
}
