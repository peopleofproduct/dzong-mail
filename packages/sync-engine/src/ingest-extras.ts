import { prisma } from "@dzong/database";
import type { PrismaClient } from "@dzong/database";
import type { RawMessage } from "./types";
import { emit } from "./notify";

// ─── .ics parsing ────────────────────────────────────────────────────────────

export interface ParsedEvent {
  uid: string;
  summary?: string;
  description?: string;
  location?: string;
  organizer?: string;
  startsAt: Date;
  endsAt?: Date;
  status: string;
  attendees: string[];
  recurrence?: string;
}

/** iCal dates: 20261020T090000Z, 20261020T090000, or all-day 20261020. */
function parseIcsDate(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return new Date(Date.UTC(+y, +mo - 1, +d));
  return z === "Z"
    ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    : new Date(+y, +mo - 1, +d, +h, +mi, +s);
}

/** Minimal VEVENT parser - unfolds continuation lines, reads the common
 *  properties, ignores VALARM/VTIMEZONE blocks entirely. */
export function parseIcs(content: string): ParsedEvent[] {
  // Unfold: a line starting with space/tab continues the previous line.
  const raw = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> | null = null;
  const prop = (line: string) => {
    const colon = line.indexOf(":");
    if (colon === -1) return null;
    const [namePart, value] = [line.slice(0, colon), line.slice(colon + 1)];
    return { name: namePart.split(";")[0].toUpperCase(), value };
  };

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      if (cur?.uid && cur.startsAt) {
        events.push({ status: "CONFIRMED", attendees: [], ...cur } as ParsedEvent);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = prop(line);
    if (!p) continue;
    switch (p.name) {
      case "UID":
        cur.uid = p.value.trim();
        break;
      case "SUMMARY":
        cur.summary = p.value.trim();
        break;
      case "DESCRIPTION":
        cur.description = p.value.replace(/\\n/gi, "\n").trim().slice(0, 500);
        break;
      case "LOCATION":
        cur.location = p.value.trim();
        break;
      case "ORGANIZER":
        cur.organizer = p.value.replace(/^mailto:/i, "").trim();
        break;
      case "ATTENDEE":
        cur.attendees = [
          ...(cur.attendees ?? []),
          // Lowercased so case-sensitive hasSome lookups match reliably.
          p.value
            .replace(/^mailto:/i, "")
            .trim()
            .toLowerCase(),
        ];
        break;
      case "RRULE":
        cur.recurrence = p.value.trim();
        break;
      case "DTSTART": {
        const d = parseIcsDate(p.value);
        if (d) cur.startsAt = d;
        break;
      }
      case "DTEND": {
        const d = parseIcsDate(p.value);
        if (d) cur.endsAt = d;
        break;
      }
      case "STATUS":
        cur.status = p.value.trim().toUpperCase();
        break;
    }
  }
  return events;
}

const isCalendarAttachment = (filename: string, mimeType?: string) =>
  mimeType === "text/calendar" ||
  mimeType === "application/ics" ||
  filename.toLowerCase().endsWith(".ics");

/**
 * Scan freshly inserted messages for calendar attachments and upsert
 * CalendarEvent rows keyed by (account, uid) so invite updates replace
 * rather than duplicate.
 */
export async function ingestCalendarEvents(
  accountId: string,
  fresh: RawMessage[],
  idByProviderId: Map<string, string>,
  db: PrismaClient = prisma,
): Promise<number> {
  let count = 0;
  for (const msg of fresh) {
    const messageId = idByProviderId.get(msg.providerMessageId);
    if (!messageId || !msg.attachments) continue;
    for (const att of msg.attachments) {
      if (!att.content || !isCalendarAttachment(att.filename, att.mimeType)) continue;
      for (const ev of parseIcs(att.content.toString("utf8"))) {
        await db.calendarEvent.upsert({
          where: { emailAccountId_uid: { emailAccountId: accountId, uid: ev.uid } },
          create: {
            emailAccountId: accountId,
            messageId,
            uid: ev.uid,
            summary: ev.summary,
            description: ev.description,
            location: ev.location,
            organizer: ev.organizer,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            status: ev.status,
            attendees: ev.attendees,
            recurrence: ev.recurrence,
          },
          update: {
            messageId,
            summary: ev.summary,
            description: ev.description,
            location: ev.location,
            organizer: ev.organizer,
            startsAt: ev.startsAt,
            endsAt: ev.endsAt,
            status: ev.status,
            attendees: ev.attendees,
            recurrence: ev.recurrence,
          },
        });
        count++;
      }
    }
  }
  return count;
}

// ─── Read receipts (MDN / disposition notifications) ────────────────────────

const headerVal = (msg: RawMessage, name: string) => {
  if (!msg.headers) return undefined;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(msg.headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
};

/** An MDN receipt: multipart/report with report-type=disposition-notification,
 *  or a bare message/disposition-notification part. Also matches the common
 *  "Return Receipt" / "Read:" subjects Exchange and old clients send. */
export function isReadReceipt(msg: RawMessage): boolean {
  const ct = headerVal(msg, "content-type") ?? "";
  if (/disposition-notification/i.test(ct)) return true;
  const subject = msg.subject ?? "";
  if (/^(read|return receipt|not read|deleted without being read)[: ]/i.test(subject)) {
    // Only treat as a receipt when it also carries machine-report markers or
    // our own sent address is not the author - "Re: Read: X" is just a reply.
    const auto = headerVal(msg, "auto-submitted") ?? "";
    return /auto-/i.test(auto) || /report/i.test(ct);
  }
  return false;
}

/**
 * For each detected receipt: mark it read (machine mail shouldn't inflate
 * the unread count), link it back to the sent message that requested it
 * (receipts thread onto the conversation they answer, so the newest
 * receipt-requested message in the thread is the match), and emit a
 * notification naming the original subject.
 */
export async function flagReadReceipts(
  fresh: RawMessage[],
  db: PrismaClient = prisma,
): Promise<number> {
  let count = 0;
  for (const msg of fresh) {
    if (!isReadReceipt(msg)) continue;
    msg.isRead = true;
    const original =
      headerVal(msg, "original-subject") ??
      msg.subject?.replace(/^(read|return receipt|not read)[: ]/i, "").trim();

    // A receipt's arrival IS the "opened" signal - stamp readAt on the
    // sent message it answers (readAt on sent mail means recipient-read).
    if (msg.threadId) {
      const sent = await db.message.findFirst({
        where: {
          threadId: msg.threadId,
          receiptRequested: true,
          isDraft: false,
          readAt: null,
        },
        orderBy: { receivedAt: "desc" },
      });
      if (sent) {
        await db.message.update({
          where: { id: sent.id },
          data: { readAt: msg.receivedAt ?? new Date() },
        });
      }
    }

    await emit(
      {
        kind: "read-receipt",
        title: "Read receipt",
        body: original ? `"${original}" was opened by the recipient` : msg.fromAddress,
        threadId: msg.threadId,
      },
      db,
    );
    count++;
  }
  return count;
}
