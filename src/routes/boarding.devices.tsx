import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/boarding/devices")({
  beforeLoad: () => { throw redirect({ to: "/devices" }); },
});