import { useEffect, useId, useState, type CSSProperties } from "react";
import "./status-scene.css";

export const STATUS_CODES = [200, 401, 403, 404, 429, 500, 503] as const;
export type StatusCode = (typeof STATUS_CODES)[number];
export const STATUS_INFO: Record<
  StatusCode,
  { eyebrow: string; title: string; description: string }
> = {
  200: {
    eyebrow: "Всё в порядке",
    title: "Связь установлена",
    description: "Запрос выполнен успешно. Можно продолжить знакомство с ВНЕ.",
  },
  401: {
    eyebrow: "Нужен вход",
    title: "Представьтесь, чтобы продолжить",
    description: "Для этой страницы нужен вход. Войдите в Unified TEST и повторите переход.",
  },
  403: {
    eyebrow: "Доступ ограничен",
    title: "Эта дверь пока закрыта",
    description:
      "У текущего аккаунта нет доступа к этому разделу. Вернитесь к публичным страницам или свяжитесь с командой.",
  },
  404: {
    eyebrow: "Страница не найдена",
    title: "Здесь пока пусто",
    description:
      "Возможно, адрес изменился или в ссылке есть опечатка. Начните с главной страницы или найдите событие.",
  },
  429: {
    eyebrow: "Слишком много запросов",
    title: "Небольшая пауза",
    description:
      "Сервис получил слишком много запросов. Подождите немного, прежде чем пробовать снова.",
  },
  500: {
    eyebrow: "Ошибка сервера",
    title: "Что-то пошло не так",
    description: "Не удалось загрузить страницу. Попробуйте ещё раз или вернитесь на главную.",
  },
  503: {
    eyebrow: "Сервис недоступен",
    title: "Свет скоро вернётся",
    description:
      "Сервис временно недоступен. Попробуйте вернуться позже; если проблема сохраняется, свяжитесь с командой.",
  },
};

// Original 5 × 7 tile alphabet. No physics engine, randomness or third-party artwork.
const DIGITS: Record<string, readonly string[]> = {
  "0": ["01110", "11011", "11011", "11011", "11011", "11011", "01110"],
  "1": ["00110", "01110", "00110", "00110", "00110", "00110", "01111"],
  "2": ["11110", "00011", "00011", "01110", "11000", "11000", "11111"],
  "3": ["11110", "00011", "00011", "01110", "00011", "00011", "11110"],
  "4": ["11011", "11011", "11011", "11111", "00011", "00011", "00011"],
  "5": ["11111", "11000", "11000", "11110", "00011", "00011", "11110"],
  "9": ["01110", "11011", "11011", "01111", "00011", "00011", "01110"],
};

function useSceneMotion() {
  // Static during SSR and hydration, even before matchMedia is available.
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const root = document.documentElement;
    const read = () => setAllowed(!query.matches && root.dataset["reduceMotion"] !== "true");
    read();
    query.addEventListener("change", read);
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    return () => {
      query.removeEventListener("change", read);
      observer.disconnect();
    };
  }, []);
  return allowed;
}

export interface StatusSceneProps {
  code: StatusCode;
  demo?: boolean;
  onRetry?: () => void;
}

export function StatusScene({ code, demo = false, onRetry }: StatusSceneProps) {
  const titleId = useId();
  const descriptionId = useId();
  const motionAllowed = useSceneMotion();
  const [replay, setReplay] = useState(0);
  const info = STATUS_INFO[code];
  const Heading = demo ? "h2" : "h1";
  const replayScene = () => {
    if (motionAllowed) setReplay((value) => value + 1);
  };
  const tiles = String(code)
    .split("")
    .flatMap((digit, digitIndex) =>
      (DIGITS[digit] ?? DIGITS["0"] ?? []).flatMap((row, rowIndex) =>
        [...row].flatMap((cell, columnIndex) =>
          cell === "1"
            ? [
                {
                  x: 38 + digitIndex * 156 + columnIndex * 24,
                  y: 48 + rowIndex * 24,
                  delay: (6 - rowIndex) * 27 + digitIndex * 68 + columnIndex * 19,
                  shift: (((columnIndex + rowIndex + digitIndex) % 3) - 1) * 12,
                },
              ]
            : [],
        ),
      ),
    );

  return (
    <section
      className="vne-status-scene"
      data-tone={code === 200 ? "success" : "error"}
      data-demo={demo ? "true" : "false"}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="vne-status-scene__body">
        <p className="vne-status-scene__eyebrow">
          ВНЕ / {demo ? "Демонстрация состояния" : info.eyebrow}
        </p>
        <div
          className="vne-status-scene__art"
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") replayScene();
          }}
        >
          <svg viewBox="0 0 500 270" aria-hidden="true" focusable="false">
            <path
              className="vne-status-scene__guide"
              d="M16 24H484M16 242H484M22 18V248M478 18V248"
            />
            <g
              key={`${code}-${replay}-${motionAllowed}`}
              data-moving={motionAllowed ? "true" : "false"}
            >
              {tiles.map((tile, index) => (
                <rect
                  key={`${tile.x}-${tile.y}`}
                  className="vne-status-scene__tile"
                  x={tile.x}
                  y={tile.y}
                  width="20"
                  height="20"
                  rx="2"
                  style={
                    {
                      "--tile-delay": `${tile.delay}ms`,
                      "--tile-shift": `${tile.shift}px`,
                      "--tile-opacity": index % 6 === 0 ? 0.64 : 1,
                    } as CSSProperties
                  }
                />
              ))}
            </g>
            <path className="vne-status-scene__guide" d="M38 228H462" />
          </svg>
          <span className="vne-status-scene__code">
            HTTP {code} · {code === 200 ? "Успех" : info.eyebrow}
          </span>
        </div>
        <Heading id={titleId} className="vne-status-scene__title">
          {info.title}
        </Heading>
        <p id={descriptionId} className="vne-status-scene__description">
          {info.description}
        </p>
        {demo && (
          <p className="vne-status-scene__demo-note">
            Пример интерфейса. Реальный запрос не выполняется.
          </p>
        )}
        <nav className="vne-status-scene__actions" aria-label={`Действия для состояния ${code}`}>
          {onRetry && code !== 200 && (
            <button type="button" className="vne-status-scene__primary" onClick={onRetry}>
              Попробовать снова
            </button>
          )}
          <a
            className={
              onRetry && code !== 200 ? "vne-status-scene__secondary" : "vne-status-scene__primary"
            }
            href="/"
          >
            На главную <span aria-hidden="true">↗</span>
          </a>
          {code === 401 ? (
            <a className="vne-status-scene__secondary" href="/login">
              Войти в превью
            </a>
          ) : code === 403 || code === 503 ? (
            <a className="vne-status-scene__secondary" href="/contact">
              Связаться с командой
            </a>
          ) : (
            <a className="vne-status-scene__secondary" href="/events">
              К событиям
            </a>
          )}
        </nav>
        <button
          type="button"
          className="vne-status-scene__replay"
          disabled={!motionAllowed}
          onClick={replayScene}
        >
          <span aria-hidden="true">↻</span>{" "}
          {motionAllowed ? "Повторить анимацию" : "Статичный режим"}
        </button>
      </div>
    </section>
  );
}
