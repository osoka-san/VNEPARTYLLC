import {
  emptyDraftPayload,
  type DraftLoadResult,
  type DraftSaveCommand,
  type DraftSaveResult,
  type QuestionnaireDraftPayload,
  type DraftReference,
} from "./questionnaire-draft";

export type DraftPhase =
  | "loading"
  | "ready"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict"
  | "expired"
  | "signin"
  | "submitted"
  | "unconfigured";
export type DraftControllerState = {
  payload: QuestionnaireDraftPayload;
  phase: DraftPhase;
  owner: string | null;
  id: string;
  version: number;
  savedAt: string | null;
  expiresAt: string | null;
  dirty: boolean;
};
export type DraftTransport = {
  load(): Promise<DraftLoadResult>;
  save(command: DraftSaveCommand): Promise<DraftSaveResult>;
};
const blank = (): DraftControllerState => ({
  payload: emptyDraftPayload(),
  phase: "loading",
  owner: null,
  id: "",
  version: 0,
  savedAt: null,
  expiresAt: null,
  dirty: false,
});

/** A per-render-tree queue. No answers or identifiers are written to browser storage or logs. */
export class QuestionnaireDraftController {
  state = blank();
  private generation = 0;
  private creationIssuedAt = "";
  private revision = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: { command: DraftSaveCommand; revision: number } | null = null;
  private saving: Promise<DraftReference | null> | null = null;
  private listeners = new Set<() => void>();
  constructor(
    private readonly transport: DraftTransport,
    private readonly uuid: () => string,
    private readonly delay = 800,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = () => this.state;
  private publish(patch: Partial<DraftControllerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  clear(phase: DraftPhase = "signin") {
    ++this.generation;
    clearTimeout(this.timer);
    this.pending = null;
    this.saving = null;
    this.revision = 0;
    this.creationIssuedAt = "";
    this.state = { ...blank(), phase };
    this.listeners.forEach((listener) => listener());
  }
  async load() {
    this.clear("loading");
    const generation = this.generation;
    const result = await this.transport
      .load()
      .catch(() => ({ ok: false as const, reason: "unavailable" as const }));
    if (generation !== this.generation) return;
    if (!result.ok) {
      this.publish({
        phase:
          result.reason === "signin"
            ? "signin"
            : result.reason === "unconfigured"
              ? "unconfigured"
              : "error",
      });
      return;
    }
    this.creationIssuedAt = result.creationIssuedAt;
    this.publish({
      owner: result.ownerUserId,
      id: result.draft?.id ?? this.uuid(),
      version: result.draft?.version ?? 0,
      payload: result.draft?.payload ?? emptyDraftPayload(),
      savedAt: result.draft?.savedAt ?? null,
      expiresAt: result.draft?.expiresAt ?? null,
      phase: result.submitted ? "submitted" : result.draft ? "saved" : "ready",
    });
  }
  update(patch: Partial<QuestionnaireDraftPayload>) {
    if (
      ["loading", "signin", "submitted", "conflict", "expired"].includes(this.state.phase) ||
      (this.state.phase === "error" && !this.state.owner)
    )
      return;
    const payload = { ...this.state.payload, ...patch };
    if (JSON.stringify(payload) === JSON.stringify(this.state.payload)) return;
    ++this.revision;
    this.publish({
      payload,
      dirty: true,
      phase:
        this.state.phase === "unconfigured" || this.state.phase === "error"
          ? this.state.phase
          : this.saving
            ? "saving"
            : "dirty",
    });
    clearTimeout(this.timer);
    if (this.state.owner && this.state.phase !== "error")
      this.timer = setTimeout(() => {
        void this.flush();
      }, this.delay);
  }
  /** Retry an uncertain write with its original mutation ID before saving later edits. */
  async flush(): Promise<DraftReference | null> {
    clearTimeout(this.timer);
    if (this.saving) return this.saving;
    if (
      !this.state.owner ||
      ["loading", "signin", "submitted", "conflict", "expired", "unconfigured"].includes(
        this.state.phase,
      )
    )
      return null;
    if (!this.state.dirty)
      return this.state.version ? { id: this.state.id, version: this.state.version } : null;
    const generation = this.generation;
    const run = async (): Promise<DraftReference | null> => {
      while (this.state.dirty && generation === this.generation) {
        this.pending ??= {
          command: {
            expectedOwnerUserId: this.state.owner!,
            creationIssuedAt: this.creationIssuedAt,
            id: this.state.id,
            expectedVersion: this.state.version,
            mutationId: this.uuid(),
            payload: structuredClone(this.state.payload),
          },
          revision: this.revision,
        };
        const pending = this.pending;
        this.publish({ phase: "saving" });
        const result = await this.transport
          .save(pending.command)
          .catch(() => ({ ok: false as const, reason: "unavailable" as const }));
        if (generation !== this.generation) return null;
        if (!result.ok) {
          // Definitive validation rejection made no write; do not pin the invalid payload forever.
          if (result.reason === "invalid") this.pending = null;
          if (result.reason === "signin" || result.reason === "session_changed")
            this.clear("signin");
          else if (result.reason === "submitted") this.clear("submitted");
          else
            this.publish({
              phase:
                result.reason === "conflict"
                  ? "conflict"
                  : result.reason === "expired"
                    ? "expired"
                    : "error",
            });
          return null;
        }
        if (
          result.ownerUserId !== this.state.owner ||
          result.draft.id !== pending.command.id ||
          result.draft.version !== pending.command.expectedVersion + 1
        ) {
          this.clear("signin");
          return null;
        }
        this.pending = null;
        const dirty = pending.revision !== this.revision;
        this.publish({
          version: result.draft.version,
          savedAt: result.draft.savedAt,
          expiresAt: result.draft.expiresAt,
          dirty,
          phase: dirty ? "dirty" : "saved",
        });
      }
      return { id: this.state.id, version: this.state.version };
    };
    const operation = run();
    this.saving = operation;
    try {
      return await operation;
    } finally {
      if (this.saving === operation) this.saving = null;
    }
  }
  /** Focus/visibility revalidation never silently replaces local changes with another device's draft. */
  async revalidate() {
    if (this.saving || this.state.phase === "loading" || this.state.phase === "unconfigured")
      return;
    const generation = this.generation;
    const revision = this.revision;
    const version = this.state.version;
    const result = await this.transport
      .load()
      .catch(() => ({ ok: false as const, reason: "unavailable" as const }));
    if (
      generation !== this.generation ||
      revision !== this.revision ||
      this.state.version !== version ||
      this.saving
    )
      return;
    if (!result.ok) {
      if (result.reason === "signin" || result.reason === "session_changed") this.clear("signin");
      return;
    }
    if (this.state.owner && this.state.owner !== result.ownerUserId) {
      this.clear("signin");
      return;
    }
    if (!this.state.owner) {
      await this.load();
      return;
    }
    if (result.submitted) {
      this.clear("submitted");
      return;
    }
    // A read can observe our committed write after its response was lost. Resolve the
    // original mutation before comparing versions, preserving any later local edits.
    if (this.pending && this.state.phase === "error") {
      await this.flush();
      return;
    }
    if (!result.draft && version === 0 && !this.pending) {
      this.creationIssuedAt = result.creationIssuedAt;
      return;
    }
    if (result.draft?.id === this.state.id && result.draft.version === version) return;
    if (this.state.dirty) {
      this.publish({ phase: result.draft ? "conflict" : "expired" });
      return;
    }
    this.creationIssuedAt = result.creationIssuedAt;
    this.publish({
      owner: result.ownerUserId,
      id: result.draft?.id ?? this.uuid(),
      version: result.draft?.version ?? 0,
      payload: result.draft?.payload ?? emptyDraftPayload(),
      savedAt: result.draft?.savedAt ?? null,
      expiresAt: result.draft?.expiresAt ?? null,
      phase: result.draft ? "saved" : "ready",
    });
  }
  complete() {
    this.clear("submitted");
  }
  dispose() {
    this.clear();
    this.listeners.clear();
  }
}
