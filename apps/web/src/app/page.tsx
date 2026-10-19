export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 px-16 py-32">
        <h1 className="text-4xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Unwalled Mail
        </h1>
        <p className="max-w-md text-center text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Open-source, local-first AI email. Your messages, your models, your machine — no paywalls,
          ever.
        </p>
      </main>
    </div>
  );
}
