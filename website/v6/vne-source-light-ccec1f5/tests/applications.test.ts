import { describe, expect, test } from "bun:test";
import {
  TRANSITIONS,
  canTransition,
  nextStep,
  rpcMessage,
  validateApplicationInput,
} from "../src/lib/applications";
import { deliveryMode } from "../src/lib/delivery";

const ok = {
  eventId: "11111111-1111-4111-8111-111111111111",
  displayName: " Гость ",
  ageConfirmed: true,
  consent: true,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
};

describe("applications", () => {
  test("валидация: user_id/статус/цена не принимаются, обязательные поля проверяются", () => {
    expect(validateApplicationInput(ok)).toMatchObject({ ok: true, displayName: "Гость" });
    expect(validateApplicationInput({ ...ok, ageConfirmed: "true" }).ok).toBe(false);
    expect(validateApplicationInput({ ...ok, consent: false }).ok).toBe(false);
    expect(validateApplicationInput({ ...ok, eventId: "x" }).ok).toBe(false);
    expect(validateApplicationInput({ ...ok, displayName: "a".repeat(81) }).ok).toBe(false);
    const r = validateApplicationInput({
      ...ok,
      user_id: "evil",
      status: "approved",
      price: 0,
    } as typeof ok);
    expect(Object.keys(r)).not.toContain("status");
  });
  test("переходы совпадают с SQL", () => {
    expect(canTransition("submitted", "take")).toBe(true);
    expect(canTransition("approved", "reject")).toBe(false);
    expect(canTransition("withdrawn", "approve")).toBe(false);
    expect(canTransition("needs_info", "reply")).toBe(true);
    expect(TRANSITIONS.approve.to).toBe("approved");
  });
  test("следующий шаг", () => {
    expect(nextStep([])).toBe("apply");
    expect(nextStep(["under_review", "needs_info"])).toBe("reply");
    expect(nextStep(["rejected"])).toBe("none");
  });
  test("устаревшая версия даёт понятное сообщение", () => {
    expect(rpcMessage("PT409")).toContain("уже изменили");
  });
  test("доставка выключена по умолчанию", () => {
    expect(deliveryMode({})).toBe("disabled");
    expect(deliveryMode({ VNE_DELIVERY_MODE: "LIVE" })).toBe("disabled");
    expect(deliveryMode({ VNE_DELIVERY_MODE: "live" })).toBe("live");
  });
});
