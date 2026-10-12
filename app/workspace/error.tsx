"use client";
import { Button } from "@/components/ui/button";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-lg px-5 py-16">
      <h1 className="text-2xl font-bold">Workspace unavailable</h1>
      <p role="alert" className="mt-4">
        We couldn’t load your club information. Please try again.
      </p>
      <Button onClick={reset} className="mt-5">
        Try again
      </Button>
    </main>
  );
}
