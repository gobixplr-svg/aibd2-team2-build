"use client";

import { useState } from "react";
import type { Order, Patient, Vendor } from "@/lib/contracts";
import { AnalyticsTab } from "./analytics-tab";
import { EquipmentList } from "./equipment-list";
import { NoteModal } from "./note-modal";
import { PatientList } from "./patient-list";

const SUB_TABS = [
  { key: "list", label: "Equipment" },
  { key: "by-patient", label: "By patient" },
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
  vendorName,
  onNewOrder,
  onAddNote,
  onMessageFamily,
  onRequestReroute,
  onRecordPassing,
}: {
  orders: Order[];
  patients: Patient[];
  vendors: Vendor[];
  vendorName: (id: string) => string;
  onNewOrder: (patientId?: string) => void;
  onAddNote: (orderId: string, note: string) => void;
  onMessageFamily: (patientId: string) => void;
  onRequestReroute: (orderId: string) => void;
  onRecordPassing: (patientId: string) => void;
}) {
  const [subTab, setSubTab] = useState<SubTabKey>("list");
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const needsAttention = orders.filter(
    (o) => o.state === "at_risk" || o.state === "pickup_delayed",
  ).length;

  const subtitle =
    subTab === "by-patient"
      ? `${patients.length} patients on census · ${orders.reduce((s, o) => s + o.items.length, 0)} assets placed`
      : subTab === "analytics"
        ? "Analytics · synthetic"
        : `${orders.length} open orders${needsAttention > 0 ? ` · ${needsAttention} need attention` : ""}`;

  const noteOrder = noteFor ? orders.find((o) => o.id === noteFor) : undefined;

  return (
    <div className="p-5 bg-cream">
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div className="flex items-end gap-3 border-b border-line px-5 pt-4">
          <div>
            <div className="text-[17px] font-semibold text-ink">Equipment</div>
            <div className="mt-0.5 mb-3 text-[11px] text-ink-soft">{subtitle}</div>
          </div>
          <div className="ml-auto flex gap-1">
            {SUB_TABS.map((t) => (
              <button
                key={t.key}
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
        </div>

        {subTab === "list" && (
          <EquipmentList
            orders={orders}
            vendorName={vendorName}
            onNewOrder={() => onNewOrder()}
            onAddNote={setNoteFor}
            onMessageFamily={onMessageFamily}
            onRequestReroute={onRequestReroute}
          />
        )}
        {subTab === "by-patient" && (
          <PatientList
            patients={patients}
            orders={orders}
            vendorName={vendorName}
            onNewOrder={onNewOrder}
            onRecordPassing={onRecordPassing}
            onAddNote={setNoteFor}
            onMessageFamily={onMessageFamily}
          />
        )}
        {subTab === "analytics" && (
          <AnalyticsTab orders={orders} patients={patients} vendors={vendors} />
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
