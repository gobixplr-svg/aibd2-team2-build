"use client";

import { useCallback, useEffect, useState } from "react";
import type { HandoffEvent, Order, OrderState, Patient, Vendor } from "@/lib/contracts";
import { useDemoEvents } from "@/lib/demo-bus";
import { addExtraOrder, loadExtraOrders } from "@/lib/demo-store";
import { DeceasedConfirm } from "./deceased-confirm";
import type { InboxItem } from "./derive";
import { EmrTab } from "./emr-tab";
import { EquipmentTab } from "./equipment-tab";
import { MessageFamilyModal } from "./message-family-modal";
import { NoteModal } from "./note-modal";
import { OrderFormModal } from "./order-form";
import { PatientsTab } from "./patients-tab";

// Turn 2 of the wireframes: one page, three tabs, actions revealed by
// expanding a row instead of a drag board + separate /board/new and
// /emr pages. All shared state (orders, patients, the approval inbox)
// lives here so the tabs read one source of truth.

const TABS = [
  { key: "patients", label: "Patients" },
  { key: "equipment", label: "Equipment" },
  { key: "emr", label: "EMR simulator" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const SEED_INBOX: InboxItem[] = [
  {
    id: "inbox-1",
    kind: "hermes-action",
    title: "Reassign STAT oxygen order to backup vendor?",
    detail:
      "ord-1003 (J. Maughan) is flagged at 82: Great Basin DME's ETA misses the 4:30 discharge by 54 min and dispatch is unconfirmed. Wasatch Medical Supply shows same-day capacity. Hermes prepared the reassignment — approve to execute.",
    needsApproval: true,
  },
  {
    id: "inbox-2",
    kind: "don-approval",
    title: "High-cost item awaiting DON approval",
    detail:
      "Low-air-loss mattress (E0277, ~$68/mo rental) requested for R. Okafor by case manager. Above the $50/mo auto-approve threshold.",
    needsApproval: true,
  },
];

let inboxSeq = 1;

export function HospicePortal({
  initialOrders,
  initialPatients,
  vendors,
}: {
  initialOrders: Order[];
  initialPatients: Patient[];
  vendors: Vendor[];
}) {
  const [tab, setTab] = useState<TabKey>("patients");
  const [orders, setOrders] = useState(initialOrders);
  const [patients, setPatients] = useState(initialPatients);
  const [inbox, setInbox] = useState<InboxItem[]>(SEED_INBOX);
  const [emrLog, setEmrLog] = useState<string[]>([]);
  const [newOrderFor, setNewOrderFor] = useState<string | undefined>(undefined);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deceasedFor, setDeceasedFor] = useState<string | null>(null);
  const [messageFamilyFor, setMessageFamilyFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  // Demo-created orders persist across navigation (localStorage isn't
  // available during SSR, so this can't run in the useState initializer).
  useEffect(() => {
    const extra = loadExtraOrders();
    if (extra.length)
      setOrders((os) => [...os, ...extra.filter((e) => !os.some((o) => o.id === e.id))]);
  }, []);

  useDemoEvents(
    useCallback((e: HandoffEvent) => {
      if (e.meta.eventType !== "newDmeOrder") return;
      const order = e.payload.order as Order;
      setOrders((os) => (os.some((o) => o.id === order.id) ? os : [...os, order]));
    }, []),
  );

  function placeOrder(order: Order) {
    setOrders((os) => [...os, order]);
    addExtraOrder(order); // cross-tab: the vendor queue picks this up over the demo bus
    setNewOrderOpen(false);
  }

  function saveNote(note: string) {
    if (!noteFor) return;
    setOrders((os) => os.map((o) => (o.id === noteFor ? { ...o, note } : o)));
    setNoteFor(null);
  }

  function sendFamilyMessage(patientId: string, body: string) {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient || !body) return;
    setInbox((ib) => [
      {
        id: `inbox-family-${inboxSeq++}`,
        kind: "family-message",
        title: `Message sent to ${patient.label}'s family`,
        detail: body,
        needsApproval: false,
        resolved: "approved",
      },
      ...ib,
    ]);
    setMessageFamilyFor(null);
  }

  function requestReroute(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setInbox((ib) => [
      {
        id: `inbox-reroute-${inboxSeq++}`,
        kind: "reroute",
        title: `Reroute ${order.id} to backup vendor?`,
        detail: `${order.patientLabel} — ${order.items.map((i) => i.name).join(", ")}, currently with ${vendorName(order.vendorId)}. Reroute posts here as an approval; a person still taps it.`,
        needsApproval: true,
      },
      ...ib,
    ]);
  }

  function approveInbox(id: string) {
    setInbox((ib) => ib.map((i) => (i.id === id ? { ...i, resolved: "approved" } : i)));
  }

  function dismissInbox(id: string) {
    setInbox((ib) => ib.map((i) => (i.id === id ? { ...i, resolved: "dismissed" } : i)));
  }

  function triggerPickup(patientId: string, triggeredBy: "nurse" | "emr") {
    const now = new Date().toISOString();
    const dueAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    setOrders((os) =>
      os.map((o) =>
        o.patientId === patientId && o.state === "delivered"
          ? {
              ...o,
              state: "pickup_triggered" as OrderState,
              pickup: { triggeredAt: now, triggeredBy, dueAt },
              timestamps: { ...o.timestamps, pickup_triggered: now },
            }
          : o,
      ),
    );
  }

  function confirmPassing() {
    if (!deceasedFor) return;
    const patient = patients.find((p) => p.id === deceasedFor);
    setPatients((ps) => ps.map((p) => (p.id === deceasedFor ? { ...p, status: "deceased" } : p)));
    triggerPickup(deceasedFor, "nurse");
    setInbox((ib) => [
      {
        id: `inbox-passing-${inboxSeq++}`,
        kind: "info",
        title: `${patient?.label ?? "Patient"} — passing recorded by nurse`,
        detail: "Pickup triggered on delivered equipment (24h window started).",
        needsApproval: false,
      },
      ...ib,
    ]);
    setDeceasedFor(null);
  }

  function fireEmrEvent(patient: Patient, type: string, to: Patient["status"]) {
    setPatients((ps) => ps.map((p) => (p.id === patient.id ? { ...p, status: to } : p)));
    if (type === "deceased") triggerPickup(patient.id, "emr");
    setEmrLog((l) =>
      [
        `${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })} → patientStatus.${type} · ${patient.label}`,
        ...l,
      ].slice(0, 8),
    );
  }

  const deceasedPatient = deceasedFor ? patients.find((p) => p.id === deceasedFor) : undefined;
  const messageFamilyPatient = messageFamilyFor
    ? patients.find((p) => p.id === messageFamilyFor)
    : undefined;
  const noteOrder = noteFor ? orders.find((o) => o.id === noteFor) : undefined;

  return (
    <div className="flex flex-col min-h-dvh w-full">
      <header className="bg-navy text-white">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4">
          <div className="py-3.5 text-[15px] font-bold">Handoff</div>
          <nav className="flex gap-0.5 self-stretch text-xs">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`border-b-[3px] px-4 py-4 ${
                  tab === t.key
                    ? "border-brand font-medium text-white"
                    : "border-transparent text-white/60"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5 py-3.5 text-[11px] text-white/70">
            <span>M. Ruiz, RN · case manager</span>
            <span className="inline-block h-[26px] w-[26px] rounded-full bg-secondary" />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 bg-surface">
        {tab === "patients" && (
          <PatientsTab
            patients={patients}
            orders={orders}
            vendorName={vendorName}
            onNewOrder={(patientId) => {
              setNewOrderFor(patientId);
              setNewOrderOpen(true);
            }}
            onRecordPassing={(patientId) => setDeceasedFor(patientId)}
            onAddNote={setNoteFor}
            onMessageFamily={setMessageFamilyFor}
          />
        )}
        {tab === "equipment" && (
          <EquipmentTab
            orders={orders}
            vendorName={vendorName}
            inbox={inbox}
            onApprove={approveInbox}
            onDismiss={dismissInbox}
            onAddNote={setNoteFor}
            onMessageFamily={setMessageFamilyFor}
            onRequestReroute={requestReroute}
          />
        )}
        {tab === "emr" && <EmrTab patients={patients} log={emrLog} onFire={fireEmrEvent} />}
      </div>

      {newOrderOpen && (
        <OrderFormModal
          vendors={vendors}
          patients={patients}
          initialPatientId={newOrderFor}
          onPlace={placeOrder}
          onCancel={() => setNewOrderOpen(false)}
        />
      )}

      {deceasedPatient && (
        <DeceasedConfirm
          patient={deceasedPatient}
          orders={orders.filter((o) => o.patientId === deceasedPatient.id)}
          onConfirm={confirmPassing}
          onCancel={() => setDeceasedFor(null)}
        />
      )}

      {messageFamilyPatient && (
        <MessageFamilyModal
          patient={messageFamilyPatient}
          orders={orders.filter((o) => o.patientId === messageFamilyPatient.id)}
          onSend={(body) => sendFamilyMessage(messageFamilyPatient.id, body)}
          onCancel={() => setMessageFamilyFor(null)}
        />
      )}

      {noteOrder && (
        <NoteModal
          title={`Note — ${noteOrder.patientLabel} · ${noteOrder.id}`}
          initialNote={noteOrder.note ?? ""}
          onSave={saveNote}
          onCancel={() => setNoteFor(null)}
        />
      )}
    </div>
  );
}
