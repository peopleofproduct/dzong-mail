import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-3xl font-semibold text-zinc-300 dark:text-zinc-700">404</p>
      <p className="text-sm text-zinc-500">That page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Back to inbox
      </Link>
    </div>
  );
}
