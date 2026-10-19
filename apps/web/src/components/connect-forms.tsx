"use client";

import { useState } from "react";
import { connectImapAccount } from "@/lib/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm text-black placeholder-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

const submitClass =
  "rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300";

interface Preset {
  label: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: "SSL_TLS" | "STARTTLS" | "NONE";
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: "SSL_TLS" | "STARTTLS" | "NONE";
  hint: string;
}

const PRESETS: Record<string, Preset> = {
  icloud: {
    label: "iCloud",
    imapHost: "imap.mail.me.com",
    imapPort: "993",
    imapSecurity: "SSL_TLS",
    smtpHost: "smtp.mail.me.com",
    smtpPort: "587",
    smtpSecurity: "STARTTLS",
    hint: "Needs an app-specific password from appleid.apple.com → Sign-In & Security → App-Specific Passwords.",
  },
  fastmail: {
    label: "Fastmail",
    imapHost: "imap.fastmail.com",
    imapPort: "993",
    imapSecurity: "SSL_TLS",
    smtpHost: "smtp.fastmail.com",
    smtpPort: "465",
    smtpSecurity: "SSL_TLS",
    hint: "Use a Fastmail app password (Settings → Privacy & Security → Integrations → App passwords).",
  },
  yahoo: {
    label: "Yahoo",
    imapHost: "imap.mail.yahoo.com",
    imapPort: "993",
    imapSecurity: "SSL_TLS",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: "465",
    smtpSecurity: "SSL_TLS",
    hint: "Needs a Yahoo app password (Account Security → Generate app password).",
  },
  zoho: {
    label: "Zoho Mail",
    imapHost: "imap.zoho.com",
    imapPort: "993",
    imapSecurity: "SSL_TLS",
    smtpHost: "smtp.zoho.com",
    smtpPort: "465",
    smtpSecurity: "SSL_TLS",
    hint: "If two-factor is on, generate an app password in Zoho Accounts → Security.",
  },
  proton: {
    label: "Proton Mail",
    imapHost: "127.0.0.1",
    imapPort: "1143",
    imapSecurity: "STARTTLS",
    smtpHost: "127.0.0.1",
    smtpPort: "1025",
    smtpSecurity: "STARTTLS",
    hint: "Requires the Proton Mail Bridge app running locally — use the credentials Bridge shows you.",
  },
  custom: {
    label: "Other (manual)",
    imapHost: "",
    imapPort: "993",
    imapSecurity: "SSL_TLS",
    smtpHost: "",
    smtpPort: "465",
    smtpSecurity: "SSL_TLS",
    hint: "Any standard IMAP/SMTP mailbox. Your provider's docs list the server names.",
  },
};

/** The friendliest Gmail path: email + app password only. */
export function GmailConnectCard() {
  return (
    <form
      action={connectImapAccount}
      className="flex flex-col gap-3 rounded-lg border border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div>
        <p className="text-sm font-medium text-black dark:text-zinc-100">Gmail</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Recommended — takes about a minute.
        </p>
      </div>

      <input type="hidden" name="imapHost" value="imap.gmail.com" />
      <input type="hidden" name="imapPort" value="993" />
      <input type="hidden" name="imapSecurity" value="SSL_TLS" />
      <input type="hidden" name="smtpHost" value="smtp.gmail.com" />
      <input type="hidden" name="smtpPort" value="465" />
      <input type="hidden" name="smtpSecurity" value="SSL_TLS" />

      <input
        name="emailAddress"
        type="email"
        placeholder="you@gmail.com"
        required
        className={inputClass}
      />
      <input
        name="password"
        type="password"
        placeholder="App password (16 letters)"
        required
        className={inputClass}
      />

      <details className="text-xs text-zinc-500 dark:text-zinc-400">
        <summary className="cursor-pointer font-medium text-zinc-600 dark:text-zinc-300">
          Where do I get an app password?
        </summary>
        <ol className="mt-2 ml-4 list-decimal space-y-1">
          <li>
            Open{" "}
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-600 underline dark:text-indigo-400"
            >
              myaccount.google.com/apppasswords
            </a>
          </li>
          <li>Sign in and turn on 2-Step Verification if asked</li>
          <li>Create an app password named anything (e.g. “Unwalled”)</li>
          <li>Paste the 16-letter password above — it stays on this machine, encrypted</li>
        </ol>
      </details>

      <button type="submit" className={submitClass}>
        Connect Gmail
      </button>
    </form>
  );
}

/** Other providers, with one-tap presets for the common ones. */
export function OtherProviderCard() {
  const [presetKey, setPresetKey] = useState("fastmail");
  const preset = PRESETS[presetKey];

  return (
    <form
      action={connectImapAccount}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700"
    >
      <p className="text-sm font-medium text-black dark:text-zinc-100">Another email provider</p>

      <select
        value={presetKey}
        onChange={(e) => setPresetKey(e.target.value)}
        className={inputClass}
        aria-label="Provider"
      >
        {Object.entries(PRESETS).map(([key, p]) => (
          <option key={key} value={key}>
            {p.label}
          </option>
        ))}
      </select>

      <p className="text-xs text-zinc-500 dark:text-zinc-400">{preset.hint}</p>

      <input
        name="emailAddress"
        type="email"
        placeholder="Your email address"
        required
        className={inputClass}
      />
      <input
        name="password"
        type="password"
        placeholder="Password or app password"
        required
        className={inputClass}
      />

      {presetKey === "custom" && (
        <>
          <input
            name="imapHost"
            placeholder="IMAP server, e.g. imap.example.com"
            required
            className={inputClass}
          />
          <div className="flex gap-2">
            <input
              name="imapPort"
              placeholder="993"
              defaultValue={preset.imapPort}
              className={inputClass}
            />
            <select name="imapSecurity" defaultValue={preset.imapSecurity} className={inputClass}>
              <option value="SSL_TLS">SSL/TLS</option>
              <option value="STARTTLS">STARTTLS</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <input name="smtpHost" placeholder="SMTP server (for sending)" className={inputClass} />
          <div className="flex gap-2">
            <input name="smtpPort" placeholder="465" className={inputClass} />
            <select name="smtpSecurity" defaultValue={preset.smtpSecurity} className={inputClass}>
              <option value="SSL_TLS">SSL/TLS</option>
              <option value="STARTTLS">STARTTLS</option>
              <option value="NONE">None</option>
            </select>
          </div>
          <input
            name="username"
            placeholder="Username (only if different from email)"
            className={inputClass}
          />
        </>
      )}
      {presetKey !== "custom" && (
        <>
          <input type="hidden" name="imapHost" value={preset.imapHost} />
          <input type="hidden" name="imapPort" value={preset.imapPort} />
          <input type="hidden" name="imapSecurity" value={preset.imapSecurity} />
          <input type="hidden" name="smtpHost" value={preset.smtpHost} />
          <input type="hidden" name="smtpPort" value={preset.smtpPort} />
          <input type="hidden" name="smtpSecurity" value={preset.smtpSecurity} />
        </>
      )}

      <button type="submit" className={submitClass}>
        Connect {preset.label}
      </button>
    </form>
  );
}
