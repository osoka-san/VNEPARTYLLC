export const QUESTIONNAIRE_MAX_WORDS = 5;
export const QUESTIONNAIRE_MAX_LENGTH = 120;
export const QUESTIONNAIRE_MAX_ANSWERS = 3;
export const MAX_ANSWERS = QUESTIONNAIRE_MAX_ANSWERS;
export const QUESTIONNAIRE_AGE_MIN = 1;
export const QUESTIONNAIRE_AGE_MAX = 100;
export const QUESTIONNAIRE_RATING_MIN = 1;
export const QUESTIONNAIRE_RATING_MAX = 100;

export const QUESTIONNAIRE_RATING_QUESTIONS = [
  {
    id: "social_energy",
    question: "Сколько общения тебе хочется этой ночью?",
    minLabel: "Больше времени для себя",
    maxLabel: "Знакомиться и общаться",
  },
  {
    id: "evening_pace",
    question: "Какой ритм вечера тебе ближе?",
    minLabel: "Спокойный",
    maxLabel: "Энергичный",
  },
  {
    id: "spontaneity",
    question: "Насколько тебе комфортна спонтанность?",
    minLabel: "Люблю понятный план",
    maxLabel: "Люблю неожиданные повороты",
  },
] as const;

export const QUESTIONNAIRE_QUESTIONS = [
  {
    id: "interests",
    question: "Что увлекает тебя сильнее всего?",
    options: [
      "Музыка и звук",
      "Искусство и творчество",
      "Люди и их истории",
      "Новые места и впечатления",
      "Идеи и технологии",
    ],
  },
  {
    id: "social_role",
    question: "Какая роль тебе ближе в компании?",
    options: [
      "Начинаю разговоры",
      "Знакомлю людей между собой",
      "Внимательно слушаю",
      "Подхватываю чужие идеи",
      "Меняю роль по настроению",
    ],
  },
  {
    id: "meeting_style",
    question: "Как тебе приятнее знакомиться?",
    options: [
      "Один на один",
      "В небольшой компании",
      "Через общее занятие",
      "Через знакомых",
      "Спонтанно, без повода",
    ],
  },
  {
    id: "trust",
    question: "Что помогает тебе довериться человеку?",
    options: [
      "Постоянство в поступках",
      "Уважение к личному пространству",
      "Прямота в разговоре",
      "Общее чувство юмора",
      "Время, проведённое вместе",
    ],
  },
  {
    id: "boundaries",
    question: "Как ты показываешь, что тебе некомфортно?",
    options: [
      "Говорю прямо",
      "Прошу сделать паузу",
      "Отхожу в сторону",
      "Показываю без слов",
      "Обсуждаю позже",
    ],
  },
  {
    id: "discomfort",
    question: "Что быстрее всего нарушает твой комфорт?",
    options: [
      "Слишком много шума",
      "Мало личного пространства",
      "Непрошеное внимание",
      "Давление на участие",
      "Непонятные правила",
    ],
  },
  {
    id: "motivation",
    question: "За чем тебе хочется прийти в ВНЕ?",
    options: [
      "За музыкой и атмосферой",
      "За новыми знакомствами",
      "За временем со своими",
      "За сменой обстановки",
      "За новыми впечатлениями",
    ],
  },
] as const;

export type QuestionnaireId = (typeof QUESTIONNAIRE_QUESTIONS)[number]["id"];
export type QuestionnaireRatingId = (typeof QUESTIONNAIRE_RATING_QUESTIONS)[number]["id"];
export type QuestionnaireMode = "choices" | "manual";
export type QuestionnaireAnswer = {
  selected: string[];
  custom: string;
  useCustom: boolean;
  /** null means manual mode has never initialized this answer. Empty fields are intentional. */
  manual: string[] | null;
};
export type QuestionnaireState = {
  mode: QuestionnaireMode;
  answers: Record<QuestionnaireId, QuestionnaireAnswer>;
  ratings: Record<QuestionnaireRatingId, number | null>;
  age: number | null;
};
export type SerializedQuestionnaireAnswer = {
  questionId: QuestionnaireId;
  question: string;
  answers: {
    answer: string;
    source: "choice" | "custom" | "manual";
  }[];
};

export function createQuestionnaireAnswer(): QuestionnaireAnswer {
  return { selected: [], custom: "", useCustom: false, manual: null };
}

export function createQuestionnaireState(): QuestionnaireState {
  return {
    mode: "choices",
    answers: Object.fromEntries(
      QUESTIONNAIRE_QUESTIONS.map(({ id }) => [id, createQuestionnaireAnswer()]),
    ) as QuestionnaireState["answers"],
    ratings: { social_energy: null, evening_pace: null, spontaneity: null },
    age: null,
  };
}

export function countQuestionnaireWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

export function getQuestionnaireAnswer(state: QuestionnaireState, id: QuestionnaireId): string {
  return getQuestionnaireValues(state, id).join(" · ");
}

export function getQuestionnaireValues(state: QuestionnaireState, id: QuestionnaireId): string[] {
  const answer = state.answers[id];
  const values =
    state.mode === "manual" ? (answer.manual ?? getChoiceValues(answer)) : getChoiceValues(answer);
  return values.filter((value) => value.trim());
}

function getChoiceValues(answer: QuestionnaireAnswer): string[] {
  return [...answer.selected, ...(answer.useCustom ? [answer.custom] : [])];
}

/** Each mode keeps its own draft. Copy a choice only on the first switch to manual mode. */
export function setQuestionnaireMode(
  state: QuestionnaireState,
  mode: QuestionnaireMode,
): QuestionnaireState {
  if (mode === state.mode) return state;
  return {
    ...state,
    mode,
    answers: Object.fromEntries(
      QUESTIONNAIRE_QUESTIONS.map(({ id }) => {
        const answer = state.answers[id];
        return [
          id,
          mode === "manual" && answer.manual === null
            ? { ...answer, manual: getChoiceValues(answer).length ? getChoiceValues(answer) : [""] }
            : answer,
        ];
      }),
    ) as QuestionnaireState["answers"],
  };
}

/** Required on submission; entry errors can be checked before the first submit. */
export function validateQuestionnaire(
  state: QuestionnaireState,
  { requireAll = true }: { requireAll?: boolean } = {},
): Partial<Record<QuestionnaireId | QuestionnaireRatingId | "age", string>> {
  const errors: Partial<Record<QuestionnaireId | QuestionnaireRatingId | "age", string>> = {};
  for (const { id, options } of QUESTIONNAIRE_QUESTIONS) {
    const draft = state.answers[id];
    const values =
      state.mode === "manual" ? (draft.manual ?? getChoiceValues(draft)) : getChoiceValues(draft);
    if (values.length > QUESTIONNAIRE_MAX_ANSWERS) {
      errors[id] = "Можно выбрать до 3 ответов в сумме, включая свой.";
    } else if (state.mode === "choices" && draft.useCustom && !draft.custom.trim()) {
      errors[id] = "Напиши свой ответ или сними этот вариант.";
    } else if (requireAll && !values.some((answer) => answer.trim())) {
      errors[id] = "Выбери или напиши хотя бы один ответ.";
    } else if (values.some((answer) => countQuestionnaireWords(answer) > QUESTIONNAIRE_MAX_WORDS)) {
      errors[id] = "В каждом ответе оставь не больше 5 слов.";
    } else if (values.some((answer) => answer.length > QUESTIONNAIRE_MAX_LENGTH)) {
      errors[id] = "Каждый ответ должен быть не длиннее 120 символов.";
    } else if (
      state.mode === "choices" &&
      (draft.selected.some((answer) => !(options as readonly string[]).includes(answer)) ||
        new Set(draft.selected).size !== draft.selected.length)
    ) {
      errors[id] = "Выбери вариант из списка или напиши свой ответ.";
    }
  }
  for (const { id } of QUESTIONNAIRE_RATING_QUESTIONS) {
    const rating = state.ratings?.[id] ?? null;
    if (requireAll && rating === null) {
      errors[id] = "Выбери значение от 1 до 100.";
    } else if (
      rating !== null &&
      (!Number.isInteger(rating) ||
        rating < QUESTIONNAIRE_RATING_MIN ||
        rating > QUESTIONNAIRE_RATING_MAX)
    ) {
      errors[id] = "Укажи целое число от 1 до 100 или очисти ответ.";
    }
  }
  if (requireAll && state.age == null) {
    errors.age = "Укажи возраст.";
  } else if (
    state.age != null &&
    (!Number.isInteger(state.age) ||
      state.age < QUESTIONNAIRE_AGE_MIN ||
      state.age > QUESTIONNAIRE_AGE_MAX)
  ) {
    errors.age = "Укажи возраст целым числом от 1 до 100.";
  }
  return errors;
}

/** No scoring or inferred personality traits: only the user's active answers. */
export function serializeQuestionnaire(state: QuestionnaireState): SerializedQuestionnaireAnswer[] {
  return QUESTIONNAIRE_QUESTIONS.flatMap(({ id, question }) => {
    const draft = state.answers[id];
    const entries: SerializedQuestionnaireAnswer["answers"] =
      state.mode === "manual"
        ? (draft.manual ?? getChoiceValues(draft)).map((answer) => ({ answer, source: "manual" }))
        : [
            ...draft.selected.map((answer) => ({ answer, source: "choice" as const })),
            ...(draft.useCustom ? [{ answer: draft.custom, source: "custom" as const }] : []),
          ];
    const answers = entries
      .map(({ answer, source }) => ({ answer: answer.trim().replace(/\s+/gu, " "), source }))
      .filter(({ answer }) => answer);
    return answers.length ? [{ questionId: id, question, answers }] : [];
  });
}

/** Full readable export; the caller validates before submission and applies storage limits. */
export function formatQuestionnaireDetails(state: QuestionnaireState): string {
  const text = serializeQuestionnaire(state)
    .map(
      ({ question, answers }, index) =>
        `${index + 1}. ${question}\n${answers.map(({ answer }) => `• ${answer}`).join("\n")}`,
    )
    .join("\n\n");
  const ratings = QUESTIONNAIRE_RATING_QUESTIONS.flatMap(({ id, question }) => {
    const rating = state.ratings?.[id] ?? null;
    return rating === null ? [] : [`${question}\n${rating} / 100`];
  });
  return [text, ...ratings, state.age == null ? "" : `Возраст: ${state.age}`]
    .filter(Boolean)
    .join("\n\n");
}
