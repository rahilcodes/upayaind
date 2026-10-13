import { RouteNotFound } from "@/components/portal/route-not-found";

/** 404 inside /app keeps the sidebar (DECISIONS D-132). */
export default function NotFound() {
  return <RouteNotFound home="/app" />;
}
