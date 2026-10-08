import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "motion/react";
import { Check, PencilLine, Plus, X } from "lucide-react";
import { QUESTIONNAIRE_MAX_ANSWERS } from "@/lib/questionnaire";
import "./bloom-answer-menu.css";

// Motion reference: https://beui.dev/components/blocks/bloom-menu
// Adapted for answer selection, keyboard navigation and a collision-safe viewport.
const bloomSpring = { type: "spring", stiffness: 300, damping: 32, mass: 0.9 } as const;
const bloomEase = [0.16, 1, 0.3, 1] as const;

type BloomAnswerMenuProps = {
  question: string;
  labelledBy: string;
  options: readonly string[];
  selected: string[];
  custom: boolean;
  onSelect: (answer: string) => void;
  onCustom: (active: boolean) => void;
  onCustomFocus: () => void;
  disabled?: boolean;
  motionEnabled?: boolean;
  invalid?: boolean;
  describedBy?: string | undefined;
};

export function BloomAnswerMenu({
  question,
  labelledBy,
  options,
  selected,
  custom,
  onSelect,
  onCustom,
  onCustomFocus,
  disabled = false,
  motionEnabled = true,
  invalid = false,
  describedBy,
}: BloomAnswerMenuProps) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [columns, setColumns] = useState(3);
  const [triggerHeight, setTriggerHeight] = useState(48);
  const [panelHeight, setPanelHeight] = useState(320);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const customFocusPending = useRef(false);
  const selectedCount = selected.length + Number(custom);
  const selectedIndex = selected.length
    ? Math.max(0, options.indexOf(selected[0] ?? ""))
    : custom
      ? options.length
      : 0;
  const morph = motionEnabled ? bloomSpring : { duration: 0 };

  useEffect(() => {
    const query = window.matchMedia("(max-width: 479px)");
    const update = () => setColumns(query.matches ? 2 : 3);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    const panel = panelRef.current;
    const update = () => setPanelHeight(panel.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const changeOpen = (next: boolean) => {
    if (next && disabled) return;
    if (next) {
      setTriggerHeight(triggerRef.current?.offsetHeight ?? 48);
      customFocusPending.current = false;
    }
    setOpen(next);
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((item) => item === document.activeElement);
    if (current < 0) return;
    const count = options.length + 1;
    const target =
      event.key === "ArrowRight"
        ? (current + 1) % count
        : event.key === "ArrowLeft"
          ? (current - 1 + count) % count
          : event.key === "ArrowDown"
            ? (current + columns) % count
            : event.key === "ArrowUp"
              ? (current - columns + count) % count
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? count - 1
                  : null;
    if (target === null) return;
    event.preventDefault();
    itemRefs.current[target]?.focus({ preventScroll: true });
    itemRefs.current[target]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="vne-bloom-trigger"
          disabled={disabled}
          aria-labelledby={`${labelledBy} ${uid}-value`}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          data-open={open}
          data-selected={selectedCount > 0}
        >
          <AnimatePresence initial={false}>
            {!open && (
              <motion.span
                key="button-surface"
                {...(motionEnabled ? { layoutId: `${uid}-surface` } : {})}
                transition={morph}
                className="vne-bloom-trigger-surface"
                style={{ borderRadius: 8 }}
                aria-hidden="true"
              />
            )}
          </AnimatePresence>
          <span className="vne-bloom-trigger-label" id={`${uid}-value`}>
            {selectedCount
              ? [...selected, ...(custom ? ["Свой ответ"] : [])].join(" · ")
              : "Выбрать до 3 ответов"}
          </span>
          <span className="vne-bloom-trigger-count" aria-hidden="true">
            {selectedCount}/{QUESTIONNAIRE_MAX_ANSWERS}
          </span>
          <Plus size={18} className="vne-bloom-trigger-icon" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal forceMount>
        <AnimatePresence initial={false}>
          {open && (
            <Popover.Content
              key="bloom-panel"
              forceMount
              asChild
              align="center"
              side="bottom"
              sideOffset={-(triggerHeight + panelHeight) / 2}
              collisionPadding={16}
              avoidCollisions
              sticky="always"
              aria-labelledby={`${uid}-panel-title`}
              aria-describedby={`${uid}-panel-help`}
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                itemRefs.current[selectedIndex]?.focus({ preventScroll: true });
              }}
              onCloseAutoFocus={(event) => {
                if (!customFocusPending.current) return;
                event.preventDefault();
                customFocusPending.current = false;
                requestAnimationFrame(onCustomFocus);
              }}
            >
              <motion.div
                ref={panelRef}
                {...(motionEnabled ? { layoutId: `${uid}-surface` } : {})}
                transition={morph}
                initial={motionEnabled ? { opacity: 0.9 } : false}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: motionEnabled ? 0 : 1,
                  transition: { duration: motionEnabled ? 0.14 : 0 },
                }}
                style={{ borderRadius: 16 }}
                className="vne-bloom-panel"
                data-motion={motionEnabled}
              >
                <motion.div layout={motionEnabled} className="vne-bloom-panel-inner">
                  <div className="vne-bloom-header">
                    <div>
                      <p id={`${uid}-panel-help`}>До 3 ответов, включая свой</p>
                      <h4 id={`${uid}-panel-title`}>{question}</h4>
                    </div>
                    <Popover.Close asChild>
                      <button
                        type="button"
                        className="vne-bloom-close"
                        aria-label="Закрыть варианты ответа"
                      >
                        <X size={19} aria-hidden="true" />
                      </button>
                    </Popover.Close>
                  </div>
                  <motion.div
                    role="group"
                    aria-label="Варианты ответа"
                    className="vne-bloom-grid"
                    onKeyDown={moveFocus}
                    initial={
                      motionEnabled ? { clipPath: "inset(45% 34% 45% 34% round 12px)" } : false
                    }
                    animate={{ clipPath: "inset(0% 0% 0% 0% round 0px)" }}
                    transition={{
                      delay: motionEnabled ? 0.06 : 0,
                      duration: motionEnabled ? 0.45 : 0,
                      ease: bloomEase,
                    }}
                  >
                    {[...options, "Ввести самостоятельно"].map((option, index) => {
                      const isCustom = index === options.length;
                      const active = isCustom ? custom : selected.includes(option);
                      const limitReached = !active && selectedCount >= QUESTIONNAIRE_MAX_ANSWERS;
                      const distance = Math.hypot(
                        (index % columns) - (columns - 1) / 2,
                        Math.floor(index / columns) -
                          (Math.ceil((options.length + 1) / columns) - 1) / 2,
                      );
                      return (
                        <button
                          key={isCustom ? "custom" : option}
                          ref={(node) => {
                            itemRefs.current[index] = node;
                          }}
                          type="button"
                          className="vne-bloom-option"
                          data-custom={isCustom}
                          aria-pressed={active}
                          aria-disabled={limitReached}
                          aria-describedby={`${uid}-selection-count`}
                          onClick={() => {
                            if (limitReached || disabled) return;
                            if (isCustom) {
                              onCustom(!custom);
                              if (!custom) {
                                customFocusPending.current = true;
                                setOpen(false);
                              }
                            } else {
                              onSelect(option);
                            }
                          }}
                        >
                          <motion.span
                            className="vne-bloom-option-content"
                            initial={
                              motionEnabled
                                ? { opacity: 0, scale: 0.85, filter: "blur(5px)" }
                                : false
                            }
                            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                            transition={
                              motionEnabled
                                ? {
                                    delay: 0.08 + distance * 0.07,
                                    type: "spring",
                                    stiffness: 440,
                                    damping: 34,
                                  }
                                : { duration: 0 }
                            }
                          >
                            <span className="vne-bloom-option-mark" aria-hidden="true">
                              {active ? (
                                <Check size={17} />
                              ) : isCustom ? (
                                <PencilLine size={17} />
                              ) : (
                                String(index + 1).padStart(2, "0")
                              )}
                            </span>
                            <span>{option}</span>
                          </motion.span>
                        </button>
                      );
                    })}
                  </motion.div>
                  <div className="vne-bloom-footer">
                    <p id={`${uid}-selection-count`} role="status">
                      Выбрано {selectedCount} из {QUESTIONNAIRE_MAX_ANSWERS}
                      {selectedCount >= QUESTIONNAIRE_MAX_ANSWERS && (
                        <span>Сними один, чтобы выбрать другой.</span>
                      )}
                    </p>
                    <Popover.Close asChild>
                      <button type="button" className="vne-bloom-done">
                        Готово
                      </button>
                    </Popover.Close>
                  </div>
                </motion.div>
              </motion.div>
            </Popover.Content>
          )}
        </AnimatePresence>
      </Popover.Portal>
    </Popover.Root>
  );
}
