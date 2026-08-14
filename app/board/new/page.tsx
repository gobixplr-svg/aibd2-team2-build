import { redirect } from "next/navigation";

// New order moved into a modal on the Patients tab (wireframe turn 2,
// 2c) — this route stays as a redirect so old links/bookmarks don't 404.
export default function NewOrderRedirect() {
  redirect("/board");
}
