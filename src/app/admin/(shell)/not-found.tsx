import { RouteNotFound } from "@/components/portal/route-not-found";

/** 404 inside /admin keeps the sidebar (DECISIONS D-132). */
export default function NotFound() {
  return <RouteNotFound home="/admin" />;
}
