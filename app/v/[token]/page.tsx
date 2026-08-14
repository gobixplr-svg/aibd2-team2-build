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
    <div className="flex flex-col min-h-dvh w-full">
      <header className="bg-navy text-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider opacity-70">
              Handoff · Dispatch
            </div>
            <h1 className="text-lg font-semibold">{vendor.name}</h1>
          </div>
          <span className="text-[11px] opacity-70">no login needed</span>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1">
        <VendorQueue initialOrders={orders} />
      </div>
    </div>
  );
}
