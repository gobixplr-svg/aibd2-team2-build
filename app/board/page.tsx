import { STUB_ORDERS, STUB_PATIENTS, STUB_VENDORS } from "@/lib/data/stub-seed";
import { HospicePortal } from "./board";

export default function BoardPage() {
  return (
    <HospicePortal
      initialOrders={STUB_ORDERS}
      initialPatients={STUB_PATIENTS}
      vendors={STUB_VENDORS}
    />
  );
}
