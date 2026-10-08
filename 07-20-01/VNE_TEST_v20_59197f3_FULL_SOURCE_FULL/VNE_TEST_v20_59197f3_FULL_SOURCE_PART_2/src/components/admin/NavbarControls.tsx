import { useEffect, useId, useState } from "react";
import { AppHeader } from "@/components/app/AppHeader";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { useSiteAccess } from "@/lib/site-admin";
import {
  defaultNavbarSettings,
  NAVBAR_ACCENTS,
  NAVBAR_RANGES,
  type NavbarSettings,
} from "@/lib/navbar-settings";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function NavbarControls() {
  const motion = useMotionEnv(),
    access = useSiteAccess(),
    id = useId();
  const config = motion.settings.navbar;
  const [label, setLabel] = useState(config.inviteLabel);
  useEffect(() => {
    setLabel((current) => (current.trim() === config.inviteLabel ? current : config.inviteLabel));
  }, [config.inviteLabel]);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const dirty = JSON.stringify(config) !== JSON.stringify(motion.siteDefault.navbar);
  const update = (patch: Partial<NavbarSettings>) => {
    motion.updateSettings({ navbar: { ...config, ...patch } });
    setMessage("");
  };
  return (
    <section
      id="navbar-settings"
      className="eb-panel lg:col-span-12"
      aria-labelledby={`${id}-title`}
      data-admin-static="true"
    >
      <div className="eb-heading">
        <div>
          <p className="eb-kicker">ВНЕ / НАВИГАЦИЯ</p>
          <h3 id={`${id}-title`}>Навбар</h3>
        </div>
        <span className="eb-type">Живое изменение</span>
      </div>
      <p className="eb-description">
        Верхняя панель и раскрывающееся меню меняются сразу. На телефоне размеры ограничены шириной
        экрана; все страницы всегда доступны через «Меню».
      </p>
      <div
        style={{
          containerType: "inline-size",
          marginBlock: 24,
          border: "1px solid #35473b",
          borderRadius: 12,
          background: "#101a14",
          paddingBlock: 12,
        }}
      >
        <AppHeader preview />
      </div>
      <p className="eb-note">
        Это действующее меню: можно раскрыть его и проверить переходы. Сохраните настройки перед
        обновлением страницы.
      </p>
      <div className="lc-modes">
        <p className="eb-note">Цвет кнопки, активных ссылок и большого меню</p>
        <div className="lc-mode-grid">
          {Object.entries(NAVBAR_ACCENTS).map(([key, item]) => (
            <button
              type="button"
              key={key}
              aria-pressed={config.accent === key}
              onClick={() => update({ accent: key as NavbarSettings["accent"] })}
            >
              <span
                aria-hidden="true"
                style={{
                  background: item.color,
                  display: "inline-block",
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  marginRight: 8,
                }}
              />
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="eb-ranges mt-6">
        {(Object.keys(NAVBAR_RANGES) as (keyof typeof NAVBAR_RANGES)[]).map((key) => {
          const range = NAVBAR_RANGES[key],
            value = config[key],
            labelId = `${id}-${key}`;
          const valueText =
            range.unit === "%" ? `${Math.round(value * 100)}%` : `${value} ${range.unit}`;
          return (
            <div key={key} className="eb-control">
              <div className="eb-control-heading">
                <span id={labelId}>{range.label}</span>
                <output>{valueText}</output>
              </div>
              <Slider
                thumbLabelledBy={labelId}
                thumbValueText={valueText}
                value={[value]}
                min={range.min}
                max={range.max}
                step={range.step}
                onValueChange={([next]) => update({ [key]: next ?? value })}
              />
            </div>
          );
        })}
      </div>
      <label className="lc-direction mt-6">
        Подпись кнопки приглашения
        <input
          className="min-h-11 min-w-0 rounded border border-border bg-background px-3"
          value={label}
          maxLength={18}
          onChange={(e) => {
            const value = e.target.value;
            setLabel(value);
            if (value.trim()) update({ inviteLabel: value });
          }}
          onBlur={() => {
            if (!label.trim()) {
              setLabel(defaultNavbarSettings.inviteLabel);
              update({ inviteLabel: defaultNavbarSettings.inviteLabel });
            }
          }}
        />
      </label>
      <div className="eb-toggles mt-6">
        {(
          [
            ["showInvite", "Кнопка приглашения"],
            ["showEvents", "События в верхней панели"],
            ["showAbout", "О проекте в верхней панели"],
            ["showMember", "Кабинет в верхней панели"],
            ["showChapters", "Главы главной в раскрытом меню"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <Switch
              checked={config[key]}
              onCheckedChange={(checked) => update({ [key]: checked })}
            />
          </label>
        ))}
      </div>
      <div className="lc-actions mt-6">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            motion.updateSettings({ navbar: { ...defaultNavbarSettings } });
            setMessage("Фирменный навбар восстановлен в текущем просмотре.");
          }}
        >
          Сбросить навбар
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !motion.sharedDefaultsAvailable}
          onClick={async () => {
            setBusy(true);
            setMessage("");
            try {
              await motion.refreshSiteDefaults();
              setMessage("Общие настройки обновлены.");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Не удалось обновить настройки.");
            } finally {
              setBusy(false);
            }
          }}
        >
          Актуализировать настройки
        </Button>
        {access.actor?.role === "owner" && (
          <Button
            type="button"
            disabled={busy || !dirty || !motion.sharedDefaultsAvailable}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                await motion.saveSiteDefaults(["navbar"]);
                setMessage("Навбар сохранён для всех следующих открытий сайта.");
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "Не удалось сохранить навбар.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить навбар для всех
          </Button>
        )}
      </div>
      <p className="eb-note mt-3">
        {dirty ? "Есть несохранённые изменения." : "Навбар соответствует общим настройкам."}
      </p>
      <p role="status" className="lc-message">
        {message}
      </p>
    </section>
  );
}
