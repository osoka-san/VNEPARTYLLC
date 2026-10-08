import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRouterState } from "@tanstack/react-router";
import {
  getMyQuestionnaireDraft,
  saveMyQuestionnaireDraft,
} from "@/lib/questionnaire-draft.functions";
import { QuestionnaireDraftController } from "@/lib/questionnaire-draft-controller";
import type { QuestionnaireState } from "@/lib/questionnaire";
import { DRAFT_SIGNOUT_EVENT } from "@/lib/questionnaire-draft-session";
import type { DraftSection } from "@/lib/questionnaire-draft";

const ApplyDraftContext = createContext<QuestionnaireDraftController | null>(null);
export function ApplyDraftProvider({ children }: { children: ReactNode }) {
  const load = useServerFn(getMyQuestionnaireDraft);
  const save = useServerFn(saveMyQuestionnaireDraft);
  const [controller] = useState(
    () =>
      new QuestionnaireDraftController({ load, save: (command) => save({ data: command }) }, () =>
        crypto.randomUUID(),
      ),
  );
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    if (pathname === "/login") controller.clear();
    else if (pathname === "/apply") {
      if (["loading", "signin", "submitted"].includes(controller.state.phase))
        void controller.load();
      else void controller.revalidate();
    }
  }, [controller, pathname]);
  useEffect(() => {
    const clear = () => controller.clear();
    const focus = () => {
      if (window.location.pathname === "/apply") void controller.revalidate();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") void controller.flush();
      else focus();
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        controller.clear();
        if (window.location.pathname === "/apply") void controller.load();
      }
    };
    // Warn only while answers have not been acknowledged by the server; do not pretend unload can await a save.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.state.dirty && controller.state.owner) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const channel =
      typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(DRAFT_SIGNOUT_EVENT);
    if (channel) channel.onmessage = clear;
    window.addEventListener(DRAFT_SIGNOUT_EVENT, clear);
    window.addEventListener("focus", focus);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      channel?.close();
      window.removeEventListener(DRAFT_SIGNOUT_EVENT, clear);
      window.removeEventListener("focus", focus);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", visibility);
      controller.dispose();
    };
  }, [controller]);
  return <ApplyDraftContext.Provider value={controller}>{children}</ApplyDraftContext.Provider>;
}
export function useApplyDraft() {
  const controller = useContext(ApplyDraftContext);
  if (!controller) throw new Error("ApplyDraftProvider required");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  return {
    ...state.payload,
    persistence: state,
    setName: (name: string) => controller.update({ name }),
    setContact: (contact: string) => controller.update({ contact }),
    setTelegram: (telegram: string) => controller.update({ telegram }),
    setQuestionnaire: (questionnaire: QuestionnaireState) => controller.update({ questionnaire }),
    setEvent: (event: string | null) => controller.update({ event }),
    setResumeSection: (resumeSection: DraftSection) => controller.update({ resumeSection }),
    flush: () => controller.flush(),
    revalidate: () => controller.revalidate(),
    reload: () => controller.load(),
    complete: () => controller.complete(),
  };
}
