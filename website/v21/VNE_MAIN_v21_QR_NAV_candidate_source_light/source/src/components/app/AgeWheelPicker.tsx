import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, X } from "lucide-react";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import "./age-wheel-picker.css";

// Interaction reference: https://beui.dev/components/motion/wheel-picker
// Native scrolling supplies touch momentum and snapping; no synthetic fling or sound.
const ROW_HEIGHT = 44;
const AGES = Array.from({ length: 100 }, (_, index) => index + 1);
const clampAge = (age: number) => Math.max(1, Math.min(100, Math.round(age)));
const validAge = (age: number | null): age is number =>
  age !== null && Number.isInteger(age) && age >= 1 && age <= 100;

function ageLabel(age: number) {
  const lastTwo = age % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 14
      ? "лет"
      : age % 10 === 1
        ? "год"
        : age % 10 >= 2 && age % 10 <= 4
          ? "года"
          : "лет";
  return `${age} ${suffix}`;
}

function AgeDrum({
  value,
  onChange,
  reduced,
  helpId,
}: {
  value: number;
  onChange: (age: number) => void;
  reduced: boolean;
  helpId: string;
}) {
  const id = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const initial = useRef(value);
  const frame = useRef(0);
  const [position, setPosition] = useState(value - 1);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (initial.current - 1) * ROW_HEIGHT;
    return () => cancelAnimationFrame(frame.current);
  }, []);

  const select = (age: number, smooth = true) => {
    const next = clampAge(age);
    onChange(next);
    scrollRef.current?.scrollTo({
      top: (next - 1) * ROW_HEIGHT,
      behavior: reduced || !smooth ? "auto" : "smooth",
    });
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const next =
      event.key === "ArrowUp"
        ? value - 1
        : event.key === "ArrowDown"
          ? value + 1
          : event.key === "PageUp"
            ? value - 10
            : event.key === "PageDown"
              ? value + 10
              : event.key === "Home"
                ? 1
                : event.key === "End"
                  ? 100
                  : null;
    if (next === null) return;
    event.preventDefault();
    select(next, false);
  };

  return (
    <div className="vne-age-drum" data-reduced={reduced}>
      <div className="vne-age-drum-band" aria-hidden="true" />
      <div
        ref={scrollRef}
        className="vne-age-scroll"
        role="listbox"
        tabIndex={0}
        aria-label="Возраст от 1 до 100 лет"
        aria-describedby={helpId}
        aria-activedescendant={`${id}-age-${value}`}
        onKeyDown={handleKey}
        onScroll={(event) => {
          const currentPosition = event.currentTarget.scrollTop / ROW_HEIGHT;
          onChange(clampAge(currentPosition + 1));
          cancelAnimationFrame(frame.current);
          frame.current = requestAnimationFrame(() => setPosition(currentPosition));
        }}
      >
        {AGES.map((age) => {
          const distance = age - 1 - position;
          return (
            <div
              id={`${id}-age-${age}`}
              key={age}
              role="option"
              aria-selected={value === age}
              className="vne-age-option"
              onClick={() => select(age)}
              style={
                {
                  "--age-rotation": `${Math.max(-70, Math.min(70, distance * -22))}deg`,
                  "--age-opacity": Math.max(0.16, 1 - Math.abs(distance) * 0.27),
                  "--age-scale": Math.max(0.75, 1 - Math.abs(distance) * 0.075),
                } as CSSProperties
              }
            >
              <span>{ageLabel(age)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgeWheelPicker({
  value,
  onChange,
  disabled = false,
  required = true,
}: {
  value: number | null;
  onChange: (age: number | null) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const { reduced, settings } = useMotionEnv();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(validAge(value) ? value : 25);
  const [input, setInput] = useState(String(validAge(value) ? value : 25));
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const manualAge = /^\d{1,3}$/.test(input) ? Number(input) : null;
  const candidate = manual ? manualAge : draft;
  const accepted = validAge(value) ? value : null;
  const motionOff =
    reduced || !settings.menuMotion || !settings.dialogMotion || settings.duration <= 0;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  useEffect(() => {
    if (manual) inputRef.current?.focus();
  }, [manual]);

  const changeDraft = useCallback((age: number) => {
    setDraft(age);
    setInput(String(age));
  }, []);
  const changeOpen = (next: boolean) => {
    if (disabled && next) return;
    if (next) {
      changeDraft(accepted ?? 25);
      setManual(false);
    }
    setOpen(next);
  };
  const confirm = () => {
    if (disabled || !validAge(candidate)) return;
    onChange(candidate);
    setOpen(false);
  };
  const clear = () => {
    if (disabled) return;
    onChange(null);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <div className="vne-age-control">
        <Dialog.Trigger asChild>
          <button type="button" className="vne-age-trigger" disabled={disabled}>
            <span>{accepted === null ? "Указать возраст" : ageLabel(accepted)}</span>
            <ChevronDown size={17} aria-hidden="true" />
          </button>
        </Dialog.Trigger>
        {accepted !== null && (
          <button
            type="button"
            className="vne-age-clear"
            onClick={clear}
            disabled={disabled}
            aria-label="Очистить возраст"
            title="Очистить возраст"
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="vne-age-overlay" data-reduced={motionOff} />
        <Dialog.Content
          ref={dialogRef}
          className="vne-age-dialog"
          data-reduced={motionOff}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            dialogRef.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus();
          }}
        >
          <Dialog.Title className="vne-age-title">Сколько тебе лет?</Dialog.Title>
          <Dialog.Description className="vne-age-description">
            Возраст сохранится после подтверждения.
          </Dialog.Description>
          <Dialog.Close className="vne-age-close" aria-label="Закрыть без изменений">
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
          {manual ? (
            <div className="vne-age-manual">
              <label htmlFor={`${id}-input`}>Возраст, полных лет</label>
              <input
                ref={inputRef}
                id={`${id}-input`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    confirm();
                  }
                }}
                aria-describedby={`${id}-manual-help`}
                aria-invalid={!validAge(manualAge)}
              />
              <p id={`${id}-manual-help`}>Введите целое число от 1 до 100.</p>
            </div>
          ) : (
            <AgeDrum
              value={draft}
              onChange={changeDraft}
              reduced={motionOff}
              helpId={`${id}-help`}
            />
          )}
          <p id={`${id}-help`} className="vne-age-help">
            {manual
              ? "Или выберите возраст прокруткой."
              : "Прокрутите список или используйте клавиши ↑ ↓."}
          </p>
          <button
            type="button"
            className="vne-age-mode"
            onClick={() => {
              if (manual && validAge(manualAge)) changeDraft(manualAge);
              setManual((current) => !current);
            }}
          >
            {manual ? "Выбрать прокруткой" : "Ввести числом"}
          </button>
          <button
            type="button"
            className="vne-age-confirm"
            disabled={disabled || !validAge(candidate)}
            onClick={confirm}
          >
            {validAge(candidate) ? `Подтвердить · ${ageLabel(candidate)}` : "Подтвердить возраст"}
          </button>
          {!required && (
            <button type="button" className="vne-age-skip" onClick={clear} disabled={disabled}>
              Не указывать возраст
            </button>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
