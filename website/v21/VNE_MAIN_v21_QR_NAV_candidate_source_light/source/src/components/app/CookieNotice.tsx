import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cookieIntroduction, cookieNoticeScope } from "@/content/cookies";
import {
  COOKIE_NOTICE_KEY,
  cookieNoticeStorage,
  parseCookieNotice,
  readCookieNotice,
  saveCookieNotice,
} from "@/lib/cookie-notice";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import "./cookie-notice.css";

const CookieNoticeContext = createContext({ openNotice: () => {} });
export const useCookieNotice = () => useContext(CookieNoticeContext);

export function CookieNoticeProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [phase, setPhase] = useState<"idle" | "accepted" | "leaving">("idle");
  const [status, setStatus] = useState("");
  const accepting = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const returnFocus = useRef<HTMLElement | null>(null);
  const notice = useRef<HTMLElement>(null);
  const disclosure = useRef<HTMLButtonElement>(null);
  const { reduced, settings } = useMotionEnv();
  const motion = !reduced && settings.menuMotion;

  const restoreFocus = () => {
    if (notice.current?.contains(document.activeElement)) {
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      else document.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true });
    }
    returnFocus.current = null;
  };

  const resetInteraction = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    accepting.current = false;
    setPhase("idle");
    setExpanded(false);
  };

  useEffect(() => {
    setVisible(!readCookieNotice(cookieNoticeStorage()));
    const sync = (event: StorageEvent) => {
      if (event.key === COOKIE_NOTICE_KEY || event.key === null) {
        const acknowledged = parseCookieNotice(event.newValue);
        if (acknowledged) restoreFocus();
        else if (notice.current?.contains(document.activeElement))
          disclosure.current?.focus({ preventScroll: true });
        resetInteraction();
        setVisible(!acknowledged);
      }
    };
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const openNotice = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    resetInteraction();
    setStatus("");
    setExpanded(true);
    setVisible(true);
    requestAnimationFrame(() => notice.current?.focus({ preventScroll: true }));
  };
  const accept = () => {
    // Persist immediately, before motion or navigation; rapid taps never write twice.
    if (accepting.current) return;
    accepting.current = true;
    const saved = saveCookieNotice(cookieNoticeStorage());
    setPhase("accepted");
    setStatus(
      saved
        ? "Выбор сохранён."
        : "Выбор принят для текущего просмотра. Браузер не разрешил сохранить его между посещениями.",
    );
    const finish = () => {
      // Do not steal focus if the visitor already moved elsewhere while it faded.
      restoreFocus();
      setVisible(false);
    };
    timers.current.push(
      setTimeout(() => {
        if (motion) {
          restoreFocus();
          setPhase("leaving");
        } else finish();
      }, 320),
    );
    if (motion) timers.current.push(setTimeout(finish, 680));
  };

  return (
    <CookieNoticeContext.Provider value={{ openNotice }}>
      {children}
      {visible && (
        <section
          ref={notice}
          tabIndex={-1}
          className="vne-cookie-notice"
          role="region"
          aria-labelledby="vne-cookie-heading"
          data-expanded={expanded}
          data-phase={phase}
          inert={phase === "leaving"}
          data-motion={motion}
          onPointerLeave={(event) => {
            if (
              event.pointerType === "mouse" &&
              !notice.current?.contains(document.activeElement) &&
              !accepting.current
            )
              setExpanded(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && expanded && !accepting.current) {
              event.stopPropagation();
              disclosure.current?.focus({ preventScroll: true });
              setExpanded(false);
            }
          }}
        >
          <div className="vne-cookie-copy">
            <h2 id="vne-cookie-heading" className="vne-cookie-heading">
              <button
                ref={disclosure}
                type="button"
                className="vne-cookie-disclosure"
                aria-expanded={expanded}
                aria-controls="vne-cookie-body"
                aria-disabled={phase !== "idle"}
                onPointerEnter={(event) => {
                  if (
                    event.pointerType === "mouse" &&
                    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
                    !accepting.current
                  )
                    setExpanded(true);
                }}
                onClick={() => {
                  if (!accepting.current) setExpanded((value) => !value);
                }}
              >
                <span className="vne-cookie-heading-label">
                  <span className="vne-cookie-dot" aria-hidden="true" />
                  Немного памяти / Cookies
                </span>
                <ChevronDown className="vne-cookie-chevron" size={16} aria-hidden="true" />
              </button>
            </h2>
            <div
              id="vne-cookie-body"
              className="vne-cookie-body"
              hidden={!expanded}
              tabIndex={0}
              aria-labelledby="vne-cookie-heading"
            >
              <p id="vne-cookie-description">{cookieIntroduction}</p>
              <p id="vne-cookie-scope" className="vne-cookie-scope">
                {cookieNoticeScope}
              </p>
              <Link to="/cookies" className="vne-cookie-details">
                О файлах cookie <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <button
            type="button"
            className="vne-cookie-accept"
            onClick={accept}
            aria-disabled={phase !== "idle"}
            aria-label="ОК — принять технические cookie и сохранение настроек"
          >
            <span className="vne-cookie-accept-hint" aria-hidden="true">
              Принять <ArrowUpRight size={16} />
            </span>
            <span className="vne-cookie-ok" aria-hidden="true">
              ОК
            </span>
          </button>
        </section>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
    </CookieNoticeContext.Provider>
  );
}
