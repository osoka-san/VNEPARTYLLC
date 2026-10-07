import { defaultLoadingSettings, sanitizeLoadingSettings } from "./loading-settings";

export type LoadingSnapshot = Readonly<{
  visible: boolean;
  slow: boolean;
  label: string;
  /** A monotonic estimate, never byte-level progress; 100 means no tracked tasks remain. */
  progress: number;
}>;

type Clock = {
  now: () => number;
  set: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clear: (timer: ReturnType<typeof setTimeout>) => void;
};

const clock: Clock = {
  now: () => Date.now(),
  set: (callback, delay) => setTimeout(callback, delay),
  clear: (timer) => clearTimeout(timer),
};

/** One controller per React root, never shared between SSR requests. */
export function createSiteLoading(timer: Clock = clock) {
  let timing = defaultLoadingSettings;
  const bootstrap = Symbol("bootstrap");
  const tasks = new Map<symbol, string>([[bootstrap, "Загружаем ВНЕ"]]);
  const listeners = new Set<() => void>();
  let snapshot: LoadingSnapshot = {
    visible: true,
    slow: false,
    label: "Загружаем ВНЕ",
    progress: 0,
  };
  const serverSnapshot = snapshot;
  let mounted = false;
  let dismissed = false;
  let shownAt = timer.now();
  let startedAt = shownAt;
  let taskCount = 1;
  let completedCount = 0;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  let progressTimer: ReturnType<typeof setTimeout> | undefined;
  const clear = (id: ReturnType<typeof setTimeout> | undefined) => {
    if (id !== undefined) timer.clear(id);
  };
  function emit(patch: Partial<LoadingSnapshot>) {
    const next = { ...snapshot, ...patch };
    if (
      Object.keys(next).every(
        (key) => next[key as keyof LoadingSnapshot] === snapshot[key as keyof LoadingSnapshot],
      )
    )
      return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  }
  function armSlow() {
    if (slowTimer !== undefined || snapshot.slow) return;
    slowTimer = timer.set(
      () => {
        slowTimer = undefined;
        if (tasks.size && snapshot.visible) emit({ slow: true });
      },
      Math.max(0, timing.slowAfter - (timer.now() - shownAt)),
    );
  }
  function updateProgress() {
    if (!tasks.size) return;
    // Tasks have different weights and may register late. The estimate combines
    // elapsed time with finished milestones, so it is explicitly not a byte count.
    const elapsed = Math.max(0, timer.now() - startedAt);
    const estimate = Math.round(94 * (1 - Math.exp(-elapsed / 4000)));
    const milestones = Math.round((completedCount / taskCount) * 90);
    emit({ progress: Math.min(94, Math.max(snapshot.progress, estimate, milestones)) });
  }
  function armProgress() {
    if (progressTimer !== undefined || snapshot.progress >= 94) return;
    progressTimer = timer.set(() => {
      progressTimer = undefined;
      if (!mounted || !tasks.size || !snapshot.visible || dismissed) return;
      updateProgress();
      armProgress();
    }, 250);
  }
  function reconcile() {
    if (!mounted) return;
    if (tasks.size) {
      clear(hideTimer);
      hideTimer = undefined;
      emit({ label: [...tasks.values()].at(-1)! });
      if (dismissed) return;
      updateProgress();
      if (snapshot.visible) {
        armSlow();
        armProgress();
      } else if (showTimer === undefined) {
        // Cached/fast operations should not flash a full-page veil.
        showTimer = timer.set(() => {
          showTimer = undefined;
          shownAt = timer.now();
          emit({ visible: true, slow: false });
          armSlow();
          updateProgress();
          armProgress();
        }, timing.showDelay);
      }
    } else {
      clear(showTimer);
      clear(slowTimer);
      clear(progressTimer);
      showTimer = slowTimer = progressTimer = undefined;
      dismissed = false;
      emit({ progress: 100 });
      if (snapshot.visible && hideTimer === undefined) {
        hideTimer = timer.set(
          () => {
            hideTimer = undefined;
            emit({ visible: false, slow: false });
          },
          Math.max(0, timing.minVisible - (timer.now() - shownAt)),
        );
      }
    }
  }
  return {
    configure: (input: unknown) => {
      const next = sanitizeLoadingSettings(input);
      if (
        next.showDelay === timing.showDelay &&
        next.minVisible === timing.minVisible &&
        next.slowAfter === timing.slowAfter
      )
        return;
      timing = next;
      clear(showTimer);
      clear(hideTimer);
      clear(slowTimer);
      showTimer = hideTimer = slowTimer = undefined;
      reconcile();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => serverSnapshot,
    mount: () => {
      mounted = true;
      reconcile();
      return () => {
        mounted = false;
        clear(showTimer);
        clear(hideTimer);
        clear(slowTimer);
        clear(progressTimer);
        showTimer = hideTimer = slowTimer = progressTimer = undefined;
      };
    },
    ready: () => {
      if (tasks.delete(bootstrap)) completedCount++;
      reconcile();
    },
    begin: (label: string) => {
      if (!tasks.size) {
        startedAt = timer.now();
        taskCount = 0;
        completedCount = 0;
        emit({ progress: 0 });
      }
      const id = Symbol();
      tasks.set(id, label);
      taskCount++;
      reconcile();
      // Idempotent: success, failure and unmount may all release the same task.
      return () => {
        if (tasks.delete(id)) {
          completedCount++;
          reconcile();
        }
      };
    },
    dismiss: () => {
      dismissed = true;
      clear(showTimer);
      clear(slowTimer);
      clear(progressTimer);
      showTimer = slowTimer = progressTimer = undefined;
      emit({ visible: false, slow: false });
    },
  };
}
