import { MotionConfig } from "motion/react";
import { useBeginSiteLoading, useLoadingPresentation } from "@/components/loading/SiteLoading";
import { readLoadingBootstrap } from "@/lib/loading-settings";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  MOTION_SCHEMA_VERSION,
  MOTION_SETTINGS_EVENT,
  MOTION_SETTINGS_KEY,
  defaultMotionSettings,
  readStoredMotionSettings,
  sanitizeMotionSettings,
  writeStoredMotionSettings,
  type MotionSettings,
} from "@/lib/motion-settings";
import { requestPreviewDefaults, type PreviewGroupId } from "@/lib/preview-defaults";
import { supabase } from "@/integrations/supabase/client";

type MotionEnv = {
  reduced: boolean;
  finePointer: boolean;
  settings: MotionSettings;
  siteDefault: MotionSettings;
  updateSettings: (patch: Partial<MotionSettings>) => void;
  replaceSettings: (next: MotionSettings) => void;
  sharedVersion: number;
  sharedDefaultsAvailable: boolean;
  refreshSiteDefaults: () => Promise<void>;
  saveSiteDefaults: (groups: readonly PreviewGroupId[]) => Promise<void>;
};

const MotionEnvContext = createContext<MotionEnv>({
  reduced: true,
  finePointer: false,
  settings: defaultMotionSettings,
  siteDefault: defaultMotionSettings,
  updateSettings: () => {},
  replaceSettings: () => {},
  sharedVersion: 0,
  sharedDefaultsAvailable: false,
  refreshSiteDefaults: async () => {},
  saveSiteDefaults: async () => {},
});

export function useMotionEnv() {
  return useContext(MotionEnvContext);
}

/** Объединяет системный prefers-reduced-motion, ручной переключатель и настройки админки. */
export function MotionProvider({ children }: { children: ReactNode }) {
  const beginLoading = useBeginSiteLoading();
  const [env, setEnv] = useState({ reduced: true, finePointer: false });
  const [settings, setSettings] = useState<MotionSettings>(defaultMotionSettings);
  const [siteDefault, setSiteDefault] = useState<MotionSettings>(defaultMotionSettings);
  const [presentationReady, setPresentationReady] = useState(false);
  useLoadingPresentation(settings.loading, presentationReady, env.reduced);

  const [sharedVersion, setSharedVersion] = useState(0);
  const [sharedDefaultsAvailable, setSharedDefaultsAvailable] = useState(false);
  const settingsRef = useRef(settings),
    versionRef = useRef(0),
    editRevision = useRef(0);
  settingsRef.current = settings;
  async function refreshSiteDefaults() {
    const data = await requestPreviewDefaults();
    setSiteDefault(data.settings);
    setSettings(data.settings);
    settingsRef.current = data.settings;
    setSharedVersion(data.version);
    versionRef.current = data.version;
    setSharedDefaultsAvailable(true);
    writeStoredMotionSettings(data.settings);
  }
  async function saveSiteDefaults(groups: readonly PreviewGroupId[]) {
    const data = await requestPreviewDefaults({
      expectedVersion: versionRef.current,
      groups,
      settings: settingsRef.current,
    });
    setSiteDefault(data.settings);
    setSharedVersion(data.version);
    versionRef.current = data.version;
    setSharedDefaultsAvailable(true);
    // Keep live edits made while the save request was in flight. The dirty-group comparison
    // will still offer to save them; they must not be discarded by an older response.
  }
  useEffect(() => {
    const finishLoading = beginLoading("Применяем настройки сайта");
    const system = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const read = () =>
      setEnv({
        reduced: system.matches || document.documentElement.dataset["reduceMotion"] === "true",
        finePointer: pointer.matches,
      });
    read();
    let active = true;
    let hasPersonalSettings = false;
    try {
      hasPersonalSettings = window.localStorage.getItem(MOTION_SETTINGS_KEY) !== null;
    } catch {
      // Safari can deny storage; the embedded settings still render the site.
    }
    const loadingBootstrap = readLoadingBootstrap();
    setSettings({
      ...readStoredMotionSettings(),
      ...(loadingBootstrap ? { loading: loadingBootstrap } : {}),
    });
    setPresentationReady(true);
    async function loadSiteDefault() {
      const before = editRevision.current;
      try {
        const data = await requestPreviewDefaults();
        if (!active) return;
        setSharedDefaultsAvailable(true);
        setSharedVersion(data.version);
        versionRef.current = data.version;
        setSiteDefault(data.settings);
        // Every new preview starts from the published baseline. A user changing a control
        // during loading keeps that new live edit; manual refresh explicitly restores defaults.
        if (data.version > 0 && before === editRevision.current) {
          setSettings(data.settings);
          settingsRef.current = data.settings;
          writeStoredMotionSettings(data.settings);
        }
        return;
      } catch {
        /* Non-Sites environments retain the existing optional Supabase source. */
      }
      // Cloud settings are optional. Sites may run without the Lovable backend.
      if (
        !import.meta.env["VITE_SUPABASE_URL"] ||
        !import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"]
      )
        return;
      try {
        const { data, error } = await supabase
          .from("motion_defaults")
          .select("schema_version, settings")
          .eq("key", "site")
          .maybeSingle();
        if (!active || error || !data || data.schema_version > MOTION_SCHEMA_VERSION) return;
        const clean = sanitizeMotionSettings(data.settings);
        setSiteDefault(clean);
        if (!hasPersonalSettings) setSettings(clean);
      } catch {
        // Client initialization and network errors must not take down every route.
      }
    }
    void loadSiteDefault().finally(finishLoading);
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributeFilter: ["data-reduce-motion"] });
    system.addEventListener("change", read);
    pointer.addEventListener("change", read);

    const onCustom = (event: Event) => {
      hasPersonalSettings = true;
      setSettings(sanitizeMotionSettings((event as CustomEvent).detail));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === MOTION_SETTINGS_KEY) setSettings(readStoredMotionSettings());
    };
    window.addEventListener(MOTION_SETTINGS_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      finishLoading();
      active = false;
      observer.disconnect();
      system.removeEventListener("change", read);
      pointer.removeEventListener("change", read);
      window.removeEventListener(MOTION_SETTINGS_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [beginLoading]);

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
      siteDefault,
      sharedVersion,
      sharedDefaultsAvailable,
      refreshSiteDefaults,
      saveSiteDefaults,
      replaceSettings: (next) => {
        editRevision.current++;
        const clean = sanitizeMotionSettings(next);
        settingsRef.current = clean;
        setSettings(clean);
        writeStoredMotionSettings(clean);
      },
      updateSettings: (patch) => {
        editRevision.current++;
        const clean = sanitizeMotionSettings({ ...settingsRef.current, ...patch });
        settingsRef.current = clean;
        setSettings(clean);
        writeStoredMotionSettings(clean);
      },
    }),
    [env, settings, siteDefault, sharedVersion, sharedDefaultsAvailable],
  );

  return (
    <MotionEnvContext.Provider value={value}>
      <MotionConfig reducedMotion={env.reduced ? "always" : "never"}>{children}</MotionConfig>
    </MotionEnvContext.Provider>
  );
}
