"use client";

import { useState } from "react";
import type { OnHandAsset, Order, Patient, Vendor } from "@/lib/contracts";
import { AnalyticsTab } from "./analytics-tab";
import { orderNeedsAttention, type InboxItem } from "./derive";
import { EquipmentList } from "./equipment-list";
import { NoteModal } from "./note-modal";
import { OnHandList } from "./on-hand-list";
import { PatientList } from "./patient-list";

const SUB_TABS = [
  { key: "list", label: "Equipment" },
  { key: "by-patient", label: "By patient" },
  { key: "on-hand", label: "On-hand" },
  { key: "analytics", label: "Analytics" },
] as const;

type SubTabKey = (typeof SUB_TABS)[number]["key"];

// Wireframe turn 3, 3a: Equipment is the default landing surface and
// owns its own sub-tabs (Equipment / By patient / Analytics) — the top
// chrome switches product surfaces, this row switches how the same DME
// data is read. Approvals live one level up, in the header tray.
export function EquipmentPage({
  orders,
  patients,
  vendors,
  onHand,
  now,
  inbox,
  onApproveDraft,
  onDismissDraft,
  vendorName,
  onNewOrder,
  onAddNote,
  onMessageFamily,
  onRequestReroute,
  onRecordPassing,
  onAdvanceOnHand,
}: {
  orders: Order[];
  patients: Patient[];
  vendors: Vendor[];
  onHand: OnHandAsset[];
  now: number;
  inbox: InboxItem[];
  onApproveDraft: (id: string, draft?: string) => void;
  onDismissDraft: (id: string) => void;
  vendorName: (id: string) => string;
  onNewOrder: (patientId?: string) => void;
  onAddNote: (orderId: string, note: string) => void;
  onMessageFamily: (patientId: string) => Promise<boolean>;
  onRequestReroute: (orderId: string) => void;
  onRecordPassing: (patientId: string) => void;
  onAdvanceOnHand: (assetId: string, patientId?: string) => void;
}) {
  const [subTab, setSubTab] = useState<SubTabKey>("list");
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const needsAttention = orders.filter(orderNeedsAttention).length;

  const subtitle =
    subTab === "by-patient"
      ? `${patients.length} patients on census · ${orders.reduce((s, o) => s + o.items.length, 0)} assets placed`
      : subTab === "analytics"
        ? "Analytics · synthetic"
        : subTab === "on-hand"
          ? `${onHand.length} consignment assets · ${onHand.filter((a) => a.state === "on_hand").length} on-hand now`
          : `${orders.length} open orders${needsAttention > 0 ? ` · ${needsAttention} need attention` : ""}`;

  const noteOrder = noteFor ? orders.find((o) => o.id === noteFor) : undefined;

  return (
    <div className="p-5 bg-cream">
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 pt-4">
          <div>
            <div className="text-[17px] font-semibold text-ink">Equipment</div>
            <div className="mt-0.5 mb-3 text-[11px] text-ink-soft">{subtitle}</div>
          </div>
          <div className="ml-auto hidden gap-1 sm:flex">
            {SUB_TABS.map((t) => (
              <button
                key={t.key}
                data-spotlight={`subtab-${t.key}`}
                onClick={() => setSubTab(t.key)}
                className={`-mb-px border-b-[3px] px-3.5 py-2.5 text-xs ${
                  subTab === t.key
                    ? "border-brand font-medium text-ink"
                    : "border-transparent text-ink-soft"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Same reasoning as board.tsx's top nav: below sm a select beats a
              button row that would otherwise overflow the card. */}
          <select
            value={subTab}
            onChange={(e) => setSubTab(e.target.value as SubTabKey)}
            className="mb-3 w-full rounded-md border border-line-strong bg-page px-3 py-2 text-xs text-ink sm:hidden"
          >
            {SUB_TABS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {subTab === "list" && (
          <EquipmentList
            orders={orders}
            inbox={inbox}
            vendorName={vendorName}
            onNewOrder={() => onNewOrder()}
            onAddNote={setNoteFor}
            onMessageFamily={onMessageFamily}
            onRequestReroute={onRequestReroute}
            onApproveDraft={onApproveDraft}
            onDismissDraft={onDismissDraft}
          />
        )}
        {subTab === "by-patient" && (
          <PatientList
            patients={patients}
            orders={orders}
            now={now}
            inbox={inbox}
            vendorName={vendorName}
            onNewOrder={onNewOrder}
            onRecordPassing={onRecordPassing}
            onAddNote={setNoteFor}
            onMessageFamily={onMessageFamily}
            onApproveDraft={onApproveDraft}
            onDismissDraft={onDismissDraft}
          />
        )}
        {subTab === "on-hand" && (
          <OnHandList
            assets={onHand}
            patients={patients}
            vendorName={vendorName}
            now={now}
            onAdvance={onAdvanceOnHand}
          />
        )}
        {subTab === "analytics" && (
          <AnalyticsTab orders={orders} patients={patients} vendors={vendors} now={now} />
        )}
      </div>

      {noteOrder && (
        <NoteModal
          title={`Note — ${noteOrder.patientLabel} · ${noteOrder.id}`}
          initialNote={noteOrder.note ?? ""}
          onSave={(note) => {
            onAddNote(noteOrder.id, note);
            setNoteFor(null);
          }}
          onCancel={() => setNoteFor(null)}
        />
      )}
    </div>
  );
}
