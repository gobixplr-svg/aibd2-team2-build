import { OrderForm } from "./order-form";

export default function NewOrderPage() {
  return (
    <div className="flex flex-col min-h-dvh w-full">
      <header className="bg-navy text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider opacity-70">
            Handoff · Wasatch Hospice
          </div>
          <h1 className="text-lg font-semibold">New DME order</h1>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl flex-1 p-4">
        <OrderForm />
      </div>
    </div>
  );
}
