import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useSiteAccess } from "@/lib/site-admin";
import { useEffect, useRef, useState } from "react";
import { Archive, History, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { templateImage } from "@/lib/qr-studio/catalog";
import { ENGINE_VERSION, type Pattern } from "@/lib/qr-studio/pattern";
import {
  listPatterns,
  patternHistory,
  savePattern,
  type SavedPattern,
  type SaveRequest,
} from "@/lib/qr-studio/library";

type Props = {
  onOpen: (record: SavedPattern, base?: SavedPattern) => void;
  refreshKey: number;
  onChanged: () => void;
  onPreview: (pattern: Pattern) => void;
};
export function PatternLibrary({ onOpen, refreshKey, onChanged, onPreview }: Props) {
  const [items, setItems] = useState<SavedPattern[]>([]),
    [hasMore, setHasMore] = useState(false),
    [page, setPage] = useState(0),
    [archived, setArchived] = useState(false),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<SavedPattern[]>([]),
    [historyId, setHistoryId] = useState(""),
    [reload, setReload] = useState(0);
  useSiteLoading(loading || busy, "Открываем библиотеку макетов");
  const serial = useRef(0),
    mounted = useRef(true),
    pending = useRef<{ key: string; request: SaveRequest } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      serial.current++;
    };
  }, []);
  useEffect(() => {
    const id = ++serial.current;
    setLoading(true);
    setError("");
    void listPatterns(page, archived, search)
      .then((r) => {
        if (id === serial.current && mounted.current) {
          setItems(r.items);
          setHasMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (id === serial.current && mounted.current) setError(e.message);
      })
      .finally(() => {
        if (id === serial.current && mounted.current) setLoading(false);
      });
  }, [page, archived, search, refreshKey, reload]);
  async function toggle(r: SavedPattern) {
    setBusy(true);
    setError("");
    try {
      const key = JSON.stringify([r.id, r.version, !r.archived]);
      if (pending.current?.key !== key)
        pending.current = {
          key,
          request: {
            id: r.id,
            expectedVersion: r.version,
            operationId: crypto.randomUUID(),
            pattern: r.pattern,
            archived: !r.archived,
            engineVersion: ENGINE_VERSION,
          },
        };
      await savePattern(pending.current.request);
      pending.current = null;
      setHistory([]);
      setHistoryId("");
      onChanged();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function showHistory(r: SavedPattern) {
    setBusy(true);
    setError("");
    try {
      const rows = await patternHistory(r.id);
      if (mounted.current) {
        setHistory(rows);
        setHistoryId(r.id);
      }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "История недоступна.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="qs-library">
      <div className="qs-library-heading">
        <div>
          <h2>Библиотека паттернов</h2>
          <p>Сохранённые оформления доступны с любого устройства после входа.</p>
        </div>
        <Button
          variant="outline"
          disabled={loading || busy}
          onClick={() => setReload((v) => v + 1)}
        >
          <RefreshCw size={16} />
          Обновить
        </Button>
      </div>
      <div className="qs-library-tools">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setSearch(query.trim());
          }}
        >
          <Input
            aria-label="Поиск по названию и мероприятию"
            value={query}
            maxLength={100}
            placeholder="Название или мероприятие"
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button variant="outline">Найти</Button>
        </form>
        <div className="qs-switch">
          <label htmlFor="pattern-archive">Архив</label>
          <Switch
            id="pattern-archive"
            checked={archived}
            onCheckedChange={(v) => {
              setArchived(v);
              setPage(0);
              setHistory([]);
              setHistoryId("");
            }}
          />
        </div>
      </div>
      {error && (
        <p className="qs-notice" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="qs-library-empty" role="status">
          Загружаем паттерны…
        </p>
      ) : items.length === 0 ? (
        <div className="qs-library-empty">
          {error
            ? "Библиотека не загрузилась. Можно повторить запрос."
            : search
              ? "По этому запросу ничего не найдено."
              : archived
                ? "Архив пока пуст."
                : "Здесь появится ваш первый сохранённый паттерн. Создайте его в редакторе."}
        </div>
      ) : (
        <div className="qs-library-grid">
          {items.map((r) => (
            <PatternCard
              key={r.id}
              record={r}
              busy={busy}
              onOpen={() => onOpen(r)}
              onPreview={() => onPreview(r.pattern)}
              onToggle={() => void toggle(r)}
              onHistory={() => void showHistory(r)}
            />
          ))}
        </div>
      )}
      <div className="qs-pagination">
        <Button
          variant="outline"
          disabled={page === 0 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Назад
        </Button>
        <span>Страница {page + 1}</span>
        <Button
          variant="outline"
          disabled={!hasMore || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Далее
        </Button>
      </div>
      {historyId && history.length > 0 && (
        <section className="qs-history">
          <div className="qs-library-heading">
            <h3>История · {history[0]?.pattern.name}</h3>
            <Button variant="ghost" onClick={() => setHistoryId("")}>
              Закрыть
            </Button>
          </div>
          <p className="qs-hint">
            Последние 50 версий. Открытие старой версии не меняет библиотеку. Сохранение из
            редактора создаст новую.
          </p>
          {history.map((r) => (
            <div className="qs-history-row" key={r.version}>
              <div>
                <strong>
                  Версия {r.version}
                  {r.archived ? " · архив" : ""}
                </strong>
                <p>
                  {r.pattern.name} · {new Date(r.createdAt).toLocaleString("ru-RU")}
                </p>
              </div>
              <Button variant="outline" disabled={busy} onClick={() => onOpen(r, history[0])}>
                {r.engineVersion === ENGINE_VERSION ? "Открыть в редакторе" : "Обновить оформление"}
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
function PatternCard({
  record: r,
  busy,
  onOpen,
  onToggle,
  onHistory,
  onPreview,
}: {
  record: SavedPattern;
  busy: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onHistory: () => void;
  onPreview: () => void;
}) {
  const access = useSiteAccess();
  const compatible = r.engineVersion === ENGINE_VERSION;
  return (
    <article className="qs-library-card">
      <div className="qs-library-preview">
        {compatible ? (
          <img
            src={
              r.pattern.template
                ? templateImage(r.pattern.template, "working")
                : `/assets/qr-studio/current-${r.pattern.geometry}-${r.pattern.palette}.svg`
            }
            alt="Образец стиля: на удачу"
            loading="lazy"
          />
        ) : (
          <p>
            Сохранённый паттерн предыдущего движка. Его можно перенести в новый стиль отдельной
            копией.
          </p>
        )}
      </div>
      <div className="qs-library-details">
        <div className="qs-library-card-title">
          <h3>{r.pattern.name}</h3>
          <span>v{r.version}</span>
        </div>
        <p>{r.pattern.event || "Без мероприятия"}</p>
        {compatible && <small>Образец шаблона · ваши настройки видны на карточке</small>}
        <small>{new Date(r.createdAt).toLocaleString("ru-RU")}</small>
        <div className="qs-actions">
          <Button disabled={busy} onClick={onOpen}>
            {compatible ? "Открыть" : "Обновить оформление"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onPreview}>
            {compatible ? "На карточке" : "Примерить обновлённый стиль"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={onHistory}>
            <History size={16} />
            История
          </Button>
          <Button
            variant="ghost"
            disabled={!access.can("qr.write") || !compatible || busy}
            onClick={onToggle}
          >
            {r.archived ? <RotateCcw size={16} /> : <Archive size={16} />}{" "}
            {r.archived ? "Вернуть" : "В архив"}
          </Button>
        </div>
      </div>
    </article>
  );
}
