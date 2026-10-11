import { Button } from "@/components/ui/button";
import Link from "next/link";
import { EmailLinkLanding } from "@/components/auth/email-link-landing";

const pillars = [
  [
    "01",
    "Learn with purpose",
    "Build leadership skills through guided training and reflection.",
  ],
  [
    "02",
    "Lead through service",
    "Put learning into practice alongside an adult mentor.",
  ],
  [
    "03",
    "Grow together",
    "Recognize progress with documented work and thoughtful feedback.",
  ],
];
export default function Home() {
  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      <EmailLinkLanding />
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border py-6">
        <Link
          href="/"
          className="flex min-h-11 items-center gap-3 font-bold tracking-tight"
        >
          <span
            aria-hidden="true"
            className="flex size-11 items-center justify-center rounded-xl bg-primary text-xl text-primary-foreground"
          >
            ✦
          </span>
          TLT Compass
        </Link>
        <span className="rounded-full border border-border px-3 py-2 text-xs font-semibold">
          Foundation preview
        </span>
      </header>
      <main id="main" tabIndex={-1} className="py-14 sm:py-24">
        <section aria-labelledby="welcome" className="max-w-3xl">
          <p className="mb-5 text-sm font-bold uppercase tracking-widest text-primary">
            Teen Leadership Training
          </p>
          <h1
            id="welcome"
            className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl"
          >
            A clear direction.
            <br />A purposeful journey.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            A place to connect training, service, and mentorship — one step of
            your leadership journey at a time.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/sandbox">Open practice workspace</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Club sign-in</Link>
            </Button>
            <Button asChild>
              <a href="#journey">Explore the journey</a>
            </Button>
            <Button asChild variant="outline">
              <a href="#preview">About this preview</a>
            </Button>
          </div>
        </section>
        <section
          id="journey"
          aria-labelledby="journey-heading"
          className="mt-20 scroll-mt-6"
        >
          <h2
            id="journey-heading"
            className="text-2xl font-bold tracking-tight"
          >
            Leadership grows through practice
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {pillars.map(([number, title, description]) => (
              <article
                key={number}
                className="rounded-2xl border border-border bg-card p-6"
              >
                <span className="text-sm font-bold text-primary">{number}</span>
                <h3 className="mt-7 text-lg font-semibold">{title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>
        <section
          id="preview"
          aria-labelledby="preview-heading"
          className="mt-10 scroll-mt-6 rounded-2xl border border-border bg-muted p-6 sm:p-8"
        >
          <h2 id="preview-heading" className="text-lg font-semibold">
            The foundation is taking shape
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-muted-foreground">
            Explore the Record Book workflow in a synthetic practice workspace,
            or sign in to a securely configured club. Club onboarding, versioned
            requirements, and supervised task reviews form the first app slice.
            Calendars, points, and AI are planned for later stages.
          </p>
        </section>
      </main>
      <footer className="border-t border-border py-6 text-sm text-muted-foreground">
        TLT Compass · Guided by service. Grounded in mentorship.
      </footer>
    </div>
  );
}
