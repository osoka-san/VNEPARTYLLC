/** Bounded TEST orchestration. Constructor/render are inert. This never certifies DB concurrency. */
import type { AdmissionCommandInput, AdmissionCommandResult, AdmissionReceipt } from "./contract";
export const QA_ACTORS = [
  "1e7259c2-ad13-43a1-b34b-cba71533e844",
  "ed2433cb-bc6e-4b23-aa57-000839292ec4",
] as const;
export const QA_EVENT = "d0700000-0000-4000-8000-000000000001";
export const QA_PART = "d0700000-0000-4000-8000-000000000006";
export const QA_PASS = "d0700000-0000-4000-8000-000000000010";
/** Deliberately public fixture, zero entropy. Not genuine secure issuance. */
export const QA_PUBLIC_TOKEN = "VNE2:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
export const QA_BOUNDS = {
  posts: 10,
  // QA clock sampling only: live authenticated transport is routinely above 250 ms.
  // Actual concurrency still requires independently observed PostgreSQL overlap.
  rtt: 1500,
  uncertainty: 751,
  identity: 15000,
  clock: 30000,
  tickGap: 200,
  lateness: 100,
  wallStep: 25,
  response: 4000,
  maxArmLead: 10000,
  minPlanLead: 30000,
  maxPlanLead: 120000,
  prepareLead: 10000,
} as const;
// Race-only budget: bounded initial MFA + one slow and two good clock probes,
// then the unchanged final preparation stage, clock uncertainty and two late ticks.
// Round up to a whole second; do not extend identity, arm or response lifetimes.
export const QA_RACE_PREPARE_LEAD_MS =
  Math.ceil(
    (QA_BOUNDS.prepareLead +
      2 * QA_BOUNDS.response +
      2 * QA_BOUNDS.rtt +
      QA_BOUNDS.uncertainty +
      2 * QA_BOUNDS.lateness) /
      1000,
  ) * 1000;
export type QaPreparationTimings = Readonly<{
  calibrationMs: number | null;
  finalMfaMs: number | null;
  readyMs: number | null;
}>;
const emptyPreparationTimings = (): QaPreparationTimings =>
  Object.freeze({
    calibrationMs: null,
    finalMfaMs: null,
    readyMs: null,
  });
export type QaReceipt = AdmissionReceipt & { replayed: boolean };
export type QaConfig = { runId: string; actorId: string; windowStart: string };
export type QaBudget = { used: number; invalidated: boolean };
export type QaSessionReason =
  | "ready"
  | "unconfigured"
  | "forbidden"
  | "unavailable"
  | "wrong_account"
  | "factor_required"
  | "challenge_required"
  | "environment_changed"
  | "response_timeout";
export type QaSessionReadiness = {
  phase: "unchecked" | "checking" | "ready" | "blocked";
  reason: QaSessionReason | null;
  selectedActorId: string | null;
  userId: string | null;
  aal2: boolean | null;
  hasVerifiedTotp: boolean | null;
};
function emptyReadiness(): QaSessionReadiness {
  return {
    phase: "unchecked",
    reason: null,
    selectedActorId: null,
    userId: null,
    aal2: null,
    hasVerifiedTotp: null,
  };
}
export interface QaPort {
  wall(): number;
  mono(): number;
  visible(): boolean;
  online(): boolean;
  timeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
  interval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
  mfa(): Promise<unknown>;
  command(value: AdmissionCommandInput): Promise<AdmissionCommandResult>;
}
export type QaClockSample = {
  attempt: number;
  rttMs: number | null;
  wallDeltaMs: number | null;
  quality: "good" | "slow" | "fatal";
  reason: string | null;
  intervalLowerMs: number | null;
  intervalUpperMs: number | null;
};
type QaPlan = Readonly<{
  config: Readonly<QaConfig>;
  action: "verify" | "checkin";
  target: string;
  operationId: string | null;
  wallAt: number;
  monoAt: number;
  prepareAt: number;
}>;
export type QaSnapshot = {
  phase: string;
  message: string;
  posts: number;
  runId: string | null;
  actorId: string | null;
  windowStart: string | null;
  target: string | null;
  dispatchAt: string | null;
  receipt: QaReceipt | null;
  rehearsalReceipt: QaReceipt | null;
  rehearsalTarget: string | null;
  rehearsalDispatchAt: string | null;
  preparationTimings: QaPreparationTimings;
  offsetMs: number | null;
  uncertaintyMs: number | null;
  sessionReadiness: QaSessionReadiness;
  plannedAction: "verify" | "checkin" | null;
  operationId: string | null;
  countdownMs: number | null;
  preparationAt: string | null;
  clockSamples: readonly QaClockSample[];
};
const budgets = new WeakMap<object, QaBudget>();
export function pageQaBudget(page: object) {
  let b = budgets.get(page);
  if (!b) {
    b = { used: 0, invalidated: false };
    budgets.set(page, b);
  }
  return b;
}
const uuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
export function canonicalUtc(s: string) {
  const n = Date.parse(s);
  if (!Number.isFinite(n) || new Date(n).toISOString() !== s)
    throw new Error("canonical_UTC_required");
  return n;
}
function receipt(r: AdmissionCommandResult): QaReceipt {
  if (
    !r.ok ||
    !object(r.receipt) ||
    r.qrText ||
    typeof r.replayed !== "boolean" ||
    !keys(r.receipt, [
      "operationId",
      "correlationId",
      "action",
      "outcome",
      "eventId",
      "participationId",
      "passId",
      "generation",
      "version",
      "actorId",
      "at",
      "simulated",
      "reentryAllowed",
    ]) ||
    typeof r.receipt.correlationId !== "string" ||
    !uuid(r.receipt.correlationId) ||
    typeof r.receipt.at !== "string"
  )
    throw new Error("invalid_response");
  return Object.freeze({ ...r.receipt, replayed: r.replayed });
}
export function equalReceipt(a: QaReceipt, b: QaReceipt) {
  const keys = Object.keys(a).sort();
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => a[k as keyof QaReceipt] === b[k as keyof QaReceipt])
  );
}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function keys(v: Record<string, unknown>, expected: string[]) {
  return Object.keys(v).length === expected.length && expected.every((k) => k in v);
}
/** Project only safe fields from the live GET; never retain factor IDs or raw failures. */
function sessionReadiness(value: unknown, actorId: string): QaSessionReadiness {
  const result: QaSessionReadiness = {
    ...emptyReadiness(),
    phase: "blocked",
    reason: "unavailable",
    selectedActorId: actorId,
  };
  if (!object(value)) return result;
  if (value["ok"] === false) {
    if (value["reason"] === "unconfigured" || value["reason"] === "forbidden")
      result.reason = value["reason"];
    return result;
  }
  if (
    value["ok"] !== true ||
    typeof value["userId"] !== "string" ||
    !uuid(value["userId"]) ||
    typeof value["aal2"] !== "boolean" ||
    typeof value["hasVerifiedTotp"] !== "boolean"
  )
    return result;
  result.userId = value["userId"];
  result.aal2 = value["aal2"];
  result.hasVerifiedTotp = value["hasVerifiedTotp"];
  result.reason =
    result.userId !== actorId
      ? "wrong_account"
      : !result.hasVerifiedTotp
        ? "factor_required"
        : !result.aal2
          ? "challenge_required"
          : "ready";
  if (result.reason === "ready") result.phase = "ready";
  return result;
}
export class TimedQaSession {
  private state: QaSnapshot = {
    phase: "idle",
    message: "Тест не запущен",
    posts: 0,
    runId: null,
    actorId: null,
    windowStart: null,
    target: null,
    dispatchAt: null,
    receipt: null,
    rehearsalReceipt: null,
    rehearsalTarget: null,
    rehearsalDispatchAt: null,
    preparationTimings: emptyPreparationTimings(),
    offsetMs: null,
    uncertaintyMs: null,
    sessionReadiness: emptyReadiness(),
    plannedAction: null,
    operationId: null,
    countdownMs: null,
    preparationAt: null,
    clockSamples: [],
  };
  private listeners = new Set<() => void>();
  private config: QaConfig | null = null;
  private revision = 0;
  private readinessRevision = 0;
  private timer: unknown;
  private identityAt = -Infinity;
  private clockAt = -Infinity;
  private wallAt = 0;
  private monoAt = 0;
  private lastTick = 0;
  private theta = 0;
  private plan: QaPlan | null = null;
  private uncertainty = Infinity;
  private rehearsal: QaReceipt | null = null;
  private rehearsalTarget: string | null = null;
  private rehearsalDispatch: string | null = null;
  private rehearsalUncertainty: number | null = null;
  private reconciled = false;
  private ready = false;
  private sent: AdmissionCommandInput | null = null;
  private replayed = false;
  private replayDispatched = false;
  private pendingSample: {
    epoch: number;
    mono: number;
    wall: number;
    attempt: number;
    prior: QaClockSample[];
  } | null = null;
  private recalibrated = false;
  private busy = false;
  constructor(
    private port: QaPort,
    private budget: QaBudget,
  ) {
    this.state = { ...this.state, posts: budget.used };
    if (budget.invalidated) {
      this.state.phase = "cancelled";
      this.state.message = "environment_changed";
    }
  }
  snapshot = () => this.state;
  subscribe = (f: () => void) => {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  };
  private update(p: Partial<QaSnapshot>) {
    this.state = Object.freeze({ ...this.state, ...p, posts: this.budget.used });
    for (const f of this.listeners) f();
  }
  private stopTimer() {
    if (this.timer !== undefined) {
      this.port.clearInterval(this.timer);
      this.timer = undefined;
    }
  }
  private safe() {
    if (this.budget.invalidated || !this.port.visible() || !this.port.online())
      throw new Error("environment_changed");
  }
  private now() {
    return this.port.mono() + this.theta;
  }
  private freshness() {
    this.safe();
    const n = this.port.mono();
    if (
      !Number.isFinite(n) ||
      !Number.isFinite(this.port.wall()) ||
      n < this.identityAt ||
      n < this.clockAt
    )
      throw new Error("clock_quality_failed");
    if (n - this.identityAt > QA_BOUNDS.identity || n - this.clockAt > QA_BOUNDS.clock)
      throw new Error("freshness_expired");
    if (Math.abs(this.port.wall() - this.wallAt - (n - this.monoAt)) > QA_BOUNDS.wallStep)
      throw new Error("clock_step");
    if (
      !this.config ||
      this.now() < canonicalUtc(this.config.windowStart) ||
      this.now() >= canonicalUtc(this.config.windowStart) + 1200000
    )
      throw new Error("outside_window");
  }
  invalidateSession(reason?: "environment_changed") {
    this.readinessRevision++;
    this.update({
      sessionReadiness: {
        ...emptyReadiness(),
        ...(reason && this.state.sessionReadiness.phase !== "unchecked"
          ? { phase: "blocked" as const, reason }
          : {}),
      },
    });
  }
  canCheckSession() {
    return (
      ["idle", "cancelled"].includes(this.state.phase) &&
      this.budget.used === 0 &&
      !this.busy &&
      !this.sent &&
      this.timer === undefined &&
      this.state.sessionReadiness.phase !== "checking"
    );
  }
  private async readMfa() {
    try {
      return await this.port.mfa();
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
  /** Read-only, independent of run configuration, QR budget and calibration freshness. */
  async checkSession(actorId: string) {
    if (!this.canCheckSession()) return;
    if (!QA_ACTORS.includes(actorId as (typeof QA_ACTORS)[number]))
      throw new Error("invalid_run_identity");
    const epoch = ++this.readinessRevision;
    const current = () => {
      if (epoch !== this.readinessRevision) throw new Error("stale_response");
      if (!this.port.visible() || !this.port.online()) throw new Error("environment_changed");
    };
    this.update({
      sessionReadiness: { ...emptyReadiness(), phase: "checking", selectedActorId: actorId },
    });
    try {
      const value = await this.bounded(() => this.readMfa(), epoch, current);
      current();
      this.update({ sessionReadiness: sessionReadiness(value, actorId) });
    } catch (error) {
      if (epoch !== this.readinessRevision) return;
      const reason =
        error instanceof Error &&
        (error.message === "response_timeout" || error.message === "environment_changed")
          ? error.message
          : "unavailable";
      this.update({
        sessionReadiness: {
          ...emptyReadiness(),
          phase: "blocked",
          selectedActorId: actorId,
          reason,
        },
      });
    }
  }
  /** Browsing away before an attempt starts must not consume or invalidate it. */
  environmentChanged(reason = "environment_changed") {
    this.invalidateSession("environment_changed");
    if (this.state.phase === "idle" && this.budget.used === 0 && !this.busy && !this.sent) return;
    this.cancel(reason);
  }
  canResetBeforeDispatch() {
    return (
      this.state.phase === "cancelled" &&
      this.budget.used === 0 &&
      this.sent === null &&
      this.timer === undefined &&
      !this.busy
    );
  }
  /** Explicit recovery is allowed only before the first QR POST. Never resets the budget. */
  resetBeforeDispatch() {
    if (!this.canResetBeforeDispatch()) throw new Error("reset_not_available");
    if (!this.port.visible() || !this.port.online()) throw new Error("environment_changed");
    this.revision++;
    this.invalidateSession();
    this.budget.invalidated = false;
    this.config = null;
    this.identityAt = this.clockAt = -Infinity;
    this.wallAt = this.monoAt = this.lastTick = this.theta = 0;
    this.plan = null;
    this.uncertainty = Infinity;
    this.rehearsal = null;
    this.rehearsalTarget = this.rehearsalDispatch = null;
    this.rehearsalUncertainty = null;
    this.reconciled =
      this.ready =
      this.replayed =
      this.recalibrated =
      this.replayDispatched =
        false;
    this.pendingSample = null;
    this.update({
      phase: "idle",
      message: "Форма восстановлена. Проверьте данные и заново выполните калибровку.",
      runId: null,
      actorId: null,
      windowStart: null,
      target: null,
      dispatchAt: null,
      receipt: null,
      rehearsalReceipt: null,
      rehearsalTarget: null,
      rehearsalDispatchAt: null,
      preparationTimings: emptyPreparationTimings(),
      offsetMs: null,
      uncertaintyMs: null,
      plannedAction: null,
      operationId: null,
      countdownMs: null,
      preparationAt: null,
      clockSamples: [],
    });
  }
  cancel(reason = "environment_changed") {
    const replayBeforePost = this.replayed && !this.replayDispatched;
    const original = this.state.receipt;
    const pendingSample = this.pendingSample;
    let clockSamples = this.state.clockSamples;
    if (pendingSample?.epoch === this.revision) {
      const rtt = this.port.mono() - pendingSample.mono;
      const delta = this.port.wall() - pendingSample.wall - rtt;
      clockSamples = Object.freeze([
        ...pendingSample.prior,
        Object.freeze({
          attempt: pendingSample.attempt,
          rttMs: Number.isFinite(rtt) ? rtt : null,
          wallDeltaMs: Number.isFinite(delta) ? delta : null,
          quality: "fatal" as const,
          reason: "environment_changed",
          intervalLowerMs: null,
          intervalUpperMs: null,
        }),
      ]);
    }
    this.pendingSample = null;
    this.invalidateSession();
    this.stopTimer();
    this.plan = null;
    this.revision++;
    this.budget.invalidated = true;
    this.busy = false;
    this.ready = false;
    this.update({
      phase: replayBeforePost ? "replay_blocked" : this.sent ? "uncertain" : "cancelled",
      message: replayBeforePost
        ? reason
        : this.sent
          ? "Результат после отправки неизвестен. Нужна сверка точной операции."
          : reason,
      receipt: replayBeforePost ? original : null,
      clockSamples,
      countdownMs: null,
    });
  }
  private current(epoch: number) {
    if (this.revision !== epoch || this.budget.invalidated) throw new Error("stale_response");
    this.safe();
  }
  private async bounded<T>(
    fn: (checkDeadline: () => void) => Promise<T>,
    epoch: number,
    current = () => this.current(epoch),
  ): Promise<T> {
    const startedAt = this.port.mono();
    const checkDeadline = () => {
      const elapsed = this.port.mono() - startedAt;
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= QA_BOUNDS.response)
        throw new Error("response_timeout");
    };
    let handle: unknown;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          current();
          checkDeadline();
          return fn(checkDeadline);
        }),
        new Promise<never>((_, reject) => {
          handle = this.port.timeout(
            () => reject(new Error("response_timeout")),
            QA_BOUNDS.response,
          );
        }),
      ]).then((v) => {
        checkDeadline();
        current();
        return v;
      });
    } finally {
      if (handle !== undefined) this.port.clearTimeout(handle);
    }
  }
  private async post(
    c: AdmissionCommandInput,
    epoch: number,
    beforeDispatch?: () => void,
    onDispatch?: () => void,
  ) {
    this.current(epoch);
    const result = await this.bounded((checkDeadline) => {
      beforeDispatch?.();
      this.current(epoch);
      checkDeadline();
      if (this.budget.used >= QA_BOUNDS.posts) throw new Error("budget_exhausted");
      onDispatch?.();
      this.budget.used++;
      try {
        return this.port.command(c);
      } finally {
        this.update({});
      }
    }, epoch);
    this.current(epoch);
    return receipt(result);
  }
  private checkActor(r: QaReceipt) {
    if (
      !this.config ||
      r.actorId !== this.config.actorId ||
      r.eventId !== QA_EVENT ||
      r.simulated !== true ||
      r.reentryAllowed !== false
    )
      throw new Error("actor_or_scope_mismatch");
  }
  private validateConfig(config: QaConfig) {
    if (!uuid(config.runId) || !QA_ACTORS.includes(config.actorId as (typeof QA_ACTORS)[number]))
      throw new Error("invalid_run_identity");
    canonicalUtc(config.windowStart);
  }
  private sameConfig(config: QaConfig) {
    return (
      this.config?.runId === config.runId &&
      this.config.actorId === config.actorId &&
      this.config.windowStart === config.windowStart
    );
  }
  private safeReason(error: unknown) {
    const known = new Set([
      "session_unconfigured",
      "session_forbidden",
      "session_unavailable",
      "session_wrong_account",
      "session_factor_required",
      "session_challenge_required",
      "invalid_response",
      "actor_or_scope_mismatch",
      "clock_quality_failed",
      "uncertainty_exceeded",
      "unstable_clock",
      "insufficient_good_samples",
      "invalid_server_time",
      "unexpected_probe",
      "response_timeout",
      "environment_changed",
      "freshness_expired",
      "clock_step",
      "outside_window",
      "budget_exhausted",
      "target_outside_bound",
      "preparation_late",
      "insufficient_preparation_time",
      "insufficient_identity_budget",
      "timer_throttled",
      "late_dispatch",
      "fixture_not_fresh",
    ]);
    return error instanceof Error && known.has(error.message)
      ? error.message
      : "preparation_failed";
  }
  canPrepareRace() {
    return (
      this.state.phase === "rehearsal_done" &&
      this.reconciled &&
      !this.recalibrated &&
      !this.plan &&
      !this.busy &&
      !this.budget.invalidated
    );
  }
  prepareRehearsal(config: QaConfig, target: string) {
    if (this.plan || this.timer !== undefined || this.busy) throw new Error("already_armed");
    if (this.state.phase !== "idle" || this.config || this.budget.used !== 0)
      throw new Error("rehearsal_not_ready");
    this.prepare(config, target, "verify", null);
  }
  prepareRace(config: QaConfig, target: string, operationId: string) {
    if (this.plan || this.timer !== undefined || this.busy) throw new Error("already_armed");
    if (!this.canPrepareRace() || !this.sameConfig(config) || !uuid(operationId))
      throw new Error("race_not_ready");
    this.prepare(config, target, "checkin", operationId);
  }
  private prepare(
    config: QaConfig,
    target: string,
    action: "verify" | "checkin",
    operationId: string | null,
  ) {
    this.safe();
    this.validateConfig(config);
    const t = canonicalUtc(target),
      wall = this.port.wall(),
      mono = this.port.mono();
    const lead = t - wall,
      start = canonicalUtc(config.windowStart),
      prepareLead = action === "checkin" ? QA_RACE_PREPARE_LEAD_MS : QA_BOUNDS.prepareLead;
    if (
      !Number.isFinite(wall) ||
      !Number.isFinite(mono) ||
      lead < QA_BOUNDS.minPlanLead ||
      lead > QA_BOUNDS.maxPlanLead ||
      t - prepareLead < start ||
      t + QA_BOUNDS.response >= start + 1200000
    )
      throw new Error("target_outside_bound");
    if (this.state.sessionReadiness.phase === "checking") this.invalidateSession();
    const plan: QaPlan = Object.freeze({
      config: Object.freeze({ ...config }),
      action,
      target,
      operationId,
      wallAt: wall,
      monoAt: mono,
      prepareAt: mono + lead - prepareLead,
    });
    this.plan = plan;
    const epoch = ++this.revision;
    this.lastTick = mono;
    this.update({
      phase: action === "verify" ? "rehearsal_waiting" : "race_waiting",
      runId: config.runId,
      actorId: config.actorId,
      windowStart: config.windowStart,
      target,
      plannedAction: action,
      operationId,
      countdownMs: lead,
      preparationAt: new Date(t - prepareLead).toISOString(),
      dispatchAt: null,
      receipt: null,
      preparationTimings: emptyPreparationTimings(),
      clockSamples: [],
      message: "План зафиксирован. Перед целью автоматически проверим сессию и время PostgreSQL.",
    });
    // Subscribers can synchronously cancel. Never register a timer after invalidation.
    this.current(epoch);
    this.timer = this.port.interval(() => {
      try {
        this.current(epoch);
        const n = this.port.mono(),
          elapsed = n - plan.monoAt;
        if (!Number.isFinite(n) || n < this.lastTick || n - this.lastTick > QA_BOUNDS.tickGap)
          throw new Error("timer_throttled");
        this.lastTick = n;
        if (Math.abs(this.port.wall() - plan.wallAt - elapsed) > QA_BOUNDS.wallStep)
          throw new Error("clock_step");
        this.update({ countdownMs: Math.max(0, t - (plan.wallAt + elapsed)) });
        if (n < plan.prepareAt) return;
        if (n - plan.prepareAt > QA_BOUNDS.lateness) throw new Error("preparation_late");
        this.stopTimer();
        void this.prepareNow(plan);
      } catch (error) {
        if (this.plan === plan) this.cancel(this.safeReason(error));
      }
    }, 50);
  }
  private async prepareNow(plan: QaPlan) {
    const startedAt = this.port.mono();
    try {
      await this.calibrateNow(plan.config);
      if (this.plan !== plan) return;
      this.update({
        preparationTimings: Object.freeze({
          ...this.state.preparationTimings,
          calibrationMs: this.port.mono() - startedAt,
        }),
      });
      if (this.plan !== plan) return;
      if (plan.action === "checkin") {
        this.waitForRaceFinal(plan);
        return;
      }
      this.arm(plan.action, plan.target, plan.operationId);
    } catch (error) {
      if (this.plan === plan) this.cancel(this.safeReason(error));
    }
  }
  /** Identity is refreshed at the final stage; clock and lifecycle stay guarded while waiting. */
  private raceStageCurrent(plan: QaPlan, epoch: number) {
    this.current(epoch);
    if (this.plan !== plan) throw new Error("stale_response");
    const n = this.port.mono(),
      wall = this.port.wall();
    if (!Number.isFinite(n) || !Number.isFinite(wall) || n < this.clockAt)
      throw new Error("clock_quality_failed");
    if (n - this.clockAt > QA_BOUNDS.clock) throw new Error("freshness_expired");
    if (Math.abs(wall - plan.wallAt - (n - plan.monoAt)) > QA_BOUNDS.wallStep)
      throw new Error("clock_step");
    const start = canonicalUtc(plan.config.windowStart);
    if (this.now() < start || this.now() >= start + 1200000) throw new Error("outside_window");
  }
  private waitForRaceFinal(plan: QaPlan) {
    const epoch = this.revision;
    const finalAt = canonicalUtc(plan.target) - QA_BOUNDS.prepareLead;
    this.raceStageCurrent(plan, epoch);
    if (this.now() - finalAt > QA_BOUNDS.lateness) throw new Error("preparation_late");
    this.lastTick = this.port.mono();
    this.update({
      phase: "race_prepared",
      message: "Время проверено. Перед проходом повторно проверим сессию.",
      countdownMs: canonicalUtc(plan.target) - this.now(),
    });
    this.raceStageCurrent(plan, epoch);
    const tick = () => {
      try {
        this.raceStageCurrent(plan, epoch);
        const n = this.port.mono();
        if (n < this.lastTick || n - this.lastTick > QA_BOUNDS.tickGap)
          throw new Error("timer_throttled");
        this.lastTick = n;
        this.update({ countdownMs: Math.max(0, canonicalUtc(plan.target) - this.now()) });
        this.raceStageCurrent(plan, epoch);
        if (this.now() < finalAt) return;
        if (this.now() - finalAt > QA_BOUNDS.lateness) throw new Error("preparation_late");
        this.stopTimer();
        void this.prepareRaceFinal(plan, epoch);
      } catch (error) {
        if (this.plan === plan) this.cancel(this.safeReason(error));
      }
    };
    // Already due within the unchanged lateness bound: do not add another timer tick.
    if (this.now() >= finalAt) tick();
    else this.timer = this.port.interval(tick, 50);
  }
  private async prepareRaceFinal(plan: QaPlan, epoch: number) {
    this.busy = true;
    const startedAt = this.port.mono();
    try {
      this.raceStageCurrent(plan, epoch);
      this.update({
        phase: "race_session_check",
        message: "Повторная проверка того же аккаунта и MFA перед проходом",
      });
      const m = await this.bounded(
        () => this.readMfa(),
        epoch,
        () => this.raceStageCurrent(plan, epoch),
      );
      this.raceStageCurrent(plan, epoch);
      const checked = sessionReadiness(m, plan.config.actorId);
      if (checked.reason !== "ready") throw new Error(`session_${checked.reason}`);
      this.identityAt = this.port.mono();
      this.freshness();
      this.update({
        phase: "recalibrated",
        preparationTimings: Object.freeze({
          ...this.state.preparationTimings,
          finalMfaMs: this.port.mono() - startedAt,
        }),
      });
      this.raceStageCurrent(plan, epoch);
      if (canonicalUtc(plan.target) - this.now() < QA_BOUNDS.response + 500)
        throw new Error("insufficient_preparation_time");
      this.busy = false;
      const readyAt = this.port.mono();
      await this.verifyReadyNow();
      if (this.plan !== plan) return;
      this.update({
        preparationTimings: Object.freeze({
          ...this.state.preparationTimings,
          readyMs: this.port.mono() - readyAt,
        }),
      });
      if (this.plan !== plan) return;
      this.arm(plan.action, plan.target, plan.operationId);
    } catch (error) {
      if (this.plan === plan) this.cancel(this.safeReason(error));
    } finally {
      if (this.revision === epoch) this.busy = false;
    }
  }
  async calibrate(config: QaConfig) {
    if (this.plan) throw new Error("already_armed");
    return this.calibrateNow(config);
  }
  private async calibrateNow(config: QaConfig) {
    if (this.busy) return;
    this.safe();
    this.validateConfig(config);
    if (this.state.sessionReadiness.phase === "checking") this.invalidateSession();
    if (this.config) {
      if (!this.sameConfig(config) || !this.reconciled || this.recalibrated)
        throw new Error("calibration_not_available");
      this.recalibrated = true;
    } else this.config = Object.freeze({ ...config });
    // Use only the immutable copy across asynchronous boundaries.
    const actorId = this.config.actorId;
    this.busy = true;
    const epoch = ++this.revision;
    const calibrationWall = this.port.wall(),
      calibrationMono = this.port.mono();
    this.update({
      phase: "calibrating",
      runId: this.config.runId,
      actorId,
      windowStart: this.config.windowStart,
      clockSamples: [],
      message: "Свежая проверка сессии и времени PostgreSQL",
    });
    try {
      const m = await this.bounded(() => this.readMfa(), epoch);
      this.current(epoch);
      const checked = sessionReadiness(m, actorId);
      if (checked.reason !== "ready") throw new Error(`session_${checked.reason}`);
      this.identityAt = this.port.mono();
      const samples: QaClockSample[] = [];
      for (let i = 0; i < 3; i++) {
        let w = this.port.wall(),
          a = this.port.mono();
        let receivedMono: number | undefined, receivedWall: number | undefined;
        let attempted = false;
        const sample: QaClockSample = {
          attempt: i + 1,
          rttMs: null,
          wallDeltaMs: null,
          quality: "fatal",
          reason: null,
          intervalLowerMs: null,
          intervalUpperMs: null,
        };
        try {
          const r = await this.post(
            { action: "verify", eventId: QA_EVENT, token: "DAY07_CLOCK_PROBE" },
            epoch,
            undefined,
            () => {
              w = this.port.wall();
              a = this.port.mono();
              attempted = true;
              this.pendingSample = { epoch, mono: a, wall: w, attempt: i + 1, prior: [...samples] };
            },
          );
          this.current(epoch);
          const b = this.port.mono(),
            received = this.port.wall(),
            rtt = b - a;
          receivedMono = b;
          receivedWall = received;
          this.checkActor(r);
          if (
            r.action !== "verify" ||
            r.outcome !== "invalid_token" ||
            r.replayed ||
            r.operationId !== null ||
            r.participationId !== null ||
            r.passId !== null ||
            r.generation !== null ||
            r.version !== null
          )
            throw new Error("unexpected_probe");
          const server = Date.parse(r.at);
          if (!Number.isFinite(server)) throw new Error("invalid_server_time");
          if (!Number.isFinite(rtt) || rtt < 0 || rtt >= QA_BOUNDS.response)
            throw new Error("clock_quality_failed");
          sample.intervalLowerMs = server - b - 1;
          sample.intervalUpperMs = server - a + 1;
          if (
            !Number.isFinite(received) ||
            !Number.isFinite(w) ||
            !Number.isFinite(calibrationWall) ||
            !Number.isFinite(calibrationMono) ||
            Math.abs(received - w - rtt) > QA_BOUNDS.wallStep ||
            Math.abs(received - calibrationWall - (b - calibrationMono)) > QA_BOUNDS.wallStep
          )
            throw new Error("clock_step");
          sample.quality = rtt <= QA_BOUNDS.rtt ? "good" : "slow";
          sample.reason = sample.quality === "slow" ? "slow_transport" : null;
        } catch (error) {
          sample.reason = this.safeReason(error);
          throw error;
        } finally {
          if (this.pendingSample?.epoch === epoch) this.pendingSample = null;
          if (attempted) {
            const rtt = (receivedMono ?? this.port.mono()) - a,
              delta = (receivedWall ?? this.port.wall()) - w - rtt;
            sample.rttMs = Number.isFinite(rtt) ? rtt : null;
            sample.wallDeltaMs = Number.isFinite(delta) ? delta : null;
            samples.push(Object.freeze(sample));
            if (this.revision === epoch) this.update({ clockSamples: Object.freeze([...samples]) });
          }
        }
      }
      const good = samples.filter((x) => x.quality === "good");
      if (good.length < 2) throw new Error("insufficient_good_samples");
      const lower = Math.max(...good.map((x) => x.intervalLowerMs!));
      const upper = Math.min(...good.map((x) => x.intervalUpperMs!));
      if (
        lower > upper ||
        samples.some(
          (x) => x.quality === "slow" && (x.intervalLowerMs! > upper || x.intervalUpperMs! < lower),
        )
      )
        throw new Error("unstable_clock");
      this.theta = (lower + upper) / 2;
      this.uncertainty = Math.max(1, Math.ceil(Math.max(this.theta - lower, upper - this.theta)));
      if (this.uncertainty > QA_BOUNDS.uncertainty) throw new Error("uncertainty_exceeded");
      this.clockAt = this.port.mono();
      this.wallAt = this.port.wall();
      this.monoAt = this.clockAt;
      this.freshness();
      this.update({
        phase: this.reconciled ? "recalibrated" : "calibrated",
        offsetMs: this.now() - this.wallAt,
        uncertaintyMs: this.uncertainty,
        message: this.plan
          ? "Калибровка готова. Ожидаем зафиксированную цель."
          : "Калибровка готова. Запуск только явной кнопкой.",
      });
    } catch (error) {
      if (this.revision === epoch) this.cancel(this.safeReason(error));
    } finally {
      if (this.revision === epoch) this.busy = false;
    }
  }
  armRehearsal(target: string) {
    if (this.plan) throw new Error("already_armed");
    if (this.state.phase !== "calibrated") throw new Error("rehearsal_not_ready");
    this.arm("verify", target, null);
  }
  armRace(target: string, operationId: string) {
    if (this.plan) throw new Error("already_armed");
    if (!this.ready || this.state.phase !== "ready" || !uuid(operationId))
      throw new Error("race_not_ready");
    this.arm("checkin", target, operationId);
  }
  private arm(action: "verify" | "checkin", target: string, operationId: string | null) {
    this.freshness();
    const t = canonicalUtc(target),
      lead = t - this.now();
    if (
      lead < 500 ||
      lead > QA_BOUNDS.maxArmLead ||
      t + QA_BOUNDS.response >= canonicalUtc(this.config!.windowStart) + 1200000
    )
      throw new Error("target_outside_bound");
    if (this.port.mono() - this.identityAt + lead + QA_BOUNDS.response > QA_BOUNDS.identity)
      throw new Error("insufficient_identity_budget");
    if (this.timer !== undefined || this.busy) throw new Error("already_armed");
    const epoch = ++this.revision;
    this.lastTick = this.port.mono();
    this.update({
      phase: action === "verify" ? "rehearsal_armed" : "race_armed",
      target,
      plannedAction: action,
      operationId,
      countdownMs: lead,
      message: "Один запрос подготовлен к согласованному UTC времени.",
    });
    // Cancellation during the state notification must remain terminal and timer-free.
    this.current(epoch);
    this.timer = this.port.interval(() => {
      try {
        this.current(epoch);
        const n = this.port.mono();
        if (!Number.isFinite(n) || n < this.lastTick || n - this.lastTick > QA_BOUNDS.tickGap)
          throw new Error("timer_throttled");
        this.lastTick = n;
        this.freshness();
        this.update({ countdownMs: Math.max(0, t - this.now()) });
        if (this.now() < t) return;
        if (this.now() - t > QA_BOUNDS.lateness) throw new Error("late_dispatch");
        this.stopTimer();
        void this.dispatch(action, target, operationId, epoch);
      } catch (error) {
        if (this.revision === epoch) this.cancel(this.safeReason(error));
      }
    }, 50);
  }
  private async dispatch(
    action: "verify" | "checkin",
    target: string,
    operationId: string | null,
    epoch: number,
  ) {
    try {
      this.current(epoch);
      this.freshness();
      if (this.port.mono() - this.identityAt + QA_BOUNDS.response > QA_BOUNDS.identity)
        throw new Error("insufficient_identity_budget");
    } catch (error) {
      if (this.revision === epoch) this.cancel(this.safeReason(error));
      return;
    }
    this.busy = true;
    const c: AdmissionCommandInput =
      action === "verify"
        ? { action, eventId: QA_EVENT, token: "DAY07_REHEARSAL_PROBE" }
        : {
            action,
            eventId: QA_EVENT,
            token: QA_PUBLIC_TOKEN,
            operationId: operationId!,
            expectedVersion: 1,
          };
    Object.freeze(c);
    let at = "";
    const finalTiming = () => {
      this.freshness();
      if (this.now() - canonicalUtc(target) > QA_BOUNDS.lateness) throw new Error("late_dispatch");
      if (this.port.mono() - this.lastTick > QA_BOUNDS.tickGap) throw new Error("timer_throttled");
      if (this.port.mono() - this.identityAt + QA_BOUNDS.response > QA_BOUNDS.identity)
        throw new Error("insufficient_identity_budget");
    };
    try {
      const r = await this.post(
        c,
        epoch,
        () => {
          finalTiming();
          at = new Date(this.now()).toISOString();
          this.update({
            phase: "in_flight",
            dispatchAt: at,
            countdownMs: 0,
            message: "Запрос отправлен. Ожидаем сохранённый результат.",
          });
          this.current(epoch);
          finalTiming();
        },
        () => {
          this.sent = c;
          if (action === "verify") this.rehearsalUncertainty = this.uncertainty;
        },
      );
      this.current(epoch);
      this.checkActor(r);
      this.freshness();
      if (action === "verify") {
        if (r.outcome !== "invalid_token" || r.operationId !== null || r.replayed)
          throw new Error("unexpected_rehearsal");
        this.rehearsal = r;
        this.rehearsalTarget = target;
        this.rehearsalDispatch = at;
        this.sent = null;
        this.plan = null;
        this.update({
          phase: "rehearsal_done",
          receipt: r,
          rehearsalReceipt: r,
          rehearsalTarget: target,
          rehearsalDispatchAt: at,
          message: "Репетиция завершена. Нужна внешняя сверка двух ответов и SQL observer.",
        });
      } else {
        if (
          r.operationId !== operationId ||
          r.participationId !== QA_PART ||
          r.passId !== QA_PASS ||
          r.generation !== 1 ||
          r.version !== 2 ||
          r.replayed ||
          !["simulated_accepted", "used"].includes(r.outcome)
        )
          throw new Error("unexpected_checkin");
        this.plan = null;
        this.update({
          phase: "result",
          receipt: r,
          message: "Получен ответ. Результат гонки определяет сверка PostgreSQL.",
        });
      }
    } catch (error) {
      if (this.revision === epoch)
        this.cancel(this.sent ? "uncertain_after_dispatch" : this.safeReason(error));
    } finally {
      if (this.revision === epoch) this.busy = false;
    }
  }
  acceptRehearsal(value: unknown) {
    if (
      this.state.phase !== "rehearsal_done" ||
      !this.config ||
      !this.rehearsal ||
      !object(value) ||
      !keys(value, [
        "schema",
        "runId",
        "windowStart",
        "rehearsalTarget",
        "coordinatorVerdict",
        "reconciledAt",
        "observer",
        "browsers",
      ])
    )
      throw new Error("invalid_rehearsal_evidence");
    if (
      value["schema"] !== "day07-rehearsal-v2" ||
      value["runId"] !== this.config.runId ||
      value["windowStart"] !== this.config.windowStart ||
      value["rehearsalTarget"] !== this.rehearsalTarget ||
      value["coordinatorVerdict"] !== "REHEARSAL_RECONCILED" ||
      typeof value["reconciledAt"] !== "string"
    )
      throw new Error("evidence_binding_mismatch");
    const o = value["observer"];
    if (
      !object(o) ||
      !keys(o, [
        "status",
        "phase",
        "eventId",
        "observerPid",
        "startAt",
        "lockAttemptAt",
        "lockAcquiredAt",
        "observedAt",
        "lockReleasedAt",
        "heldMs",
        "polls",
        "backends",
      ]) ||
      o["status"] !== "REHEARSAL_TWO_BACKENDS_OBSERVED_NOT_ACTOR_ATTRIBUTED" ||
      o["phase"] !== "verify" ||
      o["eventId"] !== QA_EVENT ||
      Date.parse(String(o["startAt"])) !== Date.parse(this.rehearsalTarget!) ||
      typeof o["observerPid"] !== "number" ||
      !Number.isInteger(o["observerPid"]) ||
      o["observerPid"] <= 0 ||
      typeof o["heldMs"] !== "number" ||
      o["heldMs"] < 0 ||
      o["heldMs"] > 2000 ||
      !Array.isArray(o["backends"]) ||
      o["backends"].length !== 2
    )
      throw new Error("invalid_observer");
    const start = Date.parse(String(o["lockAttemptAt"])),
      acquired = Date.parse(String(o["lockAcquiredAt"])),
      observed = Date.parse(String(o["observedAt"])),
      released = Date.parse(String(o["lockReleasedAt"]));
    if (
      ![start, acquired, observed, released].every(Number.isFinite) ||
      !(start <= acquired && acquired <= observed && observed <= released) ||
      released - start > 2000
    )
      throw new Error("invalid_lock_bounds");
    const observedBackends = o["backends"] as Record<string, unknown>[];
    const pids = new Set<number>();
    for (const backend of observedBackends) {
      if (
        !object(backend) ||
        !keys(backend, [
          "pid",
          "backendStart",
          "transactionStart",
          "queryStart",
          "state",
          "waitType",
          "waitEvent",
          "blockingPids",
        ]) ||
        typeof backend["pid"] !== "number" ||
        !Number.isInteger(backend["pid"]) ||
        backend["pid"] <= 0 ||
        backend["pid"] === o["observerPid"] ||
        backend["state"] !== "active" ||
        backend["waitType"] !== "Lock" ||
        !Array.isArray(backend["blockingPids"]) ||
        !backend["blockingPids"].every((x) => typeof x === "number" && Number.isInteger(x) && x > 0)
      )
        throw new Error("invalid_backend");
      const bt = Date.parse(String(backend["backendStart"])),
        xt = Date.parse(String(backend["transactionStart"])),
        qt = Date.parse(String(backend["queryStart"]));
      if (![bt, xt, qt].every(Number.isFinite) || bt > xt || xt > qt || qt > observed)
        throw new Error("invalid_backend_times");
      pids.add(backend["pid"]);
    }
    if (pids.size !== 2) throw new Error("distinct_backends_required");
    for (const backend of observedBackends) {
      const blockers = backend["blockingPids"] as number[];
      if (
        !blockers.includes(o["observerPid"]) &&
        !blockers.some((pid) =>
          observedBackends.some(
            (x: unknown) =>
              object(x) &&
              x["pid"] === pid &&
              Array.isArray(x["blockingPids"]) &&
              x["blockingPids"].includes(o["observerPid"]),
          ),
        )
      )
        throw new Error("observer_blocking_chain_required");
    }
    if (!Array.isArray(value["browsers"]) || value["browsers"].length !== 2)
      throw new Error("two_browser_receipts_required");
    let own = false;
    const correlations = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const x = value["browsers"][i];
      if (
        !object(x) ||
        !keys(x, ["dispatchedAt", "uncertaintyMs", "receipt"]) ||
        typeof x["dispatchedAt"] !== "string" ||
        typeof x["uncertaintyMs"] !== "number" ||
        !Number.isInteger(x["uncertaintyMs"]) ||
        x["uncertaintyMs"] < 1 ||
        x["uncertaintyMs"] > QA_BOUNDS.uncertainty ||
        !object(x["receipt"])
      )
        throw new Error("invalid_browser_receipt");
      if (
        !keys(x["receipt"], [
          "operationId",
          "correlationId",
          "action",
          "outcome",
          "eventId",
          "participationId",
          "passId",
          "generation",
          "version",
          "actorId",
          "at",
          "simulated",
          "reentryAllowed",
          "replayed",
        ])
      )
        throw new Error("unexpected_receipt_fields");
      const r = x["receipt"] as QaReceipt;
      if (
        r.actorId !== QA_ACTORS[i] ||
        r.eventId !== QA_EVENT ||
        r.action !== "verify" ||
        r.outcome !== "invalid_token" ||
        r.replayed !== false ||
        r.operationId !== null ||
        r.participationId !== null ||
        r.passId !== null ||
        r.generation !== null ||
        r.version !== null ||
        typeof r.correlationId !== "string" ||
        !uuid(r.correlationId) ||
        !r.simulated ||
        r.reentryAllowed
      )
        throw new Error("receipt_binding_mismatch");
      const at = Date.parse(r.at),
        dispatch = canonicalUtc(x["dispatchedAt"]);
      if (
        !Number.isFinite(at) ||
        // Client dispatch is an estimate in server time, with measured bounded error.
        // Server receipt time and observed PostgreSQL blocking remain authoritative.
        dispatch - x["uncertaintyMs"] > observed ||
        at < observed ||
        dispatch < canonicalUtc(this.config.windowStart) ||
        at > canonicalUtc(value["reconciledAt"])
      )
        throw new Error("invalid_receipt_timing");
      correlations.add(r.correlationId);
      if (
        r.actorId === this.config.actorId &&
        equalReceipt(r, this.rehearsal) &&
        x["dispatchedAt"] === this.rehearsalDispatch &&
        x["uncertaintyMs"] === this.rehearsalUncertainty
      )
        own = true;
    }
    if (
      !own ||
      correlations.size !== 2 ||
      canonicalUtc(value["reconciledAt"]) < released ||
      canonicalUtc(value["reconciledAt"]) >= canonicalUtc(this.config.windowStart) + 1200000
    )
      throw new Error("unreconciled_evidence");
    this.reconciled = true;
    this.update({
      phase: "rehearsal_done",
      message:
        "Структура сверки принята. Она не удостоверяет источник доказательства. Можно зафиксировать план гонки.",
    });
  }
  async verifyReady() {
    if (this.plan) throw new Error("already_armed");
    return this.verifyReadyNow();
  }
  private async verifyReadyNow() {
    if (this.state.phase !== "recalibrated" || !this.reconciled || this.busy)
      throw new Error("not_ready");
    this.freshness();
    this.busy = true;
    const epoch = ++this.revision;
    this.update({ phase: "verifying_ready", message: "Проверка свежего synthetic pass" });
    try {
      const r = await this.post(
        { action: "verify", eventId: QA_EVENT, token: QA_PUBLIC_TOKEN },
        epoch,
      );
      this.current(epoch);
      this.checkActor(r);
      this.freshness();
      if (
        r.action !== "verify" ||
        r.operationId !== null ||
        r.outcome !== "ready" ||
        r.passId !== QA_PASS ||
        r.participationId !== QA_PART ||
        r.version !== 1 ||
        r.generation !== 1 ||
        r.replayed
      )
        throw new Error("fixture_not_fresh");
      this.ready = true;
      this.update({
        phase: "ready",
        receipt: r,
        message: "Точный synthetic pass готов. Можно явно подготовить один checkin.",
      });
    } catch {
      if (this.revision === epoch) this.cancel("Подготовка остановлена. Нужна сверка fixture.");
    } finally {
      if (epoch === this.revision) this.busy = false;
    }
  }
  async replayWinner(ack: {
    operationId: string;
    primaryCount: number;
    acceptedCount: number;
    usedCount: number;
  }) {
    const original = this.state.receipt;
    if (
      this.state.phase !== "result" ||
      !original ||
      original.outcome !== "simulated_accepted" ||
      this.replayed ||
      this.busy ||
      !this.sent ||
      this.sent.action !== "checkin" ||
      ack.operationId !== original.operationId ||
      ack.primaryCount !== 1 ||
      ack.acceptedCount !== 1 ||
      ack.usedCount !== 1
    )
      throw new Error("coordinator_ack_required");
    this.safe();
    if (this.budget.used >= QA_BOUNDS.posts) throw new Error("budget_exhausted");
    this.replayed = true;
    this.busy = true;
    const epoch = ++this.revision;
    let dispatched = false;
    this.update({
      phase: "replay_checking",
      message: "Свежая проверка сессии перед единственным replay",
    });
    try {
      const m = await this.bounded(() => this.readMfa(), epoch);
      this.current(epoch);
      const checked = sessionReadiness(m, this.config!.actorId);
      if (checked.reason !== "ready") throw new Error(`session_${checked.reason}`);
      // The immutable original body is reused. Database window/staff/MFA guards remain authoritative.
      const identityAt = this.port.mono();
      const r = await this.post(
        this.sent,
        epoch,
        () => {
          if (this.port.mono() - identityAt + QA_BOUNDS.response > QA_BOUNDS.identity)
            throw new Error("insufficient_identity_budget");
          this.update({ phase: "replay_in_flight", message: "Единственный replay отправлен" });
          this.current(epoch);
          if (this.port.mono() - identityAt + QA_BOUNDS.response > QA_BOUNDS.identity)
            throw new Error("insufficient_identity_budget");
        },
        () => {
          this.replayDispatched = dispatched = true;
        },
      );
      this.current(epoch);
      if (!r.replayed || !equalReceipt({ ...r, replayed: false }, original))
        throw new Error("replay_changed");
      this.update({
        phase: "replayed",
        receipt: r,
        message: "Повтор совпал с сохранённым ответом. DB concurrency verdict остаётся внешним.",
      });
    } catch (error) {
      if (this.revision === epoch) {
        if (dispatched) this.cancel("replay_uncertain");
        else
          this.update({
            phase: "replay_blocked",
            message: this.safeReason(error),
            receipt: original,
          });
      }
    } finally {
      if (epoch === this.revision) this.busy = false;
    }
  }
}
