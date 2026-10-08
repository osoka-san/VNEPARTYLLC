import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { recordBrowserEvent } from "./telemetry";
export function ClientTelemetry() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    recordBrowserEvent("page_ready", pathname === "/admin/diagnostics" ? "observatory" : "public");
  }, [pathname]);
  useEffect(() => {
    const online = () => recordBrowserEvent("browser_online");
    const offline = () => recordBrowserEvent("browser_offline");
    const error = () => recordBrowserEvent("script_failed");
    const rejected = () => recordBrowserEvent("rejection");
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("error", error);
    window.addEventListener("unhandledrejection", rejected);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", rejected);
    };
  }, []);
  return null;
}
