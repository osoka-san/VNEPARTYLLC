import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ChevronRight,
  CircleHelp,
  Copy,
  Filter,
  Pause,
  Play,
  Radio,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusScene, STATUS_CODES, STATUS_INFO, type StatusCode } from "./StatusScene";
import {
  telemetry,
  serverSnapshot,
  exampleEntries,
  selectEntries,
  serializeEntries,
  type LogEntry,
} from "./telemetry";
import "./observatory.css";
import { isNearLogBottom, shouldFollowLogAppend, type LogFollowSnapshot } from "./log-follow";
const LABELS = { info: "Информация", warning: "Предупреждение", error: "Ошибка" };
const AREAS = { public: "Публичный экран", observatory: "Диагностика", fallback: "Восстановление" };
const time = (value: number) => new Date(value).toLocaleTimeString("ru-RU", { hour12: false });
function download(rows: readonly LogEntry[]) {
  const url = URL.createObjectURL(new Blob([serializeEntries(rows)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "vne-browser-observations.json";
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Observatory() {
  const live = useSyncExternalStore(telemetry.subscribe, telemetry.getSnapshot, serverSnapshot);
  const [tab, setTab] = useState<"overview" | "logs" | "status">("overview");
  const [online, setOnline] = useState<boolean | null>(null);
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [code, setCode] = useState<StatusCode>(404);
  useEffect(() => {
    setReadyAt(Date.now());
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const errors = live.filter((row) => row.severity === "error").length;
  const warnings = live.filter((row) => row.severity === "warning").length;
  const latest = live.at(-1);
  return (
    <div className="vne-observatory">
      <header className="obs-top">
        <a className="obs-brand" href="/" aria-label="ВНЕ — на главную">
          ВНЕ<span> / UNIFIED TEST</span>
        </a>
        <div className="obs-top-right">
          <span className="obs-badge">
            <ShieldCheck size={13} /> Диагностика TEST
          </span>
          <a href="/login">
            Сессия <ChevronRight size={14} />
          </a>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="obs-main">
        <div className="obs-heading">
          <div>
            <p className="obs-eyebrow">ВНЕ / КОНТРОЛЬ ИНТЕРФЕЙСА</p>
            <h1>
              Всё важное.
              <br />
              <span>Без лишнего шума.</span>
            </h1>
            <p className="obs-lead">
              Состояние этого браузера, журнал событий и экраны восстановления.
            </p>
          </div>
          <div className="obs-session">
            <Radio size={18} />
            <div>
              <strong>Локальный сеанс</strong>
              <span>{readyAt ? `Открыт в ${time(readyAt)}` : "Ожидание браузера"}</span>
            </div>
          </div>
        </div>
        <nav className="obs-tabs" aria-label="Разделы диагностики">
          {(
            [
              ["overview", "Обзор"],
              ["logs", "Журнал событий"],
              ["status", "Экраны статусов"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
              {id === "logs" && <span>{live.length}</span>}
            </button>
          ))}
        </nav>
        {tab === "overview" && (
          <section aria-label="Обзор браузера">
            <div
              className={`obs-health ${errors || online === false ? "obs-health-attention" : ""}`}
            >
              <div className="obs-health-icon">
                <Activity size={25} />
              </div>
              <div>
                <p className="obs-eyebrow">НАБЛЮДЕНИЯ ЭТОЙ ВКЛАДКИ</p>
                <h2>
                  {online === null
                    ? "Подключаем наблюдение"
                    : online === false
                      ? "Браузер без сети"
                      : errors
                        ? "Есть события с ошибками"
                        : "Интерфейс отвечает"}
                </h2>
                <p>
                  {online === false
                    ? "Соединение отмечено браузером как недоступное. Проверьте подключение."
                    : "Статус основан на событиях открытой страницы. Доступность серверов здесь не измеряется."}
                </p>
              </div>
              <span className="obs-live-dot" aria-hidden="true" />
            </div>
            <div className="obs-metrics">
              <Metric
                label="Событий в памяти"
                value={live.length}
                hint="Не более 200 · до перезагрузки"
              />
              <Metric
                label="Ошибки интерфейса"
                value={errors}
                hint="Наблюдения браузера"
                tone={errors ? "orange" : undefined}
              />
              <Metric label="Предупреждения" value={warnings} hint="Без серверной телеметрии" />
              <Metric
                label="Последнее событие"
                value={latest ? time(latest.at) : "—"}
                hint="Местное время браузера"
              />
            </div>
            <div className="obs-overview-grid">
              <section className="obs-card">
                <div className="obs-section-title">
                  <h2>Что наблюдаем</h2>
                  <span>СЕЙЧАС</span>
                </div>
                <Service
                  title="Отображение страницы"
                  description="React-интерфейс этой вкладки"
                  status={readyAt ? "Открыт" : "Ожидание"}
                  active={!!readyAt}
                />
                <Service
                  title="Соединение браузера"
                  description="navigator.onLine · не проверка API"
                  status={online === null ? "Неизвестно" : online ? "Есть сеть" : "Нет сети"}
                  active={online === true}
                />
                <Service
                  title="Серверы и база данных"
                  description="Производственные сервисы не подключены"
                  status="Нет данных"
                />
              </section>
              <section className="obs-card">
                <div className="obs-section-title">
                  <h2>Пульс событий</h2>
                  <span>ПОСЛЕДНИЕ 40</span>
                </div>
                <div
                  className="obs-pulse"
                  aria-label={`${live.slice(-40).length} последних событий`}
                >
                  {Array.from({ length: 40 }, (_, i) => {
                    const row = live.slice(-40)[i];
                    return (
                      <span
                        key={i}
                        className={row ? `obs-pulse-${row.severity}` : "obs-pulse-empty"}
                        title={row ? `${LABELS[row.severity]} · ${time(row.at)}` : "Нет наблюдения"}
                      />
                    );
                  })}
                </div>
                <div className="obs-legend">
                  <span>
                    <i className="obs-info" /> Информация
                  </span>
                  <span>
                    <i className="obs-warning" /> Внимание
                  </span>
                  <span>
                    <i className="obs-error" /> Ошибка
                  </span>
                </div>
                <p className="obs-muted">
                  Каждый штрих — одно событие. Это не история uptime и не результат проверки
                  инфраструктуры.
                </p>
                <button className="obs-text-button" onClick={() => setTab("logs")}>
                  Открыть журнал <ChevronRight size={16} />
                </button>
              </section>
            </div>
            <div className="obs-privacy">
              <ShieldCheck size={19} />
              <p>
                <strong>Только безопасные признаки событий.</strong> Не сохраняем адреса страниц,
                параметры, тексты ошибок, данные форм, cookie или токены. Записи остаются в памяти
                вкладки и исчезают при перезагрузке.
              </p>
            </div>
          </section>
        )}
        {tab === "logs" && <LogExplorer live={live} />}
        {tab === "status" && (
          <section aria-label="Примеры статусов">
            <div className="obs-status-intro">
              <div>
                <p className="obs-eyebrow">ЛАБОРАТОРИЯ ВОССТАНОВЛЕНИЯ</p>
                <h2>У каждого состояния — выход.</h2>
                <p>
                  Демонстрации интерфейса. Переключение не вызывает ошибку и не меняет HTTP-ответ
                  этой страницы.
                </p>
              </div>
              <CircleHelp size={23} />
            </div>
            <div className="obs-code-picker" aria-label="Выбор примера HTTP-статуса">
              {STATUS_CODES.map((value) => (
                <button key={value} aria-pressed={code === value} onClick={() => setCode(value)}>
                  <strong>{value}</strong>
                  <span>{STATUS_INFO[value].eyebrow}</span>
                </button>
              ))}
            </div>
            <StatusScene key={code} code={code} demo />
            <p className="obs-muted obs-status-foot">
              200 — успешное состояние. 401 требует входа; 403 означает отсутствие разрешения.
              Защита настоящего входа работает отдельно от этих примеров.
            </p>
          </section>
        )}
        <footer className="obs-footer">
          <a href="/">
            <ArrowLeft size={14} /> На сайт
          </a>
          <span>Unified TEST · локальная диагностика браузера</span>
          <a href="/login">Управление сессией</a>
        </footer>
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: string | undefined;
}) {
  return (
    <div className={`obs-metric ${tone === "orange" ? "obs-orange" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </div>
  );
}
function Service({
  title,
  description,
  status,
  active = false,
}: {
  title: string;
  description: string;
  status: string;
  active?: boolean;
}) {
  return (
    <div className="obs-service">
      <i className={active ? "obs-service-active" : ""} />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <span>{status}</span>
    </div>
  );
}
function LogExplorer({ live }: { live: readonly LogEntry[] }) {
  const [source, setSource] = useState<"browser" | "example">("browser");
  const [examples] = useState(() => exampleEntries(Date.now()));
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [minutes, setMinutes] = useState(0);
  const [paused, setPaused] = useState<readonly LogEntry[] | null>(null);
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(Date.now());
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const previousView = useRef<LogFollowSnapshot | null>(null);
  const nearBottom = useRef(true);
  const current = source === "browser" ? live : examples;
  const displayed = paused ?? current;
  const filtered = useMemo(
    () => selectEntries(displayed, query, severity, minutes, clock),
    [displayed, query, severity, minutes, clock],
  );
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);
  useLayoutEffect(() => {
    const viewport = list.current;
    if (!viewport) return;
    const next = {
      view: JSON.stringify([source, query, severity, minutes, !!paused, follow]),
      latestId: displayed.at(-1)?.id,
      visibleLatestId: filtered.at(-1)?.id,
    };
    if (
      shouldFollowLogAppend(
        previousView.current,
        next,
        follow && !paused,
        nearBottom.current,
        !!selected || viewport.contains(document.activeElement),
      )
    ) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    previousView.current = next;
    nearBottom.current = isNearLogBottom(viewport);
  }, [displayed, filtered, source, query, severity, minutes, follow, paused, selected]);
  const changeSource = (value: "browser" | "example") => {
    setSource(value);
    setPaused(null);
    setSelected(null);
    setNotice("");
  };
  const copy = async () => {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(serializeEntries([selected]));
      setNotice("Безопасная запись скопирована.");
    } catch {
      setNotice("Браузер не разрешил копирование. Используйте экспорт.");
    }
  };
  return (
    <section className="obs-log" aria-label="Журнал событий">
      <div className="obs-log-heading">
        <div>
          <p className="obs-eyebrow">EVENT EXPLORER</p>
          <h2>Журнал событий</h2>
          <p>Статичные сообщения, понятные причины, детали по делу.</p>
        </div>
        <div className="obs-source" aria-label="Источник событий">
          <button aria-pressed={source === "browser"} onClick={() => changeSource("browser")}>
            Этот браузер
          </button>
          <button aria-pressed={source === "example"} onClick={() => changeSource("example")}>
            Примеры
          </button>
        </div>
      </div>
      <div className={`obs-source-note ${source === "example" ? "obs-example-note" : ""}`}>
        <span className="obs-dot" />
        {source === "example"
          ? "ДЕМОНСТРАЦИЯ · 8 синтетических записей, не реальные ошибки сайта."
          : "ЛОКАЛЬНО · только события этой вкладки, без запросов к серверам."}
      </div>
      <div className="obs-toolbar">
        <label className="obs-search">
          <Search size={17} />
          <span className="obs-sr">Поиск по событиям и correlation ID</span>
          <input
            placeholder="Найти событие, код, correlation ID…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={160}
          />
        </label>
        <label className="obs-select">
          <Filter size={15} />
          <span className="obs-sr">Уровень события</span>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">Все уровни</option>
            <option value="info">Информация</option>
            <option value="warning">Предупреждения</option>
            <option value="error">Ошибки</option>
          </select>
        </label>
        <label className="obs-select">
          <span className="obs-sr">Период событий</span>
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            <option value={0}>Весь сеанс</option>
            <option value={15}>15 минут</option>
            <option value={60}>1 час</option>
          </select>
        </label>
      </div>
      <div className="obs-log-actions">
        <div>
          <button
            className="obs-action"
            aria-pressed={!!paused}
            onClick={() => setPaused(paused ? null : current)}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}{" "}
            {paused ? "Продолжить" : "Пауза вида"}
          </button>
          <label className="obs-follow">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />{" "}
            Следить за новыми
          </label>
        </div>
        <div>
          <button
            className="obs-action"
            disabled={!filtered.length}
            onClick={() => {
              download(filtered);
              setNotice("Экспортированы только видимые безопасные записи.");
            }}
          >
            <ArrowDownToLine size={14} /> JSON
          </button>
          <button
            className="obs-action"
            disabled={source !== "browser" || !live.length}
            onClick={() => {
              telemetry.clear();
              setPaused(null);
              setSelected(null);
              setNotice("Локальный журнал очищен.");
            }}
          >
            <Trash2 size={14} /> Очистить
          </button>
        </div>
      </div>
      {paused && (
        <p className="obs-pause-note" role="status">
          Отображение приостановлено. Сбор локальных событий продолжается; буфер ограничен 200
          записями.
        </p>
      )}
      <div
        className="obs-log-list"
        ref={list}
        onScroll={(event) => {
          nearBottom.current = isNearLogBottom(event.currentTarget);
        }}
        tabIndex={0}
        aria-label="События; выберите запись для просмотра"
      >
        <div className="obs-log-columns" aria-hidden="true">
          <span>ВРЕМЯ</span>
          <span>УРОВЕНЬ</span>
          <span>СОБЫТИЕ</span>
          <span>КОД</span>
          <span />
        </div>
        {filtered.length ? (
          filtered.map((row) => (
            <button
              className="obs-log-row"
              key={row.id}
              onClick={(event) => {
                lastTrigger.current = event.currentTarget;
                setSelected(row);
                setNotice("");
              }}
            >
              <time dateTime={new Date(row.at).toISOString()}>{time(row.at)}</time>
              <span className={`obs-level obs-level-${row.severity}`}>{LABELS[row.severity]}</span>
              <span className="obs-row-main">
                <strong>{row.message}</strong>
                <small>
                  {row.correlation} · {AREAS[row.area]}
                </small>
              </span>
              <span className="obs-row-code">{row.code ?? "—"}</span>
              <ChevronRight size={16} />
            </button>
          ))
        ) : (
          <div className="obs-empty">
            <Search size={27} />
            <h3>
              {query || severity !== "all" || minutes ? "Совпадений нет" : "Пока без событий"}
            </h3>
            <p>
              {query || severity !== "all" || minutes
                ? "Измените фильтры или поисковую фразу."
                : "Откройте другие страницы сайта или изучите демонстрационные записи."}
            </p>
            {(query || severity !== "all" || minutes > 0) && (
              <button
                className="obs-text-button"
                onClick={() => {
                  setQuery("");
                  setSeverity("all");
                  setMinutes(0);
                }}
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </div>
      <div className="obs-log-bottom">
        <span>
          {filtered.length} из {displayed.length} записей
        </span>
        <span>
          {source === "example" ? "Синтетические данные" : `Память вкладки · максимум 200`}
        </span>
      </div>
      <p className="obs-notice" role="status">
        {notice}
      </p>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="obs-detail"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (lastTrigger.current?.isConnected) lastTrigger.current.focus();
            else list.current?.focus();
          }}
        >
          {selected && (
            <>
              <p className="obs-eyebrow">
                {selected.origin === "example" ? "СИНТЕТИЧЕСКИЙ ПРИМЕР" : "НАБЛЮДЕНИЕ БРАУЗЕРА"}
              </p>
              <DialogTitle>{selected.message}</DialogTitle>
              <span className={`obs-level obs-level-${selected.severity}`}>
                {LABELS[selected.severity]}
              </span>
              <dl>
                {[
                  ["Время", new Date(selected.at).toLocaleString("ru-RU")],
                  ["Код", selected.code ?? "Не HTTP-событие"],
                  ["Событие", selected.kind],
                  ["Область", AREAS[selected.area]],
                  ["Correlation ID", selected.correlation],
                  ["Источник", selected.origin === "example" ? "Демонстрация" : "Этот браузер"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <DialogDescription className="obs-muted">
                Correlation ID объединяет только показанные примеры либо обозначает локальное
                событие. Это не ID серверного запроса. Исходные сообщения ошибок и данные
                пользователя не собираются.
              </DialogDescription>
              <div className="obs-detail-actions">
                <button className="obs-action" onClick={copy}>
                  <Copy size={15} /> Копировать JSON
                </button>
                <button className="obs-action" onClick={() => download([selected])}>
                  <ArrowDownToLine size={15} /> Скачать
                </button>
              </div>
              <p role="status" className="obs-notice">
                {notice}
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
