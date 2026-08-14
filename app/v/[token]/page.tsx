import { VendorQueue } from "./queue";

export default async function VendorPage({ params }: PageProps<"/v/[token]">) {
  const { token } = await params;
  return <VendorQueue token={token} />;
}
