import { useEffect, useRef } from "react";

/** Официальный виджет Telegram Login; скрипт подключается только после гидратации. */
export function TelegramLoginButton({
  bot,
  onAuth,
}: {
  bot: string;
  onAuth: (data: Record<string, unknown>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onAuth);
  cb.current = onAuth;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = window as unknown as Record<string, unknown>;
    w["vneTelegramAuth"] = (u: Record<string, unknown>) => cb.current(u);
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "6");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-onauth", "vneTelegramAuth(user)");
    el.replaceChildren(s);
    return () => {
      el.replaceChildren();
      delete w["vneTelegramAuth"];
    };
  }, [bot]);
  return <div ref={ref} className="min-h-11" aria-label="Войти через Telegram" />;
}
