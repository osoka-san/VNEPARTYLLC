import { describe, expect, test } from "bun:test";
import { QUESTIONNAIRE_QUESTIONS } from "../src/lib/questionnaire";
import {
  readMyMembershipQuestionnaireDraft,
  submitMembershipQuestionnaireDraft,
  type MembershipQuestionnaireCommand,
  type MembershipQuestionnairePort,
  type MembershipQuestionnaireReceipt,
} from "../src/lib/questionnaire-persistence.server";

const owner = "a0000000-0000-4000-8000-000000000001";
const other = "a0000000-0000-4000-8000-000000000002";
const requestId = "b0000000-0000-4000-8000-000000000001";
const correlationId = "c0000000-0000-4000-8000-000000000001";
const idempotencyKey = "d0000000-0000-4000-8000-000000000001";
function input() {
  return {
    idempotencyKey,
    name: "Synthetic Guest",
    email: "synthetic@example.invalid",
    telegram: "synthetic_guest",
    consent: true,
    questionnaireVersion: 3,
    questionnaire: QUESTIONNAIRE_QUESTIONS.map(({ id, options }) => ({
      questionId: id,
      answers: [{ answer: options[0] as string, source: "choice" }],
    })),
    ratings: { social_energy: 1, evening_pace: 50, spontaneity: 100 },
    age: 27,
  };
}
function receipt(): MembershipQuestionnaireReceipt {
  return {
    requestId,
    ownerUserId: owner,
    correlationId,
    questionnaireVersion: 3,
    status: "pending",
    createdAt: "2026-10-06T12:00:00Z",
  };
}
function fixture() {
  const commands: MembershipQuestionnaireCommand[] = [];
  const reads: string[] = [];
  const port: MembershipQuestionnairePort = {
    getVerifiedUser: async () => ({ id: owner }),
    submitAtomic: async (command) => {
      commands.push(command);
      return { ok: true, receipt: receipt(), outcome: "created" };
    },
    readOwnRequest: async (id) => {
      reads.push(id);
      return receipt();
    },
  };
  return { port, commands, reads };
}

describe("unwired membership questionnaire adapter", () => {
  test("missing transport fails closed for write and read", async () => {
    expect(await submitMembershipQuestionnaireDraft(input())).toEqual({
      ok: false,
      reason: "unconfigured",
    });
    expect(await readMyMembershipQuestionnaireDraft(requestId)).toEqual({
      ok: false,
      reason: "unconfigured",
    });
  });
  test("verified identity is mandatory; unauthenticated requests never touch persistence", async () => {
    const { port, commands, reads } = fixture();
    port.getVerifiedUser = async () => null;
    expect(await submitMembershipQuestionnaireDraft(input(), port)).toEqual({
      ok: false,
      reason: "signin",
    });
    expect(await readMyMembershipQuestionnaireDraft(requestId, port)).toEqual({
      ok: false,
      reason: "signin",
    });
    expect(commands).toHaveLength(0);
    expect(reads).toHaveLength(0);
  });
  test("atomic command carries full normalized questionnaire, existing intake and consent", async () => {
    const { port, commands } = fixture();
    const result = await submitMembershipQuestionnaireDraft(input(), port);
    expect(result).toEqual({ ok: true, receipt: receipt(), outcome: "created" });
    expect(commands).toHaveLength(1);
    expect(commands[0].questionnaire.questions).toHaveLength(7);
    expect(commands[0].questionnaire.ratings).toHaveLength(3);
    expect(commands[0].questionnaire.age).toBe(27);
    expect(commands[0].consentVersion).toBe("draft-2026-09");
    expect(Object.keys(commands[0]).sort()).toEqual([
      "consentVersion",
      "idempotencyKey",
      "intake",
      "questionnaire",
    ]);
    expect(JSON.stringify(commands[0])).not.toContain(owner);
  });
  test("read uses the same membership request ID and returns status without granting admission", async () => {
    const { port, reads } = fixture();
    expect(await readMyMembershipQuestionnaireDraft(requestId, port)).toEqual({
      ok: true,
      receipt: receipt(),
    });
    expect(reads).toEqual([requestId]);
  });
  test("foreign owner responses are rejected for both operations", async () => {
    const { port } = fixture();
    port.submitAtomic = async () => ({
      ok: true,
      receipt: { ...receipt(), ownerUserId: other },
      outcome: "created",
    });
    port.readOwnRequest = async () => ({ ...receipt(), ownerUserId: other });
    expect(await submitMembershipQuestionnaireDraft(input(), port)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await readMyMembershipQuestionnaireDraft(requestId, port)).toEqual({
      ok: false,
      reason: "notfound",
    });
  });
  test("a different request ID in a read response is not disclosed", async () => {
    const { port } = fixture();
    port.readOwnRequest = async () => ({ ...receipt(), requestId: other });
    expect(await readMyMembershipQuestionnaireDraft(requestId, port)).toEqual({
      ok: false,
      reason: "notfound",
    });
  });
  for (const key of ["ownerUserId", "role", "status", "requestId", "correlationId"]) {
    test(`rejects client-supplied ${key}`, async () => {
      const { port, commands } = fixture();
      expect(await submitMembershipQuestionnaireDraft({ ...input(), [key]: other }, port)).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(commands).toHaveLength(0);
    });
  }
  for (const consent of [false, "true", 1, null, undefined]) {
    test(`requires explicit consent: ${JSON.stringify(consent)}`, async () => {
      const { port, commands } = fixture();
      expect(await submitMembershipQuestionnaireDraft({ ...input(), consent }, port)).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(commands).toHaveLength(0);
    });
  }
  test("invalid questionnaire or operation key never reaches persistence", async () => {
    const { port, commands } = fixture();
    for (const data of [
      { ...input(), age: 101 },
      { ...input(), questionnaire: [] },
      { ...input(), idempotencyKey: "not-uuid" },
    ]) {
      expect(await submitMembershipQuestionnaireDraft(data, port)).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(commands).toHaveLength(0);
  });
  test("canonical retries submit identical commands; adapter preserves replay receipt", async () => {
    const { port, commands } = fixture();
    const original = port.submitAtomic;
    await submitMembershipQuestionnaireDraft(input(), port);
    port.submitAtomic = async (command) => {
      const res = await original(command);
      return res.ok ? { ...res, outcome: "replay" } : res;
    };
    const retry = input();
    retry.questionnaire.reverse();
    retry.name = " Synthetic Guest ";
    expect(await submitMembershipQuestionnaireDraft(retry, port)).toEqual({
      ok: true,
      receipt: receipt(),
      outcome: "replay",
    });
    expect(commands[1]).toEqual(commands[0]);
  });
  test("conflicting retry from transaction is surfaced, never converted to success", async () => {
    const { port } = fixture();
    port.submitAtomic = async () => ({ ok: false, reason: "conflict" });
    expect(await submitMembershipQuestionnaireDraft(input(), port)).toEqual({
      ok: false,
      reason: "conflict",
    });
  });
  test("transport failure fails closed without exposing exception details", async () => {
    const { port } = fixture();
    port.submitAtomic = async () => {
      throw new Error("SECRET RAW ANSWERS");
    };
    port.readOwnRequest = async () => {
      throw new Error("SECRET RAW ANSWERS");
    };
    expect(await submitMembershipQuestionnaireDraft(input(), port)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await readMyMembershipQuestionnaireDraft(requestId, port)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
  test("transport extras are omitted from returned receipt", async () => {
    const { port } = fixture();
    port.submitAtomic = async () => ({
      ok: true,
      receipt: { ...receipt(), internalNotes: "private" },
      outcome: "created",
    });
    port.readOwnRequest = async () => ({ ...receipt(), internalNotes: "private" });
    expect(await submitMembershipQuestionnaireDraft(input(), port)).toEqual({
      ok: true,
      receipt: receipt(),
      outcome: "created",
    });
    expect(await readMyMembershipQuestionnaireDraft(requestId, port)).toEqual({
      ok: true,
      receipt: receipt(),
    });
  });
});
