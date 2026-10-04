import { useRef, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { AnimatedBackground } from "./AnimatedBackground";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { key: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.key === value),
  );
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
      return;
    event.preventDefault();
    let next = activeIndex;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else
      next =
        (activeIndex +
          (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) +
          options.length) %
        options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.key);
    refs.current[next]?.focus();
  };
  return (
    <AnimatedBackground
      className="flex min-w-max gap-1"
      activeIndex={activeIndex}
      role="radiogroup"
      ariaLabel={label}
    >
      {options.map((option, index) => (
        <Button
          key={option.key}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="radio"
          variant="ghost"
          size="sm"
          className="min-h-11"
          tabIndex={activeIndex === index ? 0 : -1}
          aria-checked={activeIndex === index}
          onKeyDown={onKeyDown}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </AnimatedBackground>
  );
}
