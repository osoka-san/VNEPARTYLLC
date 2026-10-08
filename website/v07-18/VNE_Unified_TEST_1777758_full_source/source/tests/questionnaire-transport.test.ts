import { describe, expect, test } from "bun:test";
import { selectQuestionnaireBackend, showOwnedIntakeOnly } from "../src/lib/questionnaire-backend";
import {
  createQuestionnairePort,
  readQuestionnaireAvailability,
  type QuestionnaireRequestClient,
} from "../src/lib/questionnaire-supabase.server";
import {
  listMyMembershipQuestionnaires,
  type MembershipQuestionnaireCommand,
} from "../src/lib/questionnaire-persistence.server";

const owner = "a0000000-0000-4000-8000-000000000001";
const record = {
  requestId: "b0000000-0000-4000-8000-000000000001",
  ownerUserId: owner,
  correlationId: "c0000000-0000-4000-8000-000000000001",
  questionnaireVersion: 3,
  status: "pending",
  createdAt: "2026-10-06T12:00:00Z",
};
const configured = {
  VNE_SUPABASE_URL: "https://xrocuwlofxhxoxajukne.supabase.co",
  VNE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_only",
  VNE_SITE_URL: "https://vne.example.test",
  VNE_AUTH_ENV: "staging",
};

describe("fail-closed backend selection", () => {
  test("feature flag defaults off and invalid/production config cannot enable it", () => {
    expect(readQuestionnaireAvailability({})).toEqual({ configured: false, enabled: false });
    expect(readQuestionnaireAvailability(configured)).toEqual({ configured: true, enabled: false });
    expect(
      readQuestionnaireAvailability({ ...configured, VNE_MEMBERSHIP_QUESTIONNAIRE: "live" })
        .enabled,
    ).toBe(false);
    expect(
      readQuestionnaireAvailability({
        ...configured,
        VNE_MEMBERSHIP_QUESTIONNAIRE: "test",
        VNE_AUTH_ENV: "production",
      }).enabled,
    ).toBe(false);
    expect(readQuestionnaireAvailability({ VNE_MEMBERSHIP_QUESTIONNAIRE: "test" }).enabled).toBe(
      false,
    );
    expect(
      readQuestionnaireAvailability({ ...configured, VNE_MEMBERSHIP_QUESTIONNAIRE: "test" })
        .enabled,
    ).toBe(true);
  });
  test("D1 preview remains unchanged only when Supabase is absent", () => {
    expect(
      selectQuestionnaireBackend(
        { enabled: true, questionnaireVersion: 3 },
        { configured: false, enabled: false },
      ),
    ).toBe("preview");
    expect(
      selectQuestionnaireBackend(
        { enabled: true, questionnaireVersion: 2 },
        { configured: false, enabled: false },
      ),
    ).toBe("unavailable");
  });
  test("configured Supabase never falls through to disabled/misconfigured D1 or legacy submit", () => {
    expect(
      selectQuestionnaireBackend({ enabled: false }, { configured: true, enabled: false }),
    ).toBe("unavailable");
    expect(
      selectQuestionnaireBackend({ enabled: false }, { configured: true, enabled: true }),
    ).toBe("supabase");
    expect(
      selectQuestionnaireBackend(
        { enabled: true, questionnaireVersion: 3 },
        { configured: true, enabled: true },
      ),
    ).toBe("unavailable");
    expect(
      selectQuestionnaireBackend({ enabled: false }, { configured: false, enabled: false }),
    ).toBe("unavailable");
  });
  test("an intake read can show its own status despite legacy admission error, never event UI", () => {
    expect(showOwnedIntakeOnly("error", true)).toBe(true);
    expect(showOwnedIntakeOnly("error", false)).toBe(false);
    expect(showOwnedIntakeOnly("pending", true)).toBe(true);
    for (const state of ["signin", "preview", "unconfigured", "ok"])
      expect(showOwnedIntakeOnly(state, true)).toBe(false);
  });
});

function fixture() {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let response: unknown = [record];
  let error: { code?: string } | null = null;
  const client: QuestionnaireRequestClient = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: response, error };
    },
  };
  return {
    client,
    calls,
    response: (value: unknown) => {
      response = value;
    },
    error: () => {
      error = { code: "42501" };
    },
  };
}

describe("request-scoped RPC transport", () => {
  test("list and detail use only the named projected read wrapper", async () => {
    const f = fixture();
    const port = createQuestionnairePort(f.client);
    expect(await listMyMembershipQuestionnaires(port)).toEqual({ ok: true, items: [record] });
    expect(await port.readOwnRequest(record.requestId)).toEqual(record);
    expect(f.calls).toEqual([
      { name: "vne_read_my_membership_questionnaires", args: { _request: null } },
      { name: "vne_read_my_membership_questionnaires", args: { _request: record.requestId } },
    ]);
  });
  test("foreign or duplicate rows invalidate the whole list", async () => {
    const f = fixture();
    const port = createQuestionnairePort(f.client);
    for (const value of [
      [{ ...record, ownerUserId: "foreign" }],
      [record, record],
      [null],
      Array(51).fill(record),
    ]) {
      f.response(value);
      expect(await listMyMembershipQuestionnaires(port)).toEqual({
        ok: false,
        reason: "unavailable",
      });
    }
  });
  test("anonymous or failed Auth never reads any membership records", async () => {
    const f = fixture();
    f.client.auth.getUser = async () => ({
      data: { user: { id: owner, is_anonymous: true } },
      error: null,
    });
    expect(await listMyMembershipQuestionnaires(createQuestionnairePort(f.client))).toEqual({
      ok: false,
      reason: "signin",
    });
    f.client.auth.getUser = async () => ({
      data: { user: { id: owner } },
      error: new Error("expired"),
    });
    expect(await listMyMembershipQuestionnaires(createQuestionnairePort(f.client))).toEqual({
      ok: false,
      reason: "signin",
    });
    expect(f.calls).toHaveLength(0);
  });
  test("missing wrapper/grant fails closed, not an empty successful cabinet", async () => {
    const f = fixture();
    f.error();
    expect(await listMyMembershipQuestionnaires(createQuestionnairePort(f.client))).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
  test("port does not add user IDs or change canonical payload on submit", async () => {
    const f = fixture();
    const command = {
      idempotencyKey: "synthetic",
      questionnaire: { version: 3 },
    } as MembershipQuestionnaireCommand;
    f.response({ ok: true, receipt: record, outcome: "created" });
    expect(await createQuestionnairePort(f.client).submitAtomic(command)).toEqual({
      ok: true,
      receipt: record,
      outcome: "created",
    });
    expect(f.calls).toEqual([
      { name: "vne_submit_membership_questionnaire", args: { _command: command } },
    ]);
  });
  test("malformed replies and unavailable transport never report success", async () => {
    const f = fixture();
    const port = createQuestionnairePort(f.client);
    const command = {} as MembershipQuestionnaireCommand;
    for (const value of [
      null,
      true,
      [],
      { ok: true },
      { ok: true, receipt: record, outcome: "updated" },
    ]) {
      f.response(value);
      expect(await port.submitAtomic(command)).toEqual({ ok: false, reason: "unavailable" });
    }
    f.response({ ok: false, reason: "conflict" });
    expect(await port.submitAtomic(command)).toEqual({ ok: false, reason: "conflict" });
  });
});
