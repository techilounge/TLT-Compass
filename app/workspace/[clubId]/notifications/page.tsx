import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClub } from "@/lib/auth/session";
import { uuid } from "@/modules/program-rules/contracts";
import { SaveButton } from "@/components/workspace/forms";
import { readNotification, saveNotificationPreferences } from "./actions";
const labels: Record<string, string> = {
  assigned: "A task was assigned to you.",
  submitted: "A task is ready for supervised review.",
  changes_requested: "A reviewer requested changes to your task.",
  verified: "Your task was verified.",
  closed: "Your task was closed.",
  cancelled: "Your task was cancelled.",
};
export default async function Inbox({
  params,
  searchParams,
}: {
  params: Promise<{ clubId: string }>;
  searchParams: Promise<{ page?: string; notice?: string }>;
}) {
  const { clubId } = await params;
  if (!uuid.safeParse(clubId).success) notFound();
  const { db, user } = await requireClub(clubId),
    query = await searchParams;
  const page = /^\d{1,4}$/.test(query.page ?? "")
    ? Math.max(1, Number(query.page))
    : 1;
  const [items, pref] = await Promise.all([
    db
      .from("notifications")
      .select("id,participant_id,kind,read_at")
      .eq("club_id", clubId)
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * 25, page * 25),
    db
      .from("notification_preferences")
      .select("task_updates")
      .eq("club_id", clubId)
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);
  if (items.error || pref.error) throw Error("Unable to load inbox");
  return (
    <main
      id="main"
      tabIndex={-1}
      className="mx-auto max-w-3xl space-y-6 px-5 py-10"
    >
      <Link href={`/workspace/${clubId}`}>← Workspace</Link>
      <h1>Notifications</h1>
      <p>
        Private task updates from your club. Open the Record Book for current
        details. This inbox does not send email or device alerts.
      </p>
      {query.notice && (
        <p role="alert">
          That update is unavailable. Reload to check your access.
        </p>
      )}
      <form
        action={saveNotificationPreferences.bind(null, clubId)}
        className="panel flex flex-wrap items-center gap-4"
      >
        <label>
          <input
            type="checkbox"
            name="task_updates"
            defaultChecked={pref.data?.task_updates ?? true}
          />{" "}
          Receive new task updates in this inbox
        </label>
        <SaveButton>Save preference</SaveButton>
      </form>
      {!items.data.length && (
        <p className="notice">No task updates on this page.</p>
      )}
      <ul className="space-y-4">
        {items.data.slice(0, 25).map((item) => (
          <li key={item.id} className="panel space-y-3">
            <p>
              {labels[item.kind] ?? "A task was updated."}{" "}
              {!item.read_at && <strong>Unread</strong>}
            </p>
            <Link
              href={`/workspace/${clubId}/record-book/${item.participant_id}`}
            >
              Open Record Book
            </Link>
            {!item.read_at && (
              <form action={readNotification.bind(null, clubId, item.id)}>
                <SaveButton>Mark read</SaveButton>
              </form>
            )}
          </li>
        ))}
      </ul>
      <nav aria-label="Inbox pages" className="flex gap-4">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        <span>Page {page}</span>
        {items.data.length > 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
      </nav>
    </main>
  );
}
