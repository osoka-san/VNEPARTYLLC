import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["src/lib/questionnaire.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const q = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

test("all seven questions start unanswered and every offered answer fits the five-word contract", () => {
  const state = q.createQuestionnaireState();
  assert.equal(q.QUESTIONNAIRE_QUESTIONS.length, 7);
  assert.equal(q.QUESTIONNAIRE_MAX_ANSWERS, 3);
  assert.equal(q.MAX_ANSWERS, 3);
  assert.deepEqual(q.serializeQuestionnaire(state), []);
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  assert.deepEqual(Object.values(state.ratings), [null, null, null]);
  assert.equal(state.age, null);
  for (const question of q.QUESTIONNAIRE_QUESTIONS) {
    assert.deepEqual(state.answers[question.id].selected, []);
    assert.equal(state.answers[question.id].manual, null);
    assert.deepEqual(q.getQuestionnaireValues(state, question.id), []);
    for (const option of question.options) assert.ok(q.countQuestionnaireWords(option) <= 5);
  }
});

test("all seven short answers, three ratings and age are required by default", () => {
  let state = q.createQuestionnaireState();
  const requiredIds = [
    ...q.QUESTIONNAIRE_QUESTIONS.map(({ id }) => id),
    ...q.QUESTIONNAIRE_RATING_QUESTIONS.map(({ id }) => id),
    "age",
  ].sort();
  assert.deepEqual(Object.keys(q.validateQuestionnaire(state)).sort(), requiredIds);
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});

  for (const { id, options } of q.QUESTIONNAIRE_QUESTIONS) {
    state.answers[id].selected = [options[0]];
  }
  state.ratings = { social_energy: 1, evening_pace: 100, spontaneity: 50 };
  state.age = 27;
  assert.deepEqual(q.validateQuestionnaire(state), {});

  state = q.setQuestionnaireMode(state, "manual");
  state.answers.interests.manual = ["", "  "];
  assert.deepEqual(Object.keys(q.validateQuestionnaire(state)), ["interests"]);
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  state.answers.interests.manual = ["", "Музыка", ""];
  assert.deepEqual(q.validateQuestionnaire(state), {});
});

test("numeric choices survive mode changes and keep the full 1–100 range", () => {
  let state = q.createQuestionnaireState();
  state.ratings = { social_energy: 1, evening_pace: 100, spontaneity: 73 };
  state.age = 27;
  const roundTrip = q.setQuestionnaireMode(q.setQuestionnaireMode(state, "manual"), "choices");
  assert.deepEqual(roundTrip.ratings, state.ratings);
  assert.equal(roundTrip.age, 27);
  assert.deepEqual(q.validateQuestionnaire(roundTrip, { requireAll: false }), {});
  for (const invalid of [0, 101, 1.5, NaN]) {
    state = { ...state, ratings: { ...state.ratings, social_energy: invalid } };
    assert.ok(q.validateQuestionnaire(state, { requireAll: false }).social_energy);
  }
});

test("round trips seed manual answers once and preserve independent drafts, including empty slots", () => {
  let state = q.createQuestionnaireState();
  state.answers.interests = {
    selected: ["Музыка и звук", "Идеи и технологии"],
    custom: "Ночная фотография",
    useCustom: true,
    manual: null,
  };
  state = q.setQuestionnaireMode(state, "manual");
  assert.deepEqual(state.answers.interests.manual, [
    "Музыка и звук",
    "Идеи и технологии",
    "Ночная фотография",
  ]);
  state.answers.interests.manual = ["Собираю виниловые пластинки", "", "Пишу музыку"];
  state = q.setQuestionnaireMode(state, "choices");
  assert.deepEqual(q.getQuestionnaireValues(state, "interests"), [
    "Музыка и звук",
    "Идеи и технологии",
    "Ночная фотография",
  ]);
  state.answers.interests.selected = ["Искусство и творчество"];
  state.answers.interests.custom = "Снимаю кино";
  state.answers.interests.useCustom = false;
  assert.equal(q.getQuestionnaireAnswer(state, "interests"), "Искусство и творчество");
  state = q.setQuestionnaireMode(state, "manual");
  assert.deepEqual(state.answers.interests.manual, [
    "Собираю виниловые пластинки",
    "",
    "Пишу музыку",
  ]);
  assert.deepEqual(q.getQuestionnaireValues(state, "interests"), [
    "Собираю виниловые пластинки",
    "Пишу музыку",
  ]);
  assert.deepEqual(q.serializeQuestionnaire(state)[0].answers, [
    { answer: "Собираю виниловые пластинки", source: "manual" },
    { answer: "Пишу музыку", source: "manual" },
  ]);
  state.answers.interests.manual = ["", ""];
  state = q.setQuestionnaireMode(q.setQuestionnaireMode(state, "choices"), "manual");
  assert.deepEqual(state.answers.interests.manual, ["", ""]);
  assert.equal(q.getQuestionnaireAnswer(state, "interests"), "");
  assert.deepEqual(q.serializeQuestionnaire(state), []);
  state = q.setQuestionnaireMode(state, "choices");
  assert.deepEqual(state.answers.interests.selected, ["Искусство и творчество"]);
  assert.equal(state.answers.interests.custom, "Снимаю кино");
  assert.equal(state.answers.interests.useCustom, false);
});

test("over-limit text stays editable, validation blocks it, and submission only contains the active mode", () => {
  let state = q.setQuestionnaireMode(q.createQuestionnaireState(), "manual");
  state.answers.interests.manual = ["Один два три четыре пять шесть"];
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  assert.deepEqual(state.answers.interests.manual, ["Один два три четыре пять шесть"]);
  state.answers.interests.manual = ["  Горы   и море  "];
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  assert.deepEqual(q.serializeQuestionnaire(state)[0].answers, [
    { answer: "Горы и море", source: "manual" },
  ]);
  state.answers.interests.manual = ["а".repeat(121)];
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state = q.setQuestionnaireMode(state, "choices");
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  assert.deepEqual(q.serializeQuestionnaire(state), []);
});

test("presets share the three-answer cap with custom, and an enabled empty custom cannot be submitted", () => {
  const state = q.createQuestionnaireState();
  state.answers.interests.selected = [
    "Музыка и звук",
    "Идеи и технологии",
    "Искусство и творчество",
  ];
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  assert.equal(q.serializeQuestionnaire(state)[0].answers.length, 3);

  state.answers.interests.useCustom = true;
  assert.equal(state.answers.interests.custom, "");
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state.answers.interests.selected.pop();
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  assert.deepEqual(q.serializeQuestionnaire(state)[0].answers, [
    { answer: "Музыка и звук", source: "choice" },
    { answer: "Идеи и технологии", source: "choice" },
  ]);

  state.answers.interests.custom = "Ночная фотография";
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  assert.equal(q.serializeQuestionnaire(state)[0].answers.length, 3);
});

test("a fourth preset or manual slot blocks submission validation", () => {
  let state = q.createQuestionnaireState();
  state.answers.interests.selected = [...q.QUESTIONNAIRE_QUESTIONS[0].options.slice(0, 4)];
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);

  state = q.setQuestionnaireMode(q.createQuestionnaireState(), "manual");
  state.answers.interests.manual = ["Музыка", "Кино", "Искусство", "Путешествия"];
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state.answers.interests.manual[3] = "";
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state.answers.interests.manual.pop();
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
});

test("the five-word limit applies to each answer separately, including custom", () => {
  let state = q.setQuestionnaireMode(q.createQuestionnaireState(), "manual");
  state.answers.interests.manual = [
    "Люблю музыку искусство кино путешествия",
    "Ценю открытость уважение внимание честность",
    "Ищу новые места идеи впечатления",
  ];
  for (const value of state.answers.interests.manual) {
    assert.equal(q.countQuestionnaireWords(value), 5);
  }
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  assert.equal(q.serializeQuestionnaire(state)[0].answers.length, 3);
  state.answers.interests.manual[1] += " заботу";
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);

  state = q.createQuestionnaireState();
  state.answers.interests.selected = ["Музыка и звук", "Идеи и технологии"];
  state.answers.interests.useCustom = true;
  state.answers.interests.custom = "Люблю музыку искусство кино путешествия";
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
  state.answers.interests.custom += " фотографию";
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state.answers.interests.custom = "а".repeat(121);
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
});

test("duplicate or unknown presets are invalid without affecting an independent manual draft", () => {
  let state = q.createQuestionnaireState();
  state.answers.interests.selected = ["Музыка и звук", "Музыка и звук"];
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state.answers.interests.selected = ["Неизвестный вариант"];
  assert.ok(q.validateQuestionnaire(state, { requireAll: false }).interests);
  state.answers.interests.manual = ["Личный ответ"];
  state = q.setQuestionnaireMode(state, "manual");
  assert.deepEqual(q.validateQuestionnaire(state, { requireAll: false }), {});
});

test("serialization groups mixed sources under their question and excludes inactive drafts", () => {
  const state = q.createQuestionnaireState();
  state.answers.interests = {
    selected: ["Музыка и звук", "Идеи и технологии"],
    custom: "  Ночная   фотография  ",
    useCustom: true,
    manual: ["Скрытый ручной ответ"],
  };
  state.answers.trust = {
    selected: ["Прямота в разговоре"],
    custom: "Скрытый собственный ответ",
    useCustom: false,
    manual: ["Другой скрытый ответ"],
  };
  const interestQuestion = q.QUESTIONNAIRE_QUESTIONS.find(({ id }) => id === "interests");
  const trustQuestion = q.QUESTIONNAIRE_QUESTIONS.find(({ id }) => id === "trust");
  assert.deepEqual(q.serializeQuestionnaire(state), [
    {
      questionId: "interests",
      question: interestQuestion.question,
      answers: [
        { answer: "Музыка и звук", source: "choice" },
        { answer: "Идеи и технологии", source: "choice" },
        { answer: "Ночная фотография", source: "custom" },
      ],
    },
    {
      questionId: "trust",
      question: trustQuestion.question,
      answers: [{ answer: "Прямота в разговоре", source: "choice" }],
    },
  ]);
});
