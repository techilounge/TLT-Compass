"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function PdfJobProgress({
  clubId,
  jobId,
  status,
  attempts,
}: {
  clubId: string;
  jobId: string;
  status: string;
  attempts: number;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const endpoint = `/workspace/${clubId}/calendar/pdf/${jobId}/process`;
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    if (status === "queued")
      void fetch(endpoint, { method: "POST" })
        .then(async (response) => {
          if (response.ok) {
            const result = await response.json();
            if (active)
              router.replace(
                `/workspace/${clubId}/calendar/import/${result.importId}`,
              );
          } else if (active && response.status !== 409)
            setMessage(
              "Extraction needs attention. Retry or use manual entry.",
            );
        })
        .catch(() => {
          if (active)
            setMessage("Connection interrupted; the saved job can be resumed.");
        });
    if (status === "queued" || status === "processing") {
      let polls = 0;
      timer = setInterval(() => {
        router.refresh();
        if (++polls >= 20 && timer) clearInterval(timer);
      }, 3000);
    }
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [status, endpoint, clubId, router]);
  return (
    <div className="space-y-4">
      <p role="status">
        {message ||
          (status === "processing" || status === "queued"
            ? "Extracting the saved PDF. Results will open for human review."
            : "Extraction did not complete. The original remains private and saved.")}
      </p>
      <Button
        type="button"
        disabled={busy || attempts >= 3}
        onClick={async () => {
          setBusy(true);
          try {
            const response = await fetch(endpoint, { method: "POST" });
            if (response.ok) {
              const result = await response.json();
              router.push(
                `/workspace/${clubId}/calendar/import/${result.importId}`,
              );
            } else
              setMessage(
                "Job is busy, exhausted or failed validation. Refresh to see its current state.",
              );
          } catch {
            setMessage(
              "Connection interrupted. Refresh to resume the saved job.",
            );
          } finally {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        Resume / retry extraction
      </Button>
      <Button type="button" variant="outline" onClick={() => router.refresh()}>
        Refresh status
      </Button>
    </div>
  );
}
