import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
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
  const [status, setStatus] = useState("");
  const returnFocus = useRef<HTMLElement | null>(null);
  const notice = useRef<HTMLElement>(null);
  const { reduced, settings } = useMotionEnv();

  useEffect(() => {
    setVisible(!readCookieNotice(cookieNoticeStorage()));
    const sync = (event: StorageEvent) => {
      if (event.key === COOKIE_NOTICE_KEY || event.key === null) {
        setVisible(!parseCookieNotice(event.newValue));
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const openNotice = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setStatus("");
    setVisible(true);
    requestAnimationFrame(() => notice.current?.focus({ preventScroll: true }));
  };
  const accept = () => {
    const saved = saveCookieNotice(cookieNoticeStorage());
    setVisible(false);
    setStatus(
      saved
        ? "Выбор сохранён."
        : "Выбор принят для текущего просмотра. Браузер не разрешил сохранить его между посещениями.",
    );
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    else document.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true });
    returnFocus.current = null;
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
          aria-describedby="vne-cookie-description vne-cookie-scope"
          data-motion={!reduced && settings.menuMotion}
        >
          <div className="vne-cookie-copy">
            <h2 id="vne-cookie-heading">
              <span aria-hidden="true" />
              Немного памяти / Cookies
            </h2>
            <p id="vne-cookie-description">{cookieIntroduction}</p>
            <p id="vne-cookie-scope" className="vne-cookie-scope">
              {cookieNoticeScope}
            </p>
            <Link to="/cookies" className="vne-cookie-details">
              О файлах cookie <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          </div>
          <button
            type="button"
            className="vne-cookie-accept"
            onClick={accept}
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
