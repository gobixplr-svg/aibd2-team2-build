import Link from "next/link";

// Temporary index — Garrett's hospice board takes over "/" when it lands;
// this then moves to a /demo route as the judge-facing map of surfaces.
export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm md:max-w-2xl flex flex-col gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-brand">
            BetterRX Builder Day · Team 2
          </div>
          <h1 className="text-3xl font-bold text-navy">
            Better<span className="text-brand">RX</span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            The shared status board between hospices and DME vendors — it sees
            the failure coming before the family does.
          </p>
        </div>

        <nav className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Surface
            href="/board"
            title="Hospice portal"
            who="admissions nurse · case manager · DON"
            note="live — Equipment (list/patient/analytics) / EMR simulator / Family view"
          />
          <Surface
            href="/v/demo-vendor"
            title="Vendor dispatch"
            who="dispatcher, phone, no login"
            note="live"
          />
          <Surface
            href="/f/demo-family"
            title="Family tracker"
            who="family, read-only"
            note="coming Sat — Dan"
          />
        </nav>

        <p className="text-xs text-muted">
          Synthetic data only. No real patients, vendors, or PHI.
        </p>
      </div>
    </main>
  );
}

function Surface({
  href,
  title,
  who,
  note,
}: {
  href: string;
  title: string;
  who: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-line bg-surface px-4 py-3 shadow-sm hover:border-line-strong"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="text-[11px] text-muted">{who}</span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <span className="text-xs text-ink-soft">{note}</span>
      </div>
    </Link>
  );
}
