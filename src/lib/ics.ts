/**
 * Minimal RFC 5545 calendar file for "Add to calendar" (SPEC F6). Times are
 * written in UTC (`Z`) so every calendar app converts them to the viewer's
 * zone correctly; the interview's own zone is mentioned in the description.
 */

export type IcsEvent = {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description?: string;
  location?: string | null;
  url?: string | null;
  stamp?: Date;
};

function utc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape TEXT values (RFC 5545 §3.3.11). */
export function icsEscape(v: string) {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1), without splitting UTF-8 sequences. */
export function foldLine(line: string) {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function buildIcs(events: IcsEvent[], opts: { name?: string } = {}) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UpayaInd//Student portal//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  if (opts.name) lines.push(`X-WR-CALNAME:${icsEscape(opts.name)}`);
  for (const e of events) {
    const end = new Date(e.start.getTime() + e.durationMinutes * 60e3);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utc(e.stamp ?? new Date())}`,
      `DTSTART:${utc(e.start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url.replace(/[\r\n]/g, "")}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT30M", `DESCRIPTION:${icsEscape(e.summary)}`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * "Add to Google Calendar" link (calendar.google.com/calendar/render?action=TEMPLATE…).
 * Times in UTC (`Z`) so Google converts to the viewer's zone.
 */
export function googleCalendarUrl(e: Pick<IcsEvent, "start" | "durationMinutes" | "summary" | "description" | "location">) {
  const end = new Date(e.start.getTime() + e.durationMinutes * 60e3);
  const q = new URLSearchParams({ action: "TEMPLATE", text: e.summary, dates: `${utc(e.start)}/${utc(end)}` });
  if (e.description) q.set("details", e.description);
  if (e.location) q.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export type InterviewForCalendar = {
  scheduledAt: Date;
  timezone: string;
  round: string;
  mode: string;
  meetingLink?: string | null;
  interviewers?: string | null;
  application: { companyName: string; jobTitle: string };
};

/** Shared event text for an interview (used by the .ics route and the Google link). */
export function interviewCalendarEvent(i: InterviewForCalendar, opts: { detailsUrl?: string; formatWhen?: (d: Date, tz: string) => string } = {}): Pick<IcsEvent, "start" | "durationMinutes" | "summary" | "description" | "location"> {
  const when = opts.formatWhen ? opts.formatWhen(i.scheduledAt, i.timezone) : i.scheduledAt.toISOString();
  const description = [`Round: ${i.round}`, `Mode: ${i.mode}`, `Time: ${when} (${i.timezone})`, i.interviewers ? `Interviewers: ${i.interviewers}` : null, i.meetingLink ? `Join: ${i.meetingLink}` : null, opts.detailsUrl ? `Details: ${opts.detailsUrl}` : null].filter(Boolean).join("\n");
  return { start: i.scheduledAt, durationMinutes: 60, summary: `Interview: ${i.application.jobTitle} at ${i.application.companyName}`, description, location: i.mode === "Onsite" ? i.application.companyName : (i.meetingLink ?? null) };
}
