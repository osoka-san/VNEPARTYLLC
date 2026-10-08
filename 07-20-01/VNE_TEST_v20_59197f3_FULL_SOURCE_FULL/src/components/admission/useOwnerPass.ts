import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { qrAdmissionRead, qrAdmissionCommand } from "@/lib/admission/admission.functions";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
import { OwnerPassController } from "./owner-controller";
export function useOwnerPass() {
  const search = useSearch({ strict: false }) as { event?: string; participation?: string };
  const read = useServerFn(qrAdmissionRead),
    command = useServerFn(qrAdmissionCommand);
  const ports = useRef({ read, command });
  ports.current = { read, command };
  const controller = useMemo(
    () =>
      new OwnerPassController(search.event ?? "", search.participation ?? "", {
        read: (data) => ports.current.read({ data }),
        command: (data) => ports.current.command({ data }),
      }),
    [search.event, search.participation],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.snapshot,
    controller.snapshot,
  );
  useEffect(() => {
    controller.start(!document.hidden);
    const visibility = () => (document.hidden ? controller.hide() : controller.resume());
    const hide = () => controller.hide();
    const focus = () => {
      if (!document.hidden) controller.resume();
    };
    const signout = () => controller.signout();
    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DRAFT_SIGNOUT_EVENT);
    if (channel) channel.onmessage = signout;
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", focus);
    window.addEventListener(DRAFT_SIGNOUT_EVENT, signout);
    const interval = setInterval(() => {
      if (!document.hidden) void controller.refresh();
    }, 30000);
    return () => {
      controller.stop();
      clearInterval(interval);
      channel?.close();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", focus);
      window.removeEventListener(DRAFT_SIGNOUT_EVENT, signout);
    };
  }, [controller]);
  return { state, controller };
}
