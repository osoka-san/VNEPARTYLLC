import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { createQuestionnaireState, type QuestionnaireState } from "@/lib/questionnaire";

/**
 * Temporary in-memory draft for /apply before a validated submission.
 * Lives only in React memory of the current app instance (mounted above the
 * route Outlet, created per render tree — never a shared server object).
 * Never written to storage, URL, history state or analytics; a hard reload clears it.
 */
type Draft = { name: string; contact: string; telegram: string; questionnaire: QuestionnaireState };
type DraftApi = Draft & {
  setName: (v: string) => void;
  setContact: (v: string) => void;
  setTelegram: (v: string) => void;
  setQuestionnaire: (v: QuestionnaireState) => void;
};

const ApplyDraftContext = createContext<DraftApi | null>(null);

export function ApplyDraftProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [telegram, setTelegram] = useState("");
  const [questionnaire, setQuestionnaire] = useState(createQuestionnaireState);
  const value = useMemo(
    () => ({
      name,
      contact,
      telegram,
      questionnaire,
      setName,
      setContact,
      setTelegram,
      setQuestionnaire,
    }),
    [name, contact, telegram, questionnaire],
  );
  return <ApplyDraftContext.Provider value={value}>{children}</ApplyDraftContext.Provider>;
}

export function useApplyDraft(): DraftApi {
  const ctx = useContext(ApplyDraftContext);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [telegram, setTelegram] = useState("");
  const [questionnaire, setQuestionnaire] = useState(createQuestionnaireState);
  return (
    ctx ?? {
      name,
      contact,
      telegram,
      questionnaire,
      setName,
      setContact,
      setTelegram,
      setQuestionnaire,
    }
  );
}
