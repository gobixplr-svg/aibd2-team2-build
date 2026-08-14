import { redirect } from "next/navigation";

// EMR simulator moved into a tab on /board (wireframe turn 2, 2f) — this
// route stays as a redirect so old links/bookmarks don't 404.
export default function EmrRedirect() {
  redirect("/board");
}
