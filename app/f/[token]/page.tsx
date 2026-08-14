import { FamilyView } from "./family-view";

// Family tracker — read-only, reached by a text-message link. Calm by
// design: no status colors, no jargon, nothing to learn. The one page
// in the product where the reader may be grieving. Data comes from
// /api/state?scope=family — deliberately thin (no risk, no vendors).

export default async function FamilyPage({ params }: PageProps<"/f/[token]">) {
  const { token } = await params;
  return <FamilyView token={token} />;
}
