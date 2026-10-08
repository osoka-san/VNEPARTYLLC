/** Versioned, structured questionnaire data. This module makes no network calls. */
import {
  QUESTIONNAIRE_QUESTIONS,
  QUESTIONNAIRE_RATING_QUESTIONS,
  type QuestionnaireId,
  type QuestionnaireRatingId,
} from "./questionnaire";
import { parseQuestionnaireSubmission } from "./questionnaire-submission";

export const QUESTIONNAIRE_VERSION = 3 as const;
export type QuestionnaireSource = "choice" | "custom" | "manual";
export type QuestionnaireSnapshot = {
  version: typeof QUESTIONNAIRE_VERSION;
  questions: {
    id: QuestionnaireId;
    label: string;
    answers: { text: string; source: QuestionnaireSource }[];
  }[];
  ratings: {
    id: QuestionnaireRatingId;
    label: string;
    minLabel: string;
    maxLabel: string;
    value: number;
  }[];
  age: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

/**
 * Shared validation is the existing server parser, in complete mode. This stricter
 * boundary accepts only the current structured wire format. Labels are copied
 * from the versioned server definition, never accepted as authoritative client text.
 * The legacy readable parser and its optional/one-answer compatibility stay intact.
 */
export function parseQuestionnaireSnapshot(
  input: unknown,
): { ok: true; snapshot: QuestionnaireSnapshot; details: string } | { ok: false } {
  if (
    !record(input) ||
    !onlyKeys(input, ["questionnaireVersion", "questionnaire", "ratings", "age"]) ||
    input["questionnaireVersion"] !== QUESTIONNAIRE_VERSION ||
    !Array.isArray(input["questionnaire"]) ||
    input["questionnaire"].length !== QUESTIONNAIRE_QUESTIONS.length
  )
    return { ok: false };

  // The supplied question label is permitted for serializeQuestionnaire callers,
  // but deliberately discarded. Identity/role/status fields are never accepted.
  for (const entry of input["questionnaire"]) {
    if (
      !record(entry) ||
      !onlyKeys(entry, ["questionId", "question", "answers"]) ||
      !Array.isArray(entry["answers"]) ||
      entry["answers"].length < 1 ||
      entry["answers"].length > 3 ||
      !entry["answers"].every((answer) => record(answer) && onlyKeys(answer, ["answer", "source"]))
    )
      return { ok: false };
  }
  const parsed = parseQuestionnaireSubmission(
    input["questionnaire"],
    input["ratings"],
    input["age"],
    true,
  );
  if (!parsed.ok || parsed.details === null) return { ok: false };

  // Types are narrowed only after all values passed shared runtime validation.
  const entries = input["questionnaire"] as {
    questionId: QuestionnaireId;
    answers: { answer: string; source: QuestionnaireSource }[];
  }[];
  const ratings = input["ratings"] as Record<QuestionnaireRatingId, number>;
  const snapshot: QuestionnaireSnapshot = {
    version: QUESTIONNAIRE_VERSION,
    questions: QUESTIONNAIRE_QUESTIONS.map(({ id, question }) => ({
      id,
      label: question,
      answers: entries
        .find((entry) => entry.questionId === id)!
        .answers.map(({ answer, source }) => ({
          text: answer.trim().replace(/\s+/gu, " "),
          source,
        })),
    })),
    ratings: QUESTIONNAIRE_RATING_QUESTIONS.map(({ id, question, minLabel, maxLabel }) => ({
      id,
      label: question,
      minLabel,
      maxLabel,
      value: ratings[id],
    })),
    age: input["age"] as number,
  };
  return { ok: true, snapshot, details: parsed.details };
}
