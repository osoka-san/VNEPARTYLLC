import { MotionConfig } from "motion/react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  MOTION_SETTINGS_EVENT,
  MOTION_SETTINGS_KEY,
  defaultMotionSettings,
  readStoredMotionSettings,
  sanitizeMotionSettings,
  writeStoredMotionSettings,
  type MotionSettings,
} from "@/lib/motion-settings";

type MotionEnv = {
  reduced: boolean;
  finePointer: boolean;
  settings: MotionSettings;
  updateSettings: (patch: Partial<MotionSettings>) => void;
  replaceSettings: (next: MotionSettings) => void;
};

const MotionEnvContext = createContext<MotionEnv>({
  reduced: true,
  finePointer: false,
  settings: defaultMotionSettings,
  updateSettings: () => {},
  replaceSettings: () => {},
});

export function useMotionEnv() {
  return useContext(MotionEnvContext);
}

/** Объединяет системный prefers-reduced-motion, ручной переключатель и настройки админки. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const [env, setEnv] = useState({ reduced: true, finePointer: false });
  const [settings, setSettings] = useState<MotionSettings>(defaultMotionSettings);

  useEffect(() => {
    const system = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const read = () =>
      setEnv({
        reduced: system.matches || document.documentElement.dataset["reduceMotion"] === "true",
        finePointer: pointer.matches,
      });
    read();
    setSettings(readStoredMotionSettings());
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributeFilter: ["data-reduce-motion"] });
    system.addEventListener("change", read);
    pointer.addEventListener("change", read);

    const onCustom = (event: Event) =>
      setSettings(sanitizeMotionSettings((event as CustomEvent).detail));
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_SETTINGS_KEY) setSettings(readStoredMotionSettings());
    };
    window.addEventListener(MOTION_SETTINGS_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      observer.disconnect();
      system.removeEventListener("change", read);
      pointer.removeEventListener("change", read);
      window.removeEventListener(MOTION_SETTINGS_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--vne-hero-step", `${settings.heroStagger}s`);
    root.style.setProperty("--vne-motion-duration", `${settings.duration}s`);
    root.style.setProperty(
      "--vne-motion-ease",
      settings.ease === "inOut"
        ? "cubic-bezier(0.65, 0, 0.35, 1)"
        : "cubic-bezier(0.22, 1, 0.36, 1)",
    );
    root.style.setProperty("--vne-menu-stagger", `${settings.menuStagger}s`);
    root.style.setProperty(
      "--vne-dialog-duration",
      `${settings.dialogMotion ? settings.duration : 0}s`,
    );
    root.style.setProperty(
      "--vne-page-duration",
      `${settings.pageTransition ? settings.pageDuration : 0}s`,
    );
    root.style.setProperty("--vne-faq-duration", `${settings.faqMotion ? 0.26 : 0}s`);
    root.dataset["motionMenu"] = String(settings.menuMotion);
    root.dataset["motionBlur"] = String(settings.progressiveBlur);
    root.dataset["motionDialog"] = String(settings.dialogMotion);
    root.dataset["motionText"] = String(settings.textEnabled);
    root.dataset["motionFaq"] = String(settings.faqMotion);
    root.dataset["motionBackground"] = String(settings.animatedBackground);
  }, [settings]);

  const value = useMemo<MotionEnv>(
    () => ({
      ...env,
      settings,
      replaceSettings: (next) => {
        const clean = sanitizeMotionSettings(next);
        setSettings(clean);
        writeStoredMotionSettings(clean);
      },
      updateSettings: (patch) => {
        const clean = sanitizeMotionSettings({ ...settings, ...patch });
        setSettings(clean);
        writeStoredMotionSettings(clean);
      },
    }),
    [env, settings],
  );

  return (
    <MotionEnvContext.Provider value={value}>
      <MotionConfig reducedMotion={env.reduced ? "always" : "never"}>{children}</MotionConfig>
    </MotionEnvContext.Provider>
  );
}
