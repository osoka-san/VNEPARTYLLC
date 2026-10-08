import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Check, RefreshCw, Save } from "lucide-react";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { useSiteAccess } from "@/lib/site-admin";
import { isAdminPath } from "@/lib/admin-navigation";
import { PREVIEW_GROUPS, changedPreviewGroups, type PreviewGroupId } from "@/lib/preview-defaults";
import "./workspace.css";
export function AdminSettingsFooter() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return isAdminPath(path) ? <SettingsFooter /> : null;
}
function SettingsFooter() {
  const access = useSiteAccess(),
    motion = useMotionEnv();
  const [selected, setSelected] = useState<PreviewGroupId[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  useSiteLoading(busy, "Обновляем настройки превью");
  const dirty = changedPreviewGroups(motion.settings, motion.siteDefault),
    owner = access.actor?.role === "owner";
  const chosen = selected.filter((id) => dirty.includes(id));
  async function refresh() {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await motion.refreshSiteDefaults();
      setMessage(
        "Настройки актуализированы. Применена последняя сохранённая версия администратора.",
      );
      setSelected([]);
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Не удалось актуализировать настройки.");
    } finally {
      setBusy(false);
    }
  }
  async function save(groups: readonly PreviewGroupId[]) {
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await motion.saveSiteDefaults(groups);
      setMessage(
        groups.length === PREVIEW_GROUPS.length
          ? "Все настройки сохранены как общие. Они применятся при следующем открытии сайта."
          : "Настройки выбранных разделов сохранены как общие. Остальные изменения остаются в текущем просмотре.",
      );
      setSelected([]);
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Не удалось сохранить настройки.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="aw-settings-footer" aria-label="Общие настройки превью">
      <div className="aw-settings-heading">
        <div>
          <div className="aw-eyebrow">ПРЕВЬЮ / ОБЩИЕ НАСТРОЙКИ</div>
          <h2>{owner ? "Сохранить настройки?" : "Актуальная версия сайта."}</h2>
          <p>
            {owner
              ? "Выбор применяется сразу в вашем просмотре. Сохраните все настройки или отдельные группы, чтобы сделать их общими для следующих открытий сайта."
              : "Можете пробовать настройки в своём просмотре. Эта кнопка вернёт последнюю версию, сохранённую администратором."}
          </p>
        </div>
        <span className="aw-badge">
          {motion.sharedVersion ? `Версия ${motion.sharedVersion}` : "Базовая версия"}
        </span>
      </div>
      {owner && (
        <>
          <div className="aw-settings-summary">
            {dirty.length ? (
              `${dirty.length} из ${PREVIEW_GROUPS.length} групп изменено`
            ) : (
              <>
                <Check size={16} /> Все группы соответствуют общим настройкам
              </>
            )}
          </div>
          <div className="aw-settings-actions">
            <button
              className="aw-button"
              disabled={
                busy ||
                !motion.sharedDefaultsAvailable ||
                (dirty.length === 0 && motion.sharedVersion > 0)
              }
              onClick={() => void save(PREVIEW_GROUPS.map((g) => g.id))}
            >
              <Save size={17} />
              {busy ? "Подождите…" : "Сохранить всё для превью"}
            </button>
          </div>
          <details className="aw-settings-select">
            <summary>Сохранить только некоторые разделы</summary>
            <div className="aw-settings-groups">
              {PREVIEW_GROUPS.map((group) => (
                <label key={group.id} className={dirty.includes(group.id) ? "has-changes" : ""}>
                  <input
                    type="checkbox"
                    disabled={busy || !dirty.includes(group.id)}
                    checked={selected.includes(group.id) && dirty.includes(group.id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, group.id]
                          : selected.filter((id) => id !== group.id),
                      )
                    }
                  />
                  <span>
                    {group.label}
                    <small>{dirty.includes(group.id) ? "Есть изменения" : "Без изменений"}</small>
                  </span>
                </label>
              ))}
            </div>
            <button
              className="aw-button secondary"
              disabled={busy || !motion.sharedDefaultsAvailable || chosen.length === 0}
              onClick={() => void save(chosen)}
            >
              Сохранить выбранные ({chosen.length})
            </button>
          </details>
        </>
      )}
      <button
        className="aw-button secondary aw-refresh-defaults"
        disabled={busy || access.isPending || !access.actor}
        onClick={() => void refresh()}
      >
        <RefreshCw size={16} />
        {busy ? "Подождите…" : "Актуализировать настройки"}
      </button>
      <p className="aw-subtle">
        Общие настройки: анимация, фоны событий, текст, изображения и подсветка, меню и переходы.
        QR-макеты и тексты сохраняются в своих разделах.
      </p>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "aw-error" : "aw-settings-success"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
