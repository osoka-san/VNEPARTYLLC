import {
  isAdmissionToken,
  type AdmissionPass,
  type AdmissionReadInput,
  type AdmissionReadResult,
  type AdmissionCommandInput,
  type AdmissionCommandResult,
} from "../../lib/admission/contract.ts";
import { canIssue, canRotate, ownerMutation, type OwnerMutation } from "./OwnerPassModel.ts";
export type OwnerState = {
  pass: AdmissionPass | null;
  fresh: boolean;
  busy: boolean;
  message: string;
  secret: { value: string; version: number; generation: number } | null;
  pending: OwnerMutation | null;
  address: string | null;
  back: boolean;
};
export type OwnerPort = {
  read(input: AdmissionReadInput): Promise<AdmissionReadResult>;
  command(input: AdmissionCommandInput): Promise<AdmissionCommandResult>;
};
/** One page-local memory owner. No persistence, rendering effects, or automatic mutations. */
export class OwnerPassController {
  private state: OwnerState = {
    pass: null,
    fresh: false,
    busy: false,
    message: "loading",
    secret: null,
    pending: null,
    address: null,
    back: false,
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private readSequence = 0;
  private addressSequence = 0;
  private active: object | null = null;
  private mounted = false;
  private visible = true;
  readonly eventId: string;
  readonly participationId: string;
  private port: OwnerPort;
  constructor(eventId: string, participationId: string, port: OwnerPort) {
    this.eventId = eventId;
    this.participationId = participationId;
    this.port = port;
  }
  snapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<OwnerState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  start(visible = true) {
    this.mounted = true;
    this.visible = visible;
    if (visible) void this.refresh();
  }
  stop() {
    this.mounted = false;
    this.invalidate();
  }
  invalidate(message = "hidden") {
    ++this.epoch;
    ++this.readSequence;
    ++this.addressSequence;
    this.active = null;
    this.update({ secret: null, address: null, fresh: false, busy: false, back: false, message });
  }
  hide() {
    this.visible = false;
    this.invalidate();
  }
  resume() {
    this.visible = true;
    if (this.mounted) void this.refresh();
  }
  signout() {
    this.visible = false;
    this.invalidate("forbidden");
    this.update({ pass: null, pending: null });
  }
  private current(epoch: number) {
    return this.mounted && this.visible && epoch === this.epoch;
  }
  async refresh() {
    if (!this.mounted || !this.visible || this.active) return;
    const epoch = this.epoch,
      sequence = ++this.readSequence;
    // A newer authority check supersedes every older private-address response.
    ++this.addressSequence;
    this.update({ fresh: false });
    const result = await this.port
      .read({ action: "status", eventId: this.eventId, participationId: this.participationId })
      .catch(() => null);
    if (!this.current(epoch) || sequence !== this.readSequence) return;
    const pass = result?.ok ? result.pass : null;
    if (!pass || pass.eventId !== this.eventId || pass.participationId !== this.participationId) {
      this.update({
        secret: null,
        address: null,
        fresh: false,
        back: false,
        message: result && !result.ok ? result.reason : "unavailable",
      });
      return;
    }
    const secret =
      pass.status === "active" &&
      this.state.secret?.version === pass.version &&
      this.state.secret?.generation === pass.generation
        ? this.state.secret
        : null;
    this.update({
      pass,
      fresh: true,
      secret,
      back: !!secret && this.state.back,
      address: ["active", "not_issued", "before_release"].includes(pass.status)
        ? this.state.address
        : null,
      message: this.state.pending
        ? "lost_reply"
        : secret
          ? this.state.message
          : this.state.message === "secret_lost"
            ? "secret_lost"
            : pass.status,
    });
  }
  showOrFlip() {
    if (this.state.secret && this.state.fresh && this.state.pass?.status === "active") {
      this.update({ back: !this.state.back });
      return;
    }
    if (
      this.state.pass &&
      this.state.fresh &&
      canIssue(this.state.pass) &&
      !this.state.pending &&
      !this.active
    )
      void this.issue();
  }
  async issue(operationId = crypto.randomUUID()) {
    const pass = this.state.pass;
    if (
      !pass ||
      !this.state.fresh ||
      !canIssue(pass) ||
      this.state.pending ||
      this.active ||
      !this.mounted ||
      !this.visible
    )
      return;
    this.update({
      pending: Object.freeze(
        ownerMutation(pass, "issue", operationId, "Участник запросил первый тестовый QR"),
      ),
    });
    await this.retry();
  }
  async rotate(reason: string, confirmed: boolean, operationId = crypto.randomUUID()) {
    const pass = this.state.pass;
    if (
      !pass ||
      !this.state.fresh ||
      !canRotate(pass) ||
      !confirmed ||
      reason.trim().length < 3 ||
      reason.trim().length > 300 ||
      /VNE[12]:/.test(reason) ||
      this.state.pending ||
      this.active ||
      !this.mounted ||
      !this.visible
    )
      return;
    this.update({ pending: Object.freeze(ownerMutation(pass, "rotate", operationId, reason)) });
    await this.retry();
  }
  async retry() {
    const command = this.state.pending;
    if (!command || this.active || !this.mounted || !this.visible) return;
    const epoch = ++this.epoch,
      attempt = {};
    this.active = attempt;
    ++this.readSequence;
    ++this.addressSequence;
    this.update({
      busy: true,
      fresh: false,
      secret: null,
      address: null,
      back: false,
      message: "loading",
    });
    const result = await this.port.command(command).catch(() => null);
    // An old response must neither repopulate private state nor unlock a newer attempt.
    if (!this.current(epoch) || this.active !== attempt) return;
    this.active = null;
    if (!result || (!result.ok && result.reason === "unavailable")) {
      this.update({ busy: false, message: "lost_reply" });
      return;
    }
    if (!result.ok) {
      this.update({ busy: false, pending: null, message: result.reason });
      await this.refresh();
      return;
    }
    const receipt = result.receipt,
      pass = this.state.pass;
    const matches =
      receipt &&
      receipt.action === command.action &&
      receipt.operationId === command.operationId &&
      receipt.eventId === command.eventId &&
      receipt.participationId === command.participationId;
    if (!matches) {
      this.update({ busy: false, message: "lost_reply" });
      return;
    }
    const issued =
      (command.action === "issue" && receipt.outcome === "issued") ||
      (command.action === "rotate" && receipt.outcome === "rotated");
    const validSecret =
      issued &&
      !result.replayed &&
      !result.secretUnavailable &&
      isAdmissionToken(result.qrText) &&
      receipt.version === command.expectedVersion + 1 &&
      receipt.generation === (pass?.generation ?? 0) + 1;
    this.update({
      busy: false,
      pending: null,
      secret: validSecret
        ? { value: result.qrText!, version: receipt.version!, generation: receipt.generation! }
        : null,
      back: !!validSecret,
      message: validSecret ? receipt.outcome : issued ? "secret_lost" : receipt.outcome,
    });
    await this.refresh();
  }
  async revealAddress() {
    if (!this.mounted || !this.visible || !this.state.fresh || this.active) return;
    const epoch = this.epoch,
      sequence = ++this.addressSequence;
    const result = await this.port
      .read({ action: "address", eventId: this.eventId, participationId: this.participationId })
      .catch(() => null);
    if (!this.current(epoch) || sequence !== this.addressSequence) return;
    if (result?.ok && result.address?.addressAvailable && result.address.address)
      this.update({ address: result.address.address });
    else
      this.update({
        address: null,
        message: result?.ok
          ? (result.address?.outcome ?? "unavailable")
          : (result?.reason ?? "unavailable"),
      });
  }
}
