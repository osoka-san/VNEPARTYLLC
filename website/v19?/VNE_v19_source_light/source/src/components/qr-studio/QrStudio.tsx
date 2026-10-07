import { useSiteLoading, Wormhole } from "@/components/loading/SiteLoading";
import { useSiteAccess } from "@/lib/site-admin";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TemplateCatalog } from "./TemplateCatalog";
import {
  QR_TEMPLATES,
  getQrTemplate,
  isMaterialTemplate,
  type QrTemplate,
} from "@/lib/qr-studio/catalog";
import { savePreviewDraft, loadPreviewDraft } from "@/lib/qr-studio/ticket-preview";
import type { TemplateId } from "@/lib/qr-studio/pattern";
import { Download, Upload, Check, ScanLine, Grid2X2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ENGINE_VERSION,
  PALETTES,
  PATTERNS,
  parsePattern,
  TEST_PAYLOADS,
  type Pattern,
} from "@/lib/qr-studio/core";
import { download, pngBlob, verifyArtwork } from "@/lib/qr-studio/browser";
import { PatternLibrary } from "./PatternLibrary";
import { ReferenceComparison } from "./ReferenceComparison";
import { savePattern, type SavedPattern, type SaveRequest } from "@/lib/qr-studio/library";
import { patternFile, readPatternFile } from "@/lib/qr-studio/pattern";
import { renderArtwork, type RenderResult } from "@/lib/qr-studio/render-client";
import "./studio.css";
import type { PassAccess } from "@/components/tickets/types";

type Verification = { svg: string; text: string; ok: boolean; message: string };
export function QrStudio({
  initialDraft,
  initialTemplate,
  initialAccess,
}: {
  initialDraft?: string | undefined;
  initialTemplate?: TemplateId | undefined;
  initialAccess?: PassAccess | undefined;
}) {
  const navigate = useNavigate();
  const access = useSiteAccess();
  const [passAccess, setPassAccess] = useState<PassAccess>(initialAccess ?? "GENERAL");
  useEffect(() => {
    if (initialAccess) setPassAccess(initialAccess);
  }, [initialAccess]);
  const [pattern, setPattern] = useState<Pattern>({
    ...(getQrTemplate(initialTemplate) ?? QR_TEMPLATES[3]!).pattern,
  });
  const [tab, setTab] = useState(initialDraft || initialTemplate ? "create" : "catalog");
  const [activeRecord, setActiveRecord] = useState<SavedPattern | null>(null);
  const [saving, setSaving] = useState(false);
  const [libraryRefresh, setLibraryRefresh] = useState(0);
  const pendingSave = useRef<{ key: string; request: SaveRequest } | null>(null);
  const [previousDraft, setPreviousDraft] = useState<{
    pattern: Pattern;
    record: SavedPattern | null;
    pending: typeof pendingSave.current;
  } | null>(null);
  function rememberDraft() {
    setPreviousDraft({ pattern, record: activeRecord, pending: pendingSave.current });
  }
  function restoreDraft() {
    if (!previousDraft || saving) return;
    setPattern(previousDraft.pattern);
    setActiveRecord(previousDraft.record);
    pendingSave.current = previousDraft.pending;
    setPreviousDraft(null);
    setTab("create");
    setNotice("Предыдущее оформление восстановлено.");
  }
  const dirty =
    !activeRecord ||
    activeRecord.archived ||
    JSON.stringify(pattern) !== JSON.stringify(activeRecord.pattern);
  function openSaved(record: SavedPattern, base?: SavedPattern) {
    if (saving) return;
    rememberDraft();
    setPattern({ ...record.pattern });
    setActiveRecord(record.engineVersion === ENGINE_VERSION ? (base ?? record) : null);
    pendingSave.current = null;
    setTab("create");
    setNotice(
      record.engineVersion !== ENGINE_VERSION
        ? "Настройки перенесены в новый стиль. Сохранение создаст отдельную копию; оригинал остаётся в библиотеке."
        : base && base.version !== record.version
          ? `Открыта версия ${record.version}. Сохранение создаст новую версию поверх ${base.version}.`
          : `Открыта версия ${record.version}.`,
    );
  }
  async function persist(copy = false) {
    if (saving || !access.can("qr.write")) return;
    setSaving(true);
    setNotice("");
    try {
      const clean = parsePattern(pattern);
      const key = JSON.stringify({
        pattern: clean,
        id: copy ? null : activeRecord?.id,
        version: copy ? 0 : activeRecord?.version,
      });
      if (pendingSave.current?.key !== key)
        pendingSave.current = {
          key,
          request: {
            id: !copy && activeRecord ? activeRecord.id : crypto.randomUUID(),
            expectedVersion: !copy && activeRecord ? activeRecord.version : 0,
            operationId: crypto.randomUUID(),
            pattern: clean,
            archived: false,
            engineVersion: ENGINE_VERSION,
          },
        };
      const saved = await savePattern(pendingSave.current.request);
      if (!mounted.current) return;
      setActiveRecord(saved);
      pendingSave.current = null;
      setLibraryRefresh((v) => v + 1);
      setNotice(`Сохранено в библиотеке · версия ${saved.version}.`);
    } catch (e) {
      if (mounted.current)
        setNotice(e instanceof Error ? e.message : "Не удалось сохранить паттерн.");
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  const [text, setText] = useState("на удачу");
  useEffect(() => {
    if (initialDraft) {
      try {
        const draft = loadPreviewDraft(initialDraft);
        setPattern(draft.pattern);
        setText(draft.text);
        setTab("create");
        setActiveRecord(null);
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Макет не найден.");
      }
    } else if (initialTemplate) {
      const selected = getQrTemplate(initialTemplate);
      if (selected) {
        setPattern({ ...selected.pattern });
        setTab("create");
      }
    }
  }, [initialDraft, initialTemplate]);
  function selectTemplate(t: QrTemplate) {
    rememberDraft();
    setPattern({ ...t.pattern, event: pattern.event });
    setActiveRecord(null);
    pendingSave.current = null;
    setTab("create");
    setNotice("");
  }
  async function previewCard(p: Pattern = pattern) {
    try {
      const id = savePreviewDraft(p, text);
      await navigate({
        to: "/admin/tickets",
        search: { view: "preview", template: p.template, draft: id, access: passAccess },
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось открыть макет.");
    }
  }
  const [verification, setVerification] = useState<Verification | null>(null);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");
  const [series, setSeries] = useState<{ svg: string; text: string; ok: boolean }[]>([]);
  const [progress, setProgress] = useState(0);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchPattern, setBatchPattern] = useState("");
  const job = useRef(0),
    mounted = useRef(true),
    batchController = useRef<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      job.current++;
      batchController.current?.abort();
    };
  }, []);
  const renderKey = JSON.stringify([text, pattern]);
  const [rendered, setRendered] = useState<(RenderResult & { key: string }) | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void renderArtwork(text, pattern, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setRendered({ ...result, key: renderKey });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setRendered({
              art: null,
              key: renderKey,
              error: error instanceof Error ? error.message : "Не удалось построить QR.",
            });
        });
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, pattern]);
  const result =
    rendered?.key === renderKey ? rendered : { art: null, error: "Генерируем изображение…" };
  const art = result.art;
  useSiteLoading(tab === "create" && rendered?.key !== renderKey, "Готовим QR-макет");
  useSiteLoading(checking || batchBusy || saving, saving ? "Сохраняем макет" : "Проверяем QR-коды");
  const currentVerification = !!art && verification?.svg === art.svg && verification?.text === text;
  const valid = currentVerification && verification.ok;
  function change(p: Partial<Pattern>) {
    setPattern((prev) => ({ ...prev, ...p }));
    setNotice("");
  }
  async function verify() {
    if (!art) return;
    const current = ++job.current;
    setChecking(true);
    setNotice("");
    try {
      const v = await verifyArtwork(art.svg, text);
      if (mounted.current && current === job.current)
        setVerification({
          svg: art.svg,
          text,
          ok: v.ok,
          message: v.ok
            ? "Текст и байты совпали · 900, 420 и 280 px"
            : `Не читается при ${v.size} px. Уменьшите скругление или смените фон.`,
        });
    } catch {
      if (mounted.current && current === job.current)
        setVerification({
          svg: art.svg,
          text,
          ok: false,
          message: "Проверка недоступна. Попробуйте ещё раз.",
        });
    } finally {
      if (mounted.current && current === job.current) setChecking(false);
    }
  }
  async function exportQr(format: "svg" | "png") {
    if (!art || !valid) return;
    try {
      download(
        format === "svg" ? new Blob([art.svg], { type: "image/svg+xml" }) : await pngBlob(art.svg),
        `VNE-${pattern.geometry}-${art.fingerprint}.${format}`,
      );
    } catch {
      setNotice("Не удалось скачать изображение. Попробуйте ещё раз.");
    }
  }
  async function importPattern(f: File | undefined) {
    if (!f) return;
    try {
      if (f.size > 12000) throw new Error("Файл паттерна должен быть меньше 12 КБ.");
      const imported = readPatternFile(JSON.parse(await f.text()));
      if (!mounted.current) return;
      rememberDraft();
      setPattern(imported.pattern);
      setActiveRecord(null);
      pendingSave.current = null;
      setNotice(
        imported.legacy
          ? `Открыт старый файл «${imported.pattern.name}» без версии движка. Настройки применены новым генератором; рисунок изменится.`
          : `Открыт паттерн «${imported.pattern.name}».`,
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Не удалось открыть паттерн.");
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  async function buildSeries() {
    const controller = new AbortController();
    batchController.current = controller;
    setBatchBusy(true);
    setSeries([]);
    setProgress(0);
    setBatchPattern(`${pattern.name} · ${pattern.event || "без события"}`);
    const output = [];
    try {
      for (const payload of TEST_PAYLOADS) {
        const result = await renderArtwork(payload, pattern, controller.signal);
        const a = result.art;
        if (!a) throw new Error(result.error);
        const v = await verifyArtwork(a.svg, payload, [420]);
        output.push({ svg: a.svg, text: payload, ok: v.ok });
        if (!mounted.current) return;
        setProgress(output.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setSeries(output);
    } catch {
      if (mounted.current) setNotice("Серия не завершена. Повторите проверку.");
    } finally {
      if (mounted.current) setBatchBusy(false);
    }
  }
  return (
    <div className="qr-studio">
      <div className="qs-topline">
        <span className="qs-tag">СТУДИЯ / 02</span>
        <span>Генерация на вашем устройстве</span>
      </div>
      {(notice || previousDraft) && (
        <div className="qs-notice" role="status">
          {notice && <p>{notice}</p>}
          {previousDraft && (
            <Button variant="outline" disabled={saving} onClick={restoreDraft}>
              Вернуть предыдущее оформление
            </Button>
          )}
        </div>
      )}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="qs-tabs">
          <TabsTrigger value="catalog" disabled={saving}>
            <Grid2X2 size={16} />
            Макеты · 16
          </TabsTrigger>
          <TabsTrigger value="create">
            <SlidersHorizontal size={16} />
            Создать QR
          </TabsTrigger>
          <TabsTrigger value="library" disabled={saving}>
            Библиотека
          </TabsTrigger>
          <TabsTrigger value="series" disabled={saving}>
            <Grid2X2 size={16} />
            Тестовая серия
          </TabsTrigger>
          <TabsTrigger value="references" disabled={saving}>
            Сравнение
          </TabsTrigger>
        </TabsList>
        <TabsContent value="catalog">
          <TemplateCatalog
            passAccess={passAccess}
            onPassAccessChange={setPassAccess}
            selected={pattern.template}
            onSelect={selectTemplate}
            onPreview={(t) => void previewCard({ ...t.pattern, event: pattern.event })}
          />
        </TabsContent>
        <TabsContent value="create">
          <div className="qs-workspace">
            <fieldset className="qs-controls" disabled={saving}>
              <div className="qs-section">
                <p className="qs-label">01 / ХАРАКТЕР</p>
                <label htmlFor="qr-template" className="sr-only">
                  Шаблон QR
                </label>
                <select
                  id="qr-template"
                  className="qs-template-select"
                  value={pattern.template ?? ""}
                  onChange={(e) => {
                    const t = getQrTemplate(e.target.value);
                    if (t) selectTemplate(t);
                  }}
                >
                  {!pattern.template && (
                    <option value="">{pattern.name} · собственный паттерн</option>
                  )}
                  {QR_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <Button variant="ghost" onClick={() => setTab("catalog")}>
                  Посмотреть все макеты
                </Button>
              </div>
              <div className="qs-section">
                <label htmlFor="qr-payload" className="qs-label">
                  02 / СОДЕРЖИМОЕ
                </label>
                <Textarea
                  id="qr-payload"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={220}
                  rows={3}
                  spellCheck={false}
                />
                <p className="qs-hint">
                  Текст или короткая ссылка. Содержимое кодируется без изменений.
                </p>
              </div>
              <div className="qs-section">
                <p className="qs-label">03 / ФОРМА И ЦВЕТ</p>
                <div className="qs-palettes" role="group" aria-label="Палитра">
                  {Object.entries(PALETTES).map(([key, colors]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={pattern.palette === key}
                      onClick={() => change({ palette: key as Pattern["palette"] })}
                      className={pattern.palette === key ? "is-selected" : ""}
                    >
                      <i style={{ background: colors.bg, color: colors.fg }}>Aa</i>
                      <span>{key === "mint" ? "Мята" : key === "night" ? "Ночь" : "Бумага"}</span>
                    </button>
                  ))}
                </div>
                {!isMaterialTemplate(pattern.template) && (
                  <>
                    <div className="qs-range-label">
                      <label id="qr-rounding-label" htmlFor="qr-rounding">
                        Мягкость формы
                      </label>
                      <span>{Math.round((pattern.rounding / 0.46) * 100)}%</span>
                    </div>
                    <Slider
                      id="qr-rounding"
                      thumbLabelledBy="qr-rounding-label"
                      min={0}
                      max={0.46}
                      step={0.02}
                      value={[pattern.rounding]}
                      onValueChange={([v]) => {
                        if (v !== undefined) change({ rounding: v });
                      }}
                    />
                  </>
                )}
                <div className="qs-switch">
                  <label htmlFor="qr-accent">Мандариновые акценты</label>
                  <Switch
                    id="qr-accent"
                    checked={pattern.accents}
                    onCheckedChange={(v) => change({ accents: v })}
                  />
                </div>
              </div>
              <details className="qs-recipe" open>
                <summary>Паттерн для мероприятия</summary>
                <p className="qs-save-state">
                  {activeRecord
                    ? `Версия ${activeRecord.version}${dirty ? " · есть несохранённые изменения" : " · сохранено"}`
                    : "Новый паттерн · ещё не сохранён"}
                </p>
                <label htmlFor="pattern-name">Название паттерна</label>
                <Input
                  id="pattern-name"
                  value={pattern.name}
                  maxLength={60}
                  onChange={(e) => change({ name: e.target.value })}
                />
                <label htmlFor="pattern-event">Название мероприятия</label>
                <Input
                  id="pattern-event"
                  value={pattern.event}
                  maxLength={100}
                  placeholder="Можно оставить пустым"
                  onChange={(e) => change({ event: e.target.value })}
                />
                <p className="qs-hint">
                  Название мероприятия — метка для поиска. Содержание QR не сохраняется в
                  библиотеке.
                </p>
                <div className="qs-actions">
                  <Button
                    disabled={!access.can("qr.write") || saving || !pattern.name.trim() || !dirty}
                    onClick={() => void persist()}
                  >
                    {saving
                      ? "Сохраняем…"
                      : activeRecord
                        ? "Сохранить новую версию"
                        : "Сохранить в библиотеку"}
                  </Button>
                  {activeRecord && (
                    <Button
                      variant="outline"
                      disabled={!access.can("qr.write") || saving || !pattern.name.trim()}
                      onClick={() => void persist(true)}
                    >
                      Сохранить копию
                    </Button>
                  )}
                </div>
                <div className="qs-actions">
                  <Button
                    variant="outline"
                    disabled={!pattern.name.trim()}
                    onClick={() => {
                      try {
                        const p = parsePattern(pattern);
                        download(
                          new Blob([JSON.stringify(patternFile(p), null, 2)], {
                            type: "application/json",
                          }),
                          "VNE-pattern.json",
                        );
                        setNotice("Настройки скачаны. QR-содержимое в файл не входит.");
                      } catch {
                        setNotice("Проверьте настройки паттерна.");
                      }
                    }}
                  >
                    <Download size={16} />
                    Скачать паттерн
                  </Button>
                  <Button variant="outline" onClick={() => file.current?.click()}>
                    <Upload size={16} />
                    Открыть
                  </Button>
                  <input
                    type="file"
                    ref={file}
                    accept="application/json,.json"
                    className="sr-only"
                    aria-label="Файл паттерна"
                    onChange={(e) => void importPattern(e.target.files?.[0])}
                  />
                </div>
              </details>
            </fieldset>
            <div className="qs-preview-column">
              <div className="qs-artboard">
                <p className="qs-art-kicker">ВНЕ / ДЛЯ СВОИХ</p>
                {art ? (
                  <div className="qs-qr" dangerouslySetInnerHTML={{ __html: art.svg }} />
                ) : (
                  <div className="qs-empty">{result.error}</div>
                )}
                <div className="qs-art-caption">
                  <span>{pattern.name || "Новый паттерн"}</span>
                  <span>{pattern.event || "Пробный выпуск"}</span>
                </div>
              </div>
              <div className="qs-check">
                <div>
                  <strong>
                    {valid
                      ? "Проверка пройдена"
                      : checking
                        ? "Проверяем изображение…"
                        : "Проверьте перед экспортом"}
                  </strong>
                  <p aria-live="polite">
                    {currentVerification
                      ? verification.message
                      : "Декодер сверит точный текст и байты в трёх размерах."}
                  </p>
                </div>
                <Button onClick={() => void verify()} disabled={!art || checking}>
                  {checking ? (
                    <Wormhole compact />
                  ) : valid ? (
                    <Check size={17} />
                  ) : (
                    <ScanLine size={17} />
                  )}
                  Проверить
                </Button>
              </div>
              {art?.inverted && (
                <p className="qs-hint qs-caution">
                  Светлый QR на чёрном: проверьте камерой телефона. Поддержка инверсии отличается у
                  сканеров.
                </p>
              )}
              <Button className="qs-card-button" disabled={!art} onClick={() => void previewCard()}>
                Посмотреть на карточке
              </Button>
              <div className="qs-export">
                <Button disabled={!valid} onClick={() => void exportQr("svg")}>
                  <Download size={17} />
                  Скачать SVG
                </Button>
                <Button variant="outline" disabled={!valid} onClick={() => void exportQr("png")}>
                  PNG · 1200 px
                </Button>
              </div>
              <p className="qs-hint">
                Экспортируется сам QR со свободным полем. Подписи вокруг в файл не входят.
              </p>
              {art && (
                <p className="qs-meta">
                  QR {art.version} · {art.size} × {art.size} · Q · {art.fingerprint}
                </p>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="library">
          <PatternLibrary
            onOpen={openSaved}
            onPreview={(p) => void previewCard(p)}
            refreshKey={libraryRefresh}
            onChanged={() => setLibraryRefresh((v) => v + 1)}
          />
        </TabsContent>
        <TabsContent value="references">
          <ReferenceComparison />
        </TabsContent>
        <TabsContent value="series">
          <div className="qs-series-header">
            <div>
              <h2>Один стиль. Двадцать кодов.</h2>
              <p>Тестовые тексты и ссылки example.org. Проверка каждого изображения при 420 px.</p>
            </div>
            <Button disabled={batchBusy} onClick={() => void buildSeries()}>
              {batchBusy ? `${progress} / 20` : "Собрать и проверить"}
            </Button>
          </div>
          {batchPattern && (
            <p className="qs-hint">
              Снимок настроек: {batchPattern}. После изменения стиля соберите серию заново.
            </p>
          )}
          {series.length > 0 ? (
            <>
              <p className="qs-batch-result">
                Прочитано: {series.filter((s) => s.ok).length} из {series.length}
              </p>
              <div className="qs-series">
                {series.map((s, i) => (
                  <article key={s.text}>
                    <div dangerouslySetInnerHTML={{ __html: s.svg }} />
                    <div>
                      <strong>{String(i + 1).padStart(2, "0")}</strong>
                      <span className={s.ok ? "qs-pass" : "qs-fail"}>
                        {s.ok ? "Читается" : "Не прошло"}
                      </span>
                    </div>
                    <p>{s.text}</p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="qs-series-empty">
              Серия покажет, как выбранный паттерн ведёт себя на разных текстах и длинах ссылок.
            </div>
          )}
        </TabsContent>
      </Tabs>
      <footer className="qs-footer">
        <span>{ENGINE_VERSION}</span>
        <p>
          Макеты можно сохранить для мероприятия и примерить на карточку. Настоящие билеты
          выпускаются отдельно в разделе «Билеты».
        </p>
      </footer>
    </div>
  );
}
