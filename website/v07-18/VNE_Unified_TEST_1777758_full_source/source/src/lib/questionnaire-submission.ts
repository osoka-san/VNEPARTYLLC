import {
  QUESTIONNAIRE_AGE_MIN,
  QUESTIONNAIRE_AGE_MAX,
  QUESTIONNAIRE_QUESTIONS,
  QUESTIONNAIRE_RATING_QUESTIONS,
} from "./questionnaire";

export const QUESTIONNAIRE_DETAILS_MAX_LENGTH = 4000;

/** Labels and scale meanings come from the server, never from untrusted form text. */
export function parseQuestionnaireSubmission(
  input: unknown,
  ratingsInput?: unknown,
  ageInput?: unknown,
  requireComplete = false,
): { ok: true; details: string | null } | { ok: false } {
  if (input === undefined && ratingsInput === undefined && ageInput === undefined)
    return requireComplete ? { ok: false } : { ok: true, details: null };
  const textInput = input === undefined ? [] : input;
  if (!Array.isArray(textInput) || textInput.length > QUESTIONNAIRE_QUESTIONS.length)
    return { ok: false };
  const answers = new Map<string, string[]>();
  for (const entry of textInput) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { ok: false };
    const question = QUESTIONNAIRE_QUESTIONS.find((item) => item.id === entry.questionId);
    if (!question || answers.has(question.id)) return { ok: false };
    // Accept the previous one-answer shape for already-open clients, while
    // every new question carries one to three separately validated answers.
    const values = entry.answers === undefined ? [entry] : entry.answers;
    if (!Array.isArray(values) || values.length < 1 || values.length > 3) return { ok: false };
    const parsed: string[] = [];
    const selected = new Set<string>();
    let customCount = 0;
    for (const value of values) {
      if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        typeof value.answer !== "string"
      )
        return { ok: false };
      const answer = value.answer.trim().replace(/\s+/gu, " ");
      if (
        !answer ||
        answer.length > 120 ||
        answer.split(/\s+/u).length > 5 ||
        /[\u0000-\u001f\u007f]/u.test(value.answer)
      )
        return { ok: false };
      if (!["choice", "custom", "manual"].includes(value.source)) return { ok: false };
      if (value.source === "choice") {
        if (!(question.options as readonly string[]).includes(answer) || selected.has(answer))
          return { ok: false };
        selected.add(answer);
      }
      if (value.source === "custom" && ++customCount > 1) return { ok: false };
      parsed.push(answer);
    }
    answers.set(question.id, parsed);
  }
  const ratings = new Map<string, number>();
  if (ratingsInput !== undefined) {
    if (!ratingsInput || typeof ratingsInput !== "object" || Array.isArray(ratingsInput))
      return { ok: false };
    for (const [id, value] of Object.entries(ratingsInput)) {
      if (!QUESTIONNAIRE_RATING_QUESTIONS.some((question) => question.id === id))
        return { ok: false };
      if (value === null) continue;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 100)
        return { ok: false };
      ratings.set(id, value);
    }
  }
  const age = ageInput === undefined || ageInput === null ? null : ageInput;
  if (
    age !== null &&
    (typeof age !== "number" ||
      !Number.isInteger(age) ||
      age < QUESTIONNAIRE_AGE_MIN ||
      age > QUESTIONNAIRE_AGE_MAX)
  )
    return { ok: false };
  if (
    requireComplete &&
    (answers.size !== QUESTIONNAIRE_QUESTIONS.length ||
      ratings.size !== QUESTIONNAIRE_RATING_QUESTIONS.length ||
      age === null)
  )
    return { ok: false };
  if (!answers.size && !ratings.size && age === null) return { ok: true, details: "" };
  const sections = QUESTIONNAIRE_QUESTIONS.flatMap((question, index) => {
    const answer = answers.get(question.id);
    return answer
      ? [
          `${index + 1}. ${question.question}\n${answer.length === 1 ? answer[0] : answer.map((value) => `• ${value}`).join("\n")}`,
        ]
      : [];
  });
  for (const [index, question] of QUESTIONNAIRE_RATING_QUESTIONS.entries()) {
    const rating = ratings.get(question.id);
    if (rating !== undefined)
      sections.push(
        `${QUESTIONNAIRE_QUESTIONS.length + index + 1}. ${question.question}\n${rating} из 100\n1 — ${question.minLabel}; 100 — ${question.maxLabel}`,
      );
  }
  if (age !== null) sections.push(`Возраст\n${age}`);
  const details = "Анкета знакомства · v3\n\n" + sections.join("\n\n");
  return details.length <= QUESTIONNAIRE_DETAILS_MAX_LENGTH ? { ok: true, details } : { ok: false };
}
