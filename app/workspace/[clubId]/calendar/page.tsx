import Link from "next/link";
import { notFound } from "next/navigation";
import { Temporal } from "@js-temporal/polyfill";
import { requireClub } from "@/lib/auth/session";
import { uuid, dateOnly } from "@/modules/program-rules/contracts";
import { Field, FormPanel, SaveButton } from "@/components/workspace/forms";
import { EventForm } from "@/components/workspace/event-form";
import { CalendarView } from "@/components/workspace/calendar-view";
import { loadCalendarItems } from "@/modules/calendar/read";
export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{
    view?: string;
    date?: string;
    category?: string;
    notice?: string;
  }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, club, roles } = await requireClub(clubId);
  const q = await searchParams;
  const manager = roles.some((r) => ["director", "coordinator"].includes(r));
  const view = q.view === "week" || q.view === "agenda" ? q.view : "month";
  const date = dateOnly.safeParse(q.date).success ? q.date : undefined;
  const anchor = date
    ? Temporal.PlainDate.from(date)
    : Temporal.Now.plainDateISO(club.timezone);
  const from = anchor
      .subtract({ days: 45 })
      .toPlainDateTime()
      .toZonedDateTime("UTC")
      .toInstant()
      .toString(),
    to = anchor
      .add({ days: 46 })
      .toPlainDateTime()
      .toZonedDateTime("UTC")
      .toInstant()
      .toString();
  const [items, drafts] = await Promise.all([
    loadCalendarItems(db, clubId, from, to),
    manager
      ? db
          .from("calendar_drafts")
          .select("id,payload,source_kind")
          .eq("club_id", clubId)
          .eq("status", "draft")
          .order("created_at", { ascending: false })
          .limit(100)
      : null,
  ]);
  if (drafts?.error) throw new Error("Unable to load calendar drafts.");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-7xl space-y-8 px-5 py-10"
    >
      <nav aria-label="Calendar navigation" className="flex flex-wrap gap-5">
        <Link href={`/workspace/${clubId}`}>← Club workspace</Link>
        <Link href={`/workspace/${clubId}/dashboard`}>Progress dashboard</Link>
        <a
          href={`/workspace/${clubId}/calendar/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
        >
          Download calendar (.ics)
        </a>
        {manager && (
          <Link href={`/workspace/${clubId}/calendar/import`}>
            Import calendar
          </Link>
        )}
      </nav>
      <header>
        <p className="eyebrow">{club.name}</p>
        <h1 className="mt-3 text-3xl font-bold">Club calendar</h1>
        <p className="mt-3 text-muted-foreground">
          Meetings, supervised activities and staff planning. Drafts require
          human review before club publication.
        </p>
      </header>
      {q.notice && (
        <p role="status" className="notice">
          {q.notice === "saved"
            ? "Calendar saved."
            : "Unable to save. Check required details, timezone, positive dates, recurrence limits and permissions. DST gaps and ambiguous times require correction."}
        </p>
      )}
      <form method="get" className="panel flex flex-wrap items-end gap-4">
        <Field label="View">
          <select name="view" defaultValue={view}>
            <option value="month">Month</option>
            <option value="week">Week</option>
            <option value="agenda">Agenda</option>
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            name="date"
            defaultValue={date ?? anchor.toString()}
          />
        </Field>
        <Field label="Category">
          <select name="category" defaultValue={q.category ?? ""}>
            <option value="">All categories</option>
            {[...new Set(items.map((i) => i.category))].sort().map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <SaveButton>Show calendar</SaveButton>
      </form>
      <CalendarView
        clubId={clubId}
        items={items}
        view={view}
        date={date}
        category={q.category ?? ""}
        fallbackTimezone={club.timezone}
      />
      {manager && (
        <>
          <FormPanel title="Create an event">
            <EventForm clubId={clubId} timezone={club.timezone} />
          </FormPanel>
          <section className="panel">
            <h2 className="text-xl font-bold">Drafts awaiting review</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Latest 100 private staff drafts.
            </p>
            <ul className="mt-4 space-y-3">
              {drafts?.data?.map((d) => (
                <li key={d.id}>
                  <Link
                    className="text-primary underline"
                    href={`/workspace/${clubId}/calendar/drafts/${d.id}`}
                  >
                    {String(d.payload.title)} · {d.source_kind}
                  </Link>
                </li>
              ))}
            </ul>
            {!drafts?.data?.length && (
              <p className="mt-4">No unpublished drafts.</p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
