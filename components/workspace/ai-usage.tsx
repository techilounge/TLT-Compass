type Usage = {
  month_utc: string;
  attempts: number;
  succeeded: number;
  failed: number;
  in_flight: number;
  reserved_usd: number;
  estimated_usd: number;
  scope: string;
  days: { day: string; attempts: number; reserved_usd: number }[];
};
export function AIUsage({
  usage,
  budget,
  alertPercent,
}: {
  usage: Usage;
  budget?: number;
  alertPercent: number;
}) {
  const cost = Number(usage.reserved_usd),
    ceiling = budget === undefined ? undefined : Number(budget);
  const warning =
    ceiling !== undefined &&
    cost > 0 &&
    (ceiling === 0 || (cost / ceiling) * 100 >= alertPercent);
  return (
    <section className="panel space-y-4">
      <h2>
        {usage.scope === "platform"
          ? "Platform"
          : usage.scope === "club"
            ? "Club"
            : "Your"}{" "}
        AI usage · {usage.month_utc} UTC
      </h2>
      <p>
        Full current-month totals, including failed and interrupted
        reservations. Token-based estimates are separate and may be incomplete;
        provider invoices determine actual charges.
      </p>
      {usage.scope === "own" && (
        <p>
          These totals include only your attempts. Club-wide spending is
          available to eligible managers.
        </p>
      )}
      {warning && (
        <p role="status" className="notice">
          Spending warning: conservative reservations have reached the
          configured {alertPercent}% dashboard threshold. Review budgets and
          provider usage before more requests.
        </p>
      )}
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt>Reserved ceiling charged</dt>
          <dd>
            ${cost.toFixed(6)}
            {ceiling !== undefined ? ` / $${ceiling.toFixed(6)}` : ""}
          </dd>
        </div>
        <div>
          <dt>Estimated token cost</dt>
          <dd>${Number(usage.estimated_usd).toFixed(6)}</dd>
        </div>
        <div>
          <dt>Attempts</dt>
          <dd>{usage.attempts}</dd>
        </div>
        <div>
          <dt>Succeeded / failed / unfinished</dt>
          <dd>
            {usage.succeeded} / {usage.failed} / {usage.in_flight}
          </dd>
        </div>
      </dl>
      <details>
        <summary>Daily reservation totals</summary>
        {usage.days.length ? (
          <table>
            <caption>Current month, UTC dates</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Attempts</th>
                <th scope="col">Reserved USD</th>
              </tr>
            </thead>
            <tbody>
              {usage.days.map((day) => (
                <tr key={day.day}>
                  <th scope="row">{day.day}</th>
                  <td>{day.attempts}</td>
                  <td>{Number(day.reserved_usd).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No attempts this month.</p>
        )}
      </details>
    </section>
  );
}
