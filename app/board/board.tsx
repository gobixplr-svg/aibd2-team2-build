"use client";

import { useState } from "react";
import type {
  InboxItem as EngineInboxItem,
  OnHandAsset,
  Order,
  Patient,
  Vendor,
} from "@/lib/contracts";
import { postJson, useWorld } from "@/lib/use-world";
import { useSpotlight } from "@/lib/spotlight";
import { ApprovalsTray } from "./approvals-tray";
import { DeceasedConfirm } from "./deceased-confirm";
import type { InboxItem } from "./derive";
import { EmrTab } from "./emr-tab";
import { EquipmentPage } from "./equipment-page";
import { FamilyViewTab } from "./family-view-tab";
import { OrderFormModal } from "./order-form";

// Wireframe turn 3: top chrome drops Patients in favor of Equipment
// (now its own sub-tabbed page — Equipment / By patient / Analytics),
// EMR simulator, and Family view. Approvals move out of any one tab
// into a header tray that applies across all three Equipment sub-tabs.
// State layer (useWorld/postJson) is unchanged from the /api/state port.

const TABS = [
  { key: "equipment", label: "Equipment" },
  { key: "emr", label: "EMR simulator" },
  { key: "family", label: "Family view" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface WorldState {
  orders: Order[];
  patients: Patient[];
  vendors: Vendor[];
  onHand: OnHandAsset[];
  inbox: EngineInboxItem[];
  money: { pickupOverdueUsd: number };
  clock?: { speed: number };
}

// Engine inbox → portal display shape (derive.ts calls itself the
// stand-in for exactly this adapter).
function toPortalInbox(
  items: EngineInboxItem[],
  patients: Patient[],
  orders: Order[],
): InboxItem[] {
  const label = (id?: string) => patients.find((p) => p.id === id)?.label;
  // A pending approval is only worth a nurse's attention while the order
  // it targets can still be acted on. Once the pickup is completed — or
  // the item points at an order that isn't on the live board at all
  // (historical ord-h seeds) — approving it would execute against a
  // closed order, so the moment has passed: suppress it.
  const stale = (i: EngineInboxItem) => {
    if (i.status !== "pending" || !i.orderId) return false;
    const order = orders.find((o) => o.id === i.orderId);
    return !order || Boolean(order.pickup?.completedAt);
  };
  return items
    .filter((i) => !i.silent && !stale(i))
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
      detail: i.detail,
      reasons: i.reasons,
      draft: i.draft,
      patientId: i.patientId,
      context: [label(i.patientId), i.orderId].filter(Boolean).join(" · ") || undefined,
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
  const [tab, setTab] = useState<TabKey>("equipment");
  const [emrLog, setEmrLog] = useState<string[]>([]);
  const [newOrderFor, setNewOrderFor] = useState<string | undefined>(undefined);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [deceasedFor, setDeceasedFor] = useState<string | null>(null);
  useSpotlight();

  if (error)
    return <div className="p-6 text-sm text-critical">State unavailable: {error}</div>;
  if (!state)
    return <div className="min-h-dvh bg-page" />;

  const { orders, patients, vendors, onHand } = state;
  const now = new Date(state.now).getTime();
  const inbox = toPortalInbox(state.inbox, patients, orders);
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

  async function messageFamily(patientId: string): Promise<boolean> {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return false;
    const ok = await postJson("/api/inbox", {
      source: "family_message",
      tier: "human_facing",
      patientId,
      title: `Draft message to ${patient.label}'s family`,
      detail: `Claude-drafted update ready to review for ${patient.label} — a person sends it, never Hermes alone.`,
    });
    refresh();
    return ok;
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

  async function advanceOnHand(assetId: string, patientId?: string) {
    await postJson(`/api/on-hand/${assetId}`, { action: "advance", patientId });
    refresh();
  }

  async function requestPickup(orderId: string) {
    await postJson(`/api/orders/${orderId}/transition`, {
      to: "pickup_triggered",
      pickupBy: "nurse",
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
      <header className="bg-navy text-white border-t-[3px] border-brand">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-4">
          <div className="flex items-center gap-1.5 py-3.5">
            <span className="inline-block h-5 w-5 rounded-md bg-brand" />
            <span className="text-[15px] font-bold tracking-tight">
              Better<span className="text-brand">RX</span>
            </span>
          </div>
          <nav className="flex gap-0.5 self-stretch text-xs">
            {TABS.map((t) => (
              <button
                key={t.key}
                data-spotlight={`tab-${t.key}`}
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
            {/* The world's clock — every deadline on the board is relative
                to THIS time, not the wall clock. The demo turns it faster;
                showing it is what makes "due by 4:30" legible at 2:15 on
                a Saturday. */}
            <span
              className="tabular-nums text-white/80"
              title="World clock — all deadlines and SLAs are measured against this time. The demo can run it faster than real time."
            >
              {new Date(state.now).toLocaleString([], {
                weekday: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
              {(state.clock?.speed ?? 1) !== 1 && (
                <span className="ml-1 font-semibold text-teal">{state.clock?.speed}×</span>
              )}
            </span>
            {state.money.pickupOverdueUsd > 0 && (
              <span className="font-semibold text-white tabular-nums">
                ${state.money.pickupOverdueUsd.toFixed(2)} accruing
              </span>
            )}
            <ApprovalsTray inbox={inbox} onApprove={approveInbox} onDismiss={dismissInbox} />
            <span>M. Ruiz, RN · case manager</span>
            <span className="inline-block h-[26px] w-[26px] rounded-full bg-secondary" />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 bg-surface">
        {tab === "equipment" && (
          <EquipmentPage
            orders={orders}
            patients={patients}
            vendors={vendors}
            onHand={onHand}
            now={now}
            inbox={inbox}
            onApproveDraft={approveInbox}
            onDismissDraft={dismissInbox}
            vendorName={vendorName}
            onNewOrder={(patientId) => {
              setNewOrderFor(patientId);
              setNewOrderOpen(true);
            }}
            onAddNote={addNote}
            onMessageFamily={messageFamily}
            onRequestReroute={requestReroute}
            onRecordPassing={(patientId) => setDeceasedFor(patientId)}
            onAdvanceOnHand={advanceOnHand}
          />
        )}
        {tab === "emr" && (
          <EmrTab
            patients={patients}
            orders={orders}
            vendors={vendors}
            vendorName={vendorName}
            log={emrLog}
            onFire={fireEmrEvent}
            onRequestPickup={requestPickup}
          />
        )}
        {tab === "family" && <FamilyViewTab patients={patients} />}
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
