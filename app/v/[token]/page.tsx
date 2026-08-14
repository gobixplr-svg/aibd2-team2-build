import { notFound } from "next/navigation";
import { vendorByToken, STUB_ORDERS } from "../stub-data";
import { VendorQueue } from "./queue";

export default async function VendorPage({
  params,
}: PageProps<"/v/[token]">) {
  const { token } = await params;
  const vendor = vendorByToken(token);
  if (!vendor) notFound();

  const orders = STUB_ORDERS.filter((o) => o.vendorId === vendor.id);

  return (
    <div className="flex flex-col min-h-dvh w-full max-w-md mx-auto">
      <header className="bg-navy text-white px-4 py-3 flex items-baseline justify-between rounded-b-lg">
        <div>
          <div className="text-[11px] uppercase tracking-wider opacity-70">
            Handoff · Dispatch
          </div>
          <h1 className="text-lg font-semibold">{vendor.name}</h1>
        </div>
        <span className="text-[11px] opacity-70">no login needed</span>
      </header>
      <VendorQueue initialOrders={orders} />
    </div>
  );
}
