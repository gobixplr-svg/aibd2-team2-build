"use client";

import { useState } from "react";
import type {
  InboxItem as EngineInboxItem,
  Order,
  Patient,
  Vendor,
} from "@/lib/contracts";
import { postJson, useWorld } from "@/lib/use-world";
import { DeceasedConfirm } from "./deceased-confirm";
import type { InboxItem } from "./derive";
import { EmrTab } from "./emr-tab";
import { EquipmentTab } from "./equipment-tab";
import { OrderFormModal } from "./order-form";
import { PatientsTab } from "./patients-tab";

// Garrett's tabbed portal (wireframe turn 2) on the /api/state data
// layer: one page, three tabs, all state server-side. The tabs are
// untouched — this container polls the world, adapts the engine's
// inbox shape to the portal's display shape, and turns every local
// mutation into a POST + refresh.

const TABS = [
  { key: "patients", label: "Patients" },
  { key: "equipment", label: "Equipment" },
  { key: "emr", label: "EMR simulator" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface WorldState {
  orders: Order[];
  patients: Patient[];
  vendors: Vendor[];
  inbox: EngineInboxItem[];
  money: { pickupOverdueUsd: number };
}

// Engine inbox → portal display shape (derive.ts calls itself the
// stand-in for exactly this adapter).
function toPortalInbox(items: EngineInboxItem[]): InboxItem[] {
  return items
    .filter((i) => !i.silent)
    .map((i) => ({
      id: i.id,
      kind:
        i.source === "hermes"
          ? i.proposedAction === "reroute_vendor"
            ? "reroute"
            : "hermes-action"
          : i.source === "don_approval"
            ? "don-approval"
            : "family-message",
      title: i.title,
      detail: i.reasons.length ? `${i.detail} — ${i.reasons.join("; ")}` : i.detail,
      draft: i.draft,
      needsApproval: i.status === "pending",
      resolved:
        i.status === "approved" || i.status === "auto_executed"
          ? ("approved" as const)
          : i.status === "rejected"
            ? ("dismissed" as const)
            : undefined,
    }));
}

export function HospicePortal() {
  const { state, error, refresh } = useWorld<WorldState>("?scope=hospice");
  const [tab, setTab] = useState<TabKey>("patients");
  const [emrLog, setEmrLog] = useState<string[]>([]);
  const [newOrderFor, setNewOrderFor] = useState<string | undefined>(undefined);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deceasedFor, setDeceasedFor] = useState<string | null>(null);

  if (error)
    return <div className="p-6 text-sm text-critical">State unavailable: {error}</div>;
  if (!state)
    return <div className="min-h-dvh bg-page" />;

  const { orders, patients, vendors } = state;
  const inbox = toPortalInbox(state.inbox);
  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;

  async function placeOrder(order: Order) {
    const { id: _clientId, state: _s, timestamps: _t, ...fields } = order;
    await postJson("/api/orders", fields);
    setNewOrderOpen(false);
    refresh();
  }

  async function addNote(orderId: string, note: string) {
    await postJson(`/api/orders/${orderId}/note`, { note });
    refresh();
  }

  async function messageFamily(patientId: string) {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    await postJson("/api/inbox", {
      source: "family_message",
      tier: "human_facing",
      patientId,
      title: `Draft message to ${patient.label}'s family`,
      detail: `Claude-drafted update ready to review for ${patient.label} — a person sends it, never Hermes alone.`,
    });
    setTab("equipment");
    refresh();
  }

  async function requestReroute(orderId: string) {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    await postJson("/api/inbox", {
      source: "hermes",
      tier: "consequential",
      orderId,
      proposedAction: "reroute_vendor",
      title: `Reroute ${order.id} to backup vendor?`,
      detail: `${order.patientLabel} — ${order.items.map((i) => i.name).join(", ")}, currently with ${vendorName(order.vendorId)}. Reroute posts here as an approval; a person still taps it.`,
    });
    refresh();
  }

  async function approveInbox(id: string, draft?: string) {
    await postJson(`/api/inbox/${id}`, { action: "approve", draft });
    refresh();
  }

  async function dismissInbox(id: string) {
    await postJson(`/api/inbox/${id}`, { action: "reject" });
    refresh();
  }

  async function confirmPassing() {
    if (!deceasedFor) return;
    await postJson("/api/emr-event", {
      patientId: deceasedFor,
      status: "deceased",
      source: "nurse",
    });
    setDeceasedFor(null);
    refresh();
  }

  async function fireEmrEvent(patient: Patient, type: string, to: Patient["status"]) {
    void to; // server derives the stored status from the event type
    const status =
      type === "admit" || type === "admitted"
        ? "admitted"
        : type === "discharge" || type === "discharged"
          ? "discharged"
          : "deceased";
    await postJson("/api/emr-event", { patientId: patient.id, status, source: "emr" });
    setEmrLog((l) =>
      [
        `${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })} → newOrUpdatePatient (${status}) · ${patient.label}`,
        ...l,
      ].slice(0, 8),
    );
    refresh();
  }

  const deceasedPatient = deceasedFor ? patients.find((p) => p.id === deceasedFor) : undefined;

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
            {state.money.pickupOverdueUsd > 0 && (
              <span className="font-semibold text-white tabular-nums">
                ${state.money.pickupOverdueUsd.toFixed(2)} accruing
              </span>
            )}
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
            onAddNote={addNote}
            onMessageFamily={messageFamily}
          />
        )}
        {tab === "equipment" && (
          <EquipmentTab
            orders={orders}
            vendorName={vendorName}
            inbox={inbox}
            onApprove={approveInbox}
            onDismiss={dismissInbox}
            onAddNote={addNote}
            onMessageFamily={messageFamily}
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
    </div>
  );
}
