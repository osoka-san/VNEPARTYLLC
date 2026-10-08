import { describe, expect, test } from "bun:test";
import { QUESTIONNAIRE_QUESTIONS } from "../src/lib/questionnaire";
import { parseQuestionnaireSubmission } from "../src/lib/questionnaire-submission";
import { parseQuestionnaireSnapshot } from "../src/lib/questionnaire-contract";

function complete() {
  return {
    questionnaireVersion: 3,
    questionnaire: QUESTIONNAIRE_QUESTIONS.map(({ id, options }) => ({
      questionId: id,
      question: "Untrusted client label",
      answers: [{ answer: options[0] as string, source: "choice" }],
    })),
    ratings: { social_energy: 1, evening_pace: 100, spontaneity: 57 },
    age: 27,
  };
}

describe("structured questionnaire contract", () => {
  test("retains all seven texts, three numeric answers, age, sources and version", () => {
    const input = complete();
    input.questionnaire[0].answers.push(
      { answer: "  Ночная   фотография  ", source: "custom" },
      { answer: "Изучаю искусство", source: "manual" },
    );
    const result = parseQuestionnaireSnapshot(input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("fixture rejected");
    expect(result.snapshot.version).toBe(3);
    expect(result.snapshot.questions).toHaveLength(7);
    expect(result.snapshot.ratings.map(({ value }) => value)).toEqual([1, 100, 57]);
    expect(result.snapshot.age).toBe(27);
    expect(result.snapshot.questions[0].answers).toEqual([
      { text: "Музыка и звук", source: "choice" },
      { text: "Ночная фотография", source: "custom" },
      { text: "Изучаю искусство", source: "manual" },
    ]);
    expect(JSON.stringify(result.snapshot)).not.toContain("Untrusted client label");
    expect(result.snapshot.questions[0].label).toBe(QUESTIONNAIRE_QUESTIONS[0].question);
    expect(result.snapshot.ratings[0].minLabel).toBe("Больше времени для себя");
  });

  test("canonical question ordering and normalized whitespace yield stable serialization", () => {
    const input = complete();
    const expected = parseQuestionnaireSnapshot(input);
    input.questionnaire.reverse();
    input.questionnaire[0].answers[0].answer = ` ${input.questionnaire[0].answers[0].answer} `;
    expect(parseQuestionnaireSnapshot(input)).toEqual(expected);
  });

  test("snapshot is independent of later client draft mutations", () => {
    const input = complete();
    const result = parseQuestionnaireSnapshot(input);
    const before = JSON.stringify(result);
    input.questionnaire[0].answers[0].answer = "Changed draft";
    input.ratings.social_energy = 90;
    input.age = 40;
    expect(JSON.stringify(result)).toBe(before);
  });

  const mutations: [string, (input: ReturnType<typeof complete>) => unknown][] = [
    [
      "four answers including custom",
      (v) =>
        v.questionnaire[0].answers.push(
          ...QUESTIONNAIRE_QUESTIONS[0].options
            .slice(1, 3)
            .map((answer) => ({ answer, source: "choice" })),
          { answer: "Фотография", source: "custom" },
        ),
    ],
    [
      "two custom answers",
      (v) =>
        v.questionnaire[0].answers.push(
          { answer: "Фото", source: "custom" },
          { answer: "Кино", source: "custom" },
        ),
    ],
    ["duplicate choices", (v) => v.questionnaire[0].answers.push(v.questionnaire[0].answers[0])],
    [
      "unknown choice",
      (v) => {
        v.questionnaire[0].answers[0].answer = "Unknown";
      },
    ],
    [
      "unknown source",
      (v) => {
        v.questionnaire[0].answers[0].source = "inferred";
      },
    ],
    [
      "empty answer",
      (v) => {
        v.questionnaire[0].answers[0] = { answer: "  ", source: "custom" };
      },
    ],
    [
      "six words",
      (v) => {
        v.questionnaire[0].answers[0] = { answer: "a b c d e f", source: "manual" };
      },
    ],
    [
      "121 characters",
      (v) => {
        v.questionnaire[0].answers[0] = { answer: "a".repeat(121), source: "manual" };
      },
    ],
    [
      "control characters",
      (v) => {
        v.questionnaire[0].answers[0] = { answer: "a\nb", source: "manual" };
      },
    ],
    ["missing question", (v) => v.questionnaire.pop()],
    [
      "duplicate question",
      (v) => {
        v.questionnaire[1] = v.questionnaire[0];
      },
    ],
    [
      "missing rating",
      (v) => {
        Reflect.deleteProperty(v.ratings, "social_energy");
      },
    ],
    ["unknown rating", (v) => Object.assign(v.ratings, { score: 75 })],
    [
      "fractional rating",
      (v) => {
        v.ratings.spontaneity = 1.5;
      },
    ],
    [
      "rating zero",
      (v) => {
        v.ratings.spontaneity = 0;
      },
    ],
    [
      "rating over 100",
      (v) => {
        v.ratings.spontaneity = 101;
      },
    ],
    [
      "NaN rating",
      (v) => {
        v.ratings.spontaneity = NaN;
      },
    ],
    [
      "age zero",
      (v) => {
        v.age = 0;
      },
    ],
    [
      "age over 100",
      (v) => {
        v.age = 101;
      },
    ],
    [
      "fractional age",
      (v) => {
        v.age = 27.5;
      },
    ],
    [
      "unsupported version",
      (v) => {
        v.questionnaireVersion = 4;
      },
    ],
    ["absent version", (v) => Reflect.deleteProperty(v, "questionnaireVersion")],
    ["foreign owner", (v) => Object.assign(v, { userId: "someone-else" })],
    ["role escalation", (v) => Object.assign(v, { role: "owner" })],
    ["status escalation", (v) => Object.assign(v, { status: "approved" })],
    [
      "hidden answer properties",
      (v) => Object.assign(v.questionnaire[0].answers[0], { score: 100 }),
    ],
  ];
  for (const [name, mutate] of mutations) {
    test(`rejects ${name}`, () => {
      const input = complete();
      mutate(input);
      expect(parseQuestionnaireSnapshot(input)).toEqual({ ok: false });
    });
  }

  for (const input of [null, undefined, [], "", 3, {}, { questionnaireVersion: "3" }]) {
    test(`rejects malformed envelope ${JSON.stringify(input)}`, () => {
      expect(parseQuestionnaireSnapshot(input)).toEqual({ ok: false });
    });
  }
  test("does not reinterpret existing age bounds as event admission", () => {
    const input = complete();
    for (const age of [1, 18, 100]) {
      input.age = age;
      expect(parseQuestionnaireSnapshot(input).ok).toBe(true);
    }
  });
  test("legacy optional parser behavior is unchanged", () => {
    expect(parseQuestionnaireSubmission(undefined)).toEqual({ ok: true, details: null });
    expect(parseQuestionnaireSubmission([], {}, null)).toEqual({ ok: true, details: "" });
    const legacy = [{ questionId: "interests", answer: "Музыка и звук", source: "choice" }];
    expect(parseQuestionnaireSubmission(legacy).ok).toBe(true);
    expect(parseQuestionnaireSnapshot({ ...complete(), questionnaire: legacy }).ok).toBe(false);
  });
});
