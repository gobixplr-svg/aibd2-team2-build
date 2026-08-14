import { EmrPanel } from "./panel";

export default function EmrPage() {
  return (
    <div className="flex flex-col min-h-dvh w-full">
      <header className="bg-ink text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider opacity-70">
            EMR Simulator — HCHB / MatrixCare / Netsmart ADT pattern
          </div>
          <h1 className="text-lg font-semibold">
            Patient status events → Handoff
          </h1>
          <p className="text-xs opacity-70 mt-0.5">
            Stands in for the EMR&apos;s partner-connection layer. Every button
            emits the same eRx-shaped event BetterRX already receives today
            (meta.eventType + patient identifiers). This is the integration,
            made visible.
          </p>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 p-4">
        <EmrPanel />
      </div>
    </div>
  );
}
