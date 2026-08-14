import { HospiceBoard } from "./board";

export default function BoardPage() {
  return (
    <div className="flex flex-col min-h-dvh w-full">
      <header className="bg-navy text-white">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-70">
              Handoff · Wasatch Hospice
            </div>
            <h1 className="text-lg font-semibold">DME Order Board</h1>
          </div>
          <span className="text-[11px] opacity-70">
            case manager · admissions · DON
          </span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-7xl flex-1">
        <HospiceBoard />
      </div>
    </div>
  );
}
