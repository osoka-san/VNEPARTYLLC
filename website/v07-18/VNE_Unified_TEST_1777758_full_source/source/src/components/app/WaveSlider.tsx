import { useRef, useState, type PointerEvent } from "react";
import { motion } from "motion/react";
import "./wave-slider.css";

// Visual adaptation of beUI Wave Slider, registry @beui/range-slider-wave:
// https://beui.dev/components/motion/range-slider
// Native range semantics replace its custom pointer hook; vertical touch scroll stays native.
const BAR_COUNT = 32;
const BAR_SPREAD = 2.6;
const BAR_SPRING = { type: "spring", stiffness: 420, damping: 20, mass: 0.5 } as const;

type WaveSliderProps = {
  id: string;
  label: string;
  labelledBy?: string;
  minLabel: string;
  maxLabel: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  motionEnabled?: boolean;
  required?: boolean;
  error?: string | undefined;
};

export function WaveSlider({
  id,
  label,
  labelledBy,
  minLabel,
  maxLabel,
  value,
  onChange,
  disabled = false,
  motionEnabled = true,
  required = false,
  error,
}: WaveSliderProps) {
  const [dragging, setDragging] = useState(false);
  const [touchPreview, setTouchPreview] = useState<number | null>(null);
  const [exactDraft, setExactDraft] = useState<{ text: string; value: number | null } | null>(null);
  const gesture = useRef<{
    id: number;
    kind: string;
    x: number;
    y: number;
    direction: "pending" | "horizontal" | "vertical";
  } | null>(null);
  const badValue = value !== null && (!Number.isInteger(value) || value < 1 || value > 100);
  const invalid = badValue || !!error;
  const errorMessage = error ?? (badValue ? "Укажи целое число от 1 до 100." : "");
  // Keep incomplete input visible. NaN is an explicit invalid draft, never an
  // unanswered null; the parent validator blocks submission until it is fixed.
  const exactText =
    exactDraft && Object.is(exactDraft.value, value)
      ? exactDraft.text
      : value === null || !Number.isFinite(value)
        ? ""
        : String(value);
  const visualValue = touchPreview ?? (invalid ? null : value);
  const head = visualValue === null ? -1 : ((visualValue - 1) / 99) * (BAR_COUNT - 1);

  const finishGesture = (event: PointerEvent<HTMLInputElement>) => {
    const active = gesture.current;
    if (!active || active.id !== event.pointerId) return;
    if (event.type === "pointerup" && active.direction !== "vertical" && !disabled) {
      // A tap on the neutral midpoint is still an explicit answer even if the
      // browser does not fire change because its internal range value was 50.
      setExactDraft(null);
      onChange(Number(event.currentTarget.value));
    }
    gesture.current = null;
    setDragging(false);
    setTouchPreview(null);
  };

  return (
    <div className="vne-wave-slider" data-empty={value === null} data-disabled={disabled}>
      <div className="vne-wave-readout" aria-hidden="true">
        <span>{invalid ? "Проверь число" : value === null ? "Пока не выбрано" : "Твой выбор"}</span>
        <span className="vne-wave-current">
          {invalid ? "—" : (value ?? "—")}
          <span> / 100</span>
        </span>
      </div>
      <div className="vne-wave-track" data-dragging={dragging}>
        <div className="vne-wave-bars" aria-hidden="true">
          {Array.from({ length: BAR_COUNT }, (_, index) => {
            const distance = Math.abs(index - head);
            const crest =
              visualValue === null ? 0 : Math.exp(-(distance ** 2) / (2 * BAR_SPREAD ** 2));
            return (
              <motion.span
                key={index}
                className="vne-wave-bar"
                data-filled={visualValue !== null && index <= Math.round(head)}
                initial={false}
                animate={{ scaleY: motionEnabled ? 0.22 + crest * (dragging ? 0.78 : 0.6) : 0.4 }}
                transition={
                  motionEnabled
                    ? { ...BAR_SPRING, delay: Math.min(distance * 0.012, 0.12) }
                    : { duration: 0 }
                }
              />
            );
          })}
        </div>
        <input
          id={id}
          className="vne-wave-range"
          type="range"
          min={1}
          max={100}
          step={1}
          value={touchPreview ?? (invalid ? 50 : (value ?? 50))}
          disabled={disabled}
          aria-label={labelledBy ? undefined : label}
          aria-labelledby={labelledBy}
          aria-valuetext={
            invalid
              ? "Некорректное значение. Укажи целое число от 1 до 100."
              : value === null
                ? "Не выбрано. Выбери число от 1 до 100."
                : `${value} из 100`
          }
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-help ${id}-error` : `${id}-help`}
          onChange={(event) => {
            const next = Number(event.target.value);
            const active = gesture.current;
            if (active?.kind === "touch") {
              if (active.direction === "vertical") return;
              setTouchPreview(next);
              if (active.direction === "pending") return;
            }
            setExactDraft(null);
            onChange(next);
          }}
          onPointerDown={(event) => {
            if (disabled || event.button !== 0) return;
            gesture.current = {
              id: event.pointerId,
              kind: event.pointerType,
              x: event.clientX,
              y: event.clientY,
              direction: "pending",
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const active = gesture.current;
            if (!active || active.id !== event.pointerId || active.direction !== "pending") return;
            const dx = Math.abs(event.clientX - active.x);
            const dy = Math.abs(event.clientY - active.y);
            if (Math.max(dx, dy) < 7) return;
            active.direction = dx >= dy ? "horizontal" : "vertical";
            if (active.direction === "vertical") {
              setDragging(false);
              setTouchPreview(null);
            }
          }}
          onPointerUp={finishGesture}
          onPointerCancel={finishGesture}
          onLostPointerCapture={finishGesture}
        />
      </div>
      <div className="vne-wave-endpoints" aria-hidden="true">
        <span>
          <b>1</b>
          {minLabel}
        </span>
        <span>
          <b>100</b>
          {maxLabel}
        </span>
      </div>
      <p className="vne-wave-help" id={`${id}-help`}>
        1 — {minLabel.toLowerCase()}; 100 — {maxLabel.toLowerCase()}.
        {required ? " Ответ обязателен." : " Можно пропустить."}
      </p>
      <div className="vne-wave-input-row">
        <label htmlFor={`${id}-number`}>Точное значение</label>
        <input
          id={`${id}-number`}
          className="vne-wave-number"
          type="text"
          inputMode="numeric"
          value={exactText}
          placeholder="1–100"
          disabled={disabled}
          required={required}
          aria-label={`Точное значение: ${label}`}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : `${id}-help`}
          onChange={(event) => {
            setTouchPreview(null);
            const text = event.target.value;
            const digits = text.trim();
            const parsed = /^[0-9]+$/.test(digits) ? Number(digits) : Number.NaN;
            const next = digits === "" ? null : Number.isFinite(parsed) ? parsed : Number.NaN;
            setExactDraft({ text, value: next });
            onChange(next);
          }}
        />
        <button
          type="button"
          className="vne-wave-clear"
          disabled={disabled || value === null}
          onClick={() => {
            setTouchPreview(null);
            setExactDraft(null);
            onChange(null);
          }}
          aria-label={`Очистить шкалу: ${label}`}
        >
          Очистить
        </button>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="vne-wave-error" role="status">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
