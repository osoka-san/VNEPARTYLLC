import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { Magnetic, TextScramble, TiltGlow } from "@/components/motion/Interactive";
import { Reveal } from "@/components/motion/Reveal";
import { TextRoll } from "@/components/motion/TextRoll";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motionTokens } from "@/lib/motion";
import type { MotionSettings } from "@/lib/motion-settings";
import { TextLoop } from "@/components/motion/TextLoop";
import { AnimatedBackground } from "@/components/motion/AnimatedBackground";
import { TextSection } from "@/components/motion/TextSection";
import { ImageReveal, Stagger } from "@/components/motion/Primitives";

export type PreviewGroup =
  "reveal" | "text" | "loop" | "roll" | "scramble" | "sections" | "pointer" | "extras";

type SettingPreview = {
  group: PreviewGroup;
  label: string;
  unit?: string;
};

export const settingPreviews: Record<keyof MotionSettings, SettingPreview> = {
  revealStyle: { group: "reveal", label: "Тип появления" },
  duration: { group: "reveal", label: "Длительность", unit: "с" },
  ease: { group: "reveal", label: "Характер кривой" },
  distance: { group: "reveal", label: "Смещение", unit: "px" },
  blur: { group: "reveal", label: "Размытие", unit: "px" },
  scaleFrom: { group: "reveal", label: "Начальный масштаб" },
  heroStagger: { group: "reveal", label: "Шаг первого экрана", unit: "с" },
  magnetic: { group: "pointer", label: "Притяжение кнопок" },
  magneticStrength: { group: "pointer", label: "Сила притяжения" },
  magneticMaxOffset: { group: "pointer", label: "Предел смещения", unit: "px" },
  tilt: { group: "pointer", label: "Наклон карточек" },
  tiltDeg: { group: "pointer", label: "Угол наклона", unit: "°" },
  press: { group: "pointer", label: "Реакция на нажатие" },
  pressHover: { group: "pointer", label: "Увеличение при наведении" },
  pressTap: { group: "pointer", label: "Сжатие при нажатии" },
  scramble: { group: "scramble", label: "Text Scramble" },
  springStiffness: { group: "pointer", label: "Упругость" },
  springDamping: { group: "pointer", label: "Затухание" },
  menuMotion: { group: "extras", label: "Движение меню" },
  menuStagger: { group: "extras", label: "Шаг пунктов меню", unit: "с" },
  progressiveBlur: { group: "extras", label: "Размытие под меню" },
  imageReveal: { group: "extras", label: "Появление изображений" },
  imageScaleFrom: { group: "extras", label: "Начальный масштаб изображения" },
  glow: { group: "extras", label: "Локальное свечение" },
  shimmer: { group: "extras", label: "Световой акцент" },
  dialogMotion: { group: "extras", label: "Переходы окон" },
  pageTransition: { group: "extras", label: "Переходы страниц" },
  pageDuration: { group: "extras", label: "Длительность перехода", unit: "с" },
  textEnabled: { group: "text", label: "Анимация текста" },
  textHeadingStyle: { group: "text", label: "Стиль заголовков" },
  textBodyStyle: { group: "text", label: "Стиль обычного текста" },
  textAccentStyle: { group: "text", label: "Стиль акцентов" },
  textSplit: { group: "text", label: "Последовательность текста" },
  textDuration: { group: "text", label: "Длительность текста", unit: "с" },
  textDelay: { group: "text", label: "Начальная задержка", unit: "с" },
  textStagger: { group: "text", label: "Шаг элементов", unit: "с" },
  textDistance: { group: "text", label: "Смещение текста", unit: "px" },
  textBlur: { group: "text", label: "Размытие текста", unit: "px" },
  textScaleFrom: { group: "text", label: "Начальный масштаб текста" },
  textViewportAmount: { group: "text", label: "Порог появления" },
  textRepeat: { group: "text", label: "Повтор при возвращении" },
  textHeroSequence: { group: "text", label: "Сценарий первого экрана" },
  textButtons: { group: "text", label: "Текст кнопок и ссылок" },
  textCards: { group: "text", label: "Текст карточек событий" },
  textAdmin: { group: "text", label: "Текст панели управления" },
  rollEnabled: { group: "roll", label: "Text Roll" },
  rollDuration: { group: "roll", label: "Длительность Text Roll", unit: "с" },
  loopEnabled: { group: "loop", label: "Text Loop" },
  loopInterval: { group: "loop", label: "Пауза Text Loop", unit: "с" },
  loopDuration: { group: "loop", label: "Переход Text Loop", unit: "с" },
  animatedBackground: { group: "extras", label: "Движущаяся подложка" },
  backgroundDuration: { group: "extras", label: "Переход подложки", unit: "с" },
  faqMotion: { group: "extras", label: "Раскрытие FAQ" },
  scrambleDuration: { group: "scramble", label: "Длительность Text Scramble", unit: "с" },
  scrambleTick: { group: "scramble", label: "Частота Text Scramble", unit: "с" },
  scrambleDelay: { group: "scramble", label: "Пауза Text Scramble", unit: "с" },
  scrambleIntensity: { group: "scramble", label: "Плотность Text Scramble" },
  scrambleDirection: { group: "scramble", label: "Направление Text Scramble" },
  scrambleCharset: { group: "scramble", label: "Набор знаков Text Scramble" },
  scrambleRepeat: { group: "scramble", label: "Повтор Text Scramble" },
  scrambleGroups: { group: "scramble", label: "Области Text Scramble" },
  scrambleTargets: { group: "scramble", label: "Места Text Scramble" },
  sectionEnabled: { group: "sections", label: "Text Sections" },
  sectionIntensity: { group: "sections", label: "Интенсивность cyan" },
  sectionStart: { group: "sections", label: "Начало подсветки" },
  sectionEnd: { group: "sections", label: "Завершение подсветки" },
};

const groupLabels: Record<PreviewGroup, string> = {
  reveal: "Появление",
  text: "Текст",
  loop: "Loop",
  scramble: "Scramble",
  sections: "Sections",
  pointer: "Курсор",
  roll: "Roll",
  extras: "Дополнительно",
};

function displayValue(value: MotionSettings[keyof MotionSettings], unit?: string) {
  if (typeof value === "boolean") return value ? "Включено" : "Выключено";
  if (typeof value === "number")
    return `${Number.isInteger(value) ? value : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}${unit ? ` ${unit}` : ""}`;
  if (typeof value === "string") return value;
  return `${Object.values(value).filter(Boolean).length} включено`;
}

function StaticReason({ children }: { children: string }) {
  return (
    <p
      role="status"
      className="border-l-2 border-blue pl-3 font-body text-xs text-muted-foreground"
    >
      {children}
    </p>
  );
}

function ViewportTextPreview({ replayKey }: { replayKey: number }) {
  const { reduced, settings } = useMotionEnv();
  const rootRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const off = reduced || !settings.textEnabled || settings.textBodyStyle === "none";

  useEffect(() => {
    const root = rootRef.current;
    const target = targetRef.current;
    if (!root || !target || off) {
      setVisible(true);
      return;
    }
    setVisible(false);
    root.scrollTop = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.intersectionRatio >= settings.textViewportAmount) setVisible(true);
        else if (settings.textRepeat) setVisible(false);
      },
      { root, threshold: [0, settings.textViewportAmount, 1] },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [off, replayKey, settings.textRepeat, settings.textViewportAmount]);

  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Прокрутите область вниз и обратно.</p>
      <div ref={rootRef} className="h-36 overflow-y-auto border border-border bg-background/60 p-3">
        <div className="h-28 text-xs text-muted-foreground">
          Текст ждёт заданную долю видимости.
        </div>
        <motion.div
          ref={targetRef}
          className="min-h-20 border-l-2 border-mint pl-3 font-body text-sm"
          animate={
            visible || off
              ? { opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }
              : {
                  opacity: 0,
                  y: settings.textDistance,
                  filter: `blur(${settings.textBlur}px)`,
                  scale: settings.textScaleFrom,
                }
          }
          transition={{
            duration: off ? 0 : settings.textDuration,
            ease: motionTokens.ease[settings.ease],
          }}
        >
          Реальная зона видимости: {Math.round(settings.textViewportAmount * 100)}%.
        </motion.div>
        <div className="h-28" />
      </div>
    </div>
  );
}

function RevealPreview({ replayKey }: { replayKey: number }) {
  const { reduced, settings } = useMotionEnv();
  const off = reduced || settings.revealStyle === "none" || settings.duration === 0;
  return (
    <div key={replayKey} className="space-y-2">
      {off ? (
        <StaticReason>
          {reduced
            ? "Уменьшение движения: показан финальный вид."
            : "Появление выключено: показан финальный вид."}
        </StaticReason>
      ) : null}
      {["ВНЕ / порог", "За пределами привычного", "Только после подтверждения"].map(
        (text, index) => (
          <Reveal key={text} replay delay={settings.heroStagger * index}>
            <div className="border-l-2 border-mint bg-background/50 px-3 py-2 text-sm">{text}</div>
          </Reveal>
        ),
      )}
    </div>
  );
}

function TextPreview({
  activeKey,
  replayKey,
}: {
  activeKey: keyof MotionSettings;
  replayKey: number;
}) {
  const { reduced, settings } = useMotionEnv();
  if (activeKey === "textViewportAmount" || activeKey === "textRepeat")
    return <ViewportTextPreview replayKey={replayKey} />;
  const off = reduced || !settings.textEnabled;
  return (
    <div key={replayKey} className="space-y-3">
      {off ? (
        <StaticReason>
          {reduced
            ? "Уменьшение движения: текст сразу финальный."
            : "Анимация текста выключена: текст сразу финальный."}
        </StaticReason>
      ) : null}
      <p className="font-display text-lg">
        <AnimatedText role="heading" replay>
          Заголовок события
        </AnimatedText>
      </p>
      <p className="whitespace-pre-line text-sm text-muted-foreground">
        <AnimatedText role="body" replay>
          {"Первая строка\nВторая строка"}
        </AnimatedText>
      </p>
      <p className="font-display text-xs uppercase text-mint">
        <AnimatedText role="accent" replay>
          ВНЕ / акцент
        </AnimatedText>
      </p>
      {activeKey === "textHeroSequence" ? (
        <div className="border-t border-border pt-3 text-xs">
          {["Подпись", "Заголовок", "Пояснение", "Действие"].map((item, index) => (
            <AnimatedText
              key={item}
              role={index === 1 ? "heading" : "accent"}
              hero
              replay
              delay={settings.textHeroSequence ? index * settings.heroStagger : 0}
            >
              {item}
              {index < 3 ? " · " : ""}
            </AnimatedText>
          ))}
        </div>
      ) : null}
      {activeKey === "textButtons" ? (
        <Button className="min-h-11">
          <AnimatedText role="accent" enabled={settings.textButtons} replay>
            Кнопка
          </AnimatedText>
        </Button>
      ) : null}
      {activeKey === "textCards" ? (
        <div className="border border-border p-3">
          <AnimatedText role="body" enabled={settings.textCards} replay>
            Карточка события · Демо
          </AnimatedText>
        </div>
      ) : null}
      {activeKey === "textAdmin" ? (
        <div className="border border-border p-3">
          <AnimatedText role="accent" enabled={settings.textAdmin} replay>
            Параметр панели
          </AnimatedText>
        </div>
      ) : null}
    </div>
  );
}

function PointerPreview({ replayKey }: { replayKey: number }) {
  const { reduced, finePointer, settings } = useMotionEnv();
  const [pressed, setPressed] = useState(false);
  return (
    <div key={replayKey} className="space-y-3">
      {!finePointer ? (
        <StaticReason>
          Притяжение и наклон работают только с точным указателем. Нажатие доступно касанием и с
          клавиатуры.
        </StaticReason>
      ) : reduced ? (
        <StaticReason>Уменьшение движения: геометрические эффекты отключены.</StaticReason>
      ) : null}
      {!settings.magnetic ? (
        <StaticReason>Притяжение выключено; сила и предел смещения не применяются.</StaticReason>
      ) : null}
      {!settings.tilt ? <StaticReason>Наклон выключен; угол не применяется.</StaticReason> : null}
      {!settings.press ? (
        <StaticReason>
          Реакция на нажатие выключена; масштабы hover/tap не применяются.
        </StaticReason>
      ) : null}
      <TiltGlow className="border border-border bg-background/50 p-4">
        <p className="font-display text-xs uppercase text-mint">
          <TextScramble>03 / ПРОСТРАНСТВО</TextScramble>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Наведите курсор на карточку и кнопку. Нажмите кнопку.
        </p>
        <div className="mt-4">
          <Magnetic>
            <Button
              type="button"
              aria-label="Получить приглашение — проба кнопки"
              className="min-h-11 bg-cta text-cta-foreground hover:bg-cta/90"
              onClick={() => setPressed(true)}
            >
              Получить приглашение
            </Button>
          </Magnetic>
        </div>
      </TiltGlow>
      {pressed ? (
        <p role="status" className="text-xs text-muted-foreground">
          Нажатие зарегистрировано
        </p>
      ) : null}
    </div>
  );
}

function RollPreview({ replayKey }: { replayKey: number }) {
  const { reduced, settings } = useMotionEnv();
  const off = reduced || !settings.textEnabled || !settings.rollEnabled;
  return (
    <div key={replayKey} className="space-y-4">
      {off ? (
        <StaticReason>
          {reduced
            ? "Уменьшение движения: финальный текст без прокрутки."
            : !settings.textEnabled
              ? "Анимация текста выключена: Text Roll статичен."
              : "Text Roll выключен: показан обычный текст."}
        </StaticReason>
      ) : null}
      <p className="font-display text-2xl">
        <TextRoll replay>Меньше шума.</TextRoll>
      </p>
    </div>
  );
}

function ScramblePreview({ replayKey }: { replayKey: number }) {
  const { reduced, settings } = useMotionEnv();
  const [sample, setSample] = useState("ЁЛКИ / ЙОГА · VNE LIGHT 2026");
  const [localReplay, setLocalReplay] = useState(0);
  const off = reduced || !settings.textEnabled || !settings.scramble;
  const replay = () => setLocalReplay((value) => value + 1);
  return (
    <div className="space-y-4">
      {off ? (
        <StaticReason>
          {reduced
            ? "Уменьшение движения: показан финальный текст."
            : !settings.textEnabled
              ? "Общая анимация текста выключена."
              : "Text Scramble выключен: показан финальный текст."}
        </StaticReason>
      ) : null}
      <div>
        <label htmlFor="scramble-preview-text" className="font-body text-xs text-muted-foreground">
          Тестовая строка
        </label>
        <Input
          id="scramble-preview-text"
          className="mt-2 min-h-11"
          value={sample}
          maxLength={90}
          onChange={(event) => {
            setSample(event.target.value);
            replay();
          }}
        />
      </div>
      <p className="min-h-14 [overflow-wrap:anywhere] font-display text-lg uppercase leading-relaxed text-mint">
        <TextScramble replayKey={replayKey + localReplay}>{sample || "ВНЕ"}</TextScramble>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={off}
          onClick={replay}
        >
          <RotateCcw aria-hidden="true" /> Повторить
        </Button>
        <span className={`text-xs ${off ? "text-orange" : "text-muted-foreground"}`}>
          {off ? "Проба остановлена" : "Проба включена"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Цифры, пробелы, пунктуация и «/» остаются статичными.
      </p>
    </div>
  );
}

function LoopPreview({ replayKey }: { replayKey: number }) {
  return (
    <div key={replayKey} className="space-y-4">
      <p className="font-display text-sm text-mint">
        <TextLoop
          replayKey={replayKey}
          items={["Музыка", "Пространство", "Люди"]}
          staticText="Музыка / Пространство / Люди"
        />
      </p>
      <p className="font-display text-sm text-blue">
        <TextLoop
          replayKey={replayKey}
          mode="custom"
          items={["Музыка", "Свет", "Пространство"]}
          staticText="Музыка / Свет / Пространство"
        />
      </p>
    </div>
  );
}

function SectionsPreview() {
  const { reduced, settings } = useMotionEnv();
  const off = reduced || !settings.textEnabled || !settings.sectionEnabled;
  return (
    <div className="space-y-3">
      {off ? (
        <StaticReason>Text Sections выключен: показан финальный читаемый текст.</StaticReason>
      ) : null}
      <p className="font-display text-lg leading-relaxed">
        <TextSection>
          Свет проявляет смысл постепенно, сохраняя паузу, ритм и внимание к музыке.
        </TextSection>
      </p>
      <p className="text-xs text-muted-foreground">
        Прокрутите страницу: cyan следует за положением текста.
      </p>
    </div>
  );
}

function ExtrasPreview({ replayKey }: { replayKey: number }) {
  const { reduced, settings } = useMotionEnv();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [segment, setSegment] = useState(0);
  const enabled = !reduced;
  return (
    <div key={replayKey} className="space-y-4">
      {reduced ? (
        <StaticReason>
          Уменьшение движения: все дополнительные пробы показаны в финальном состоянии.
        </StaticReason>
      ) : null}
      <AnimatedBackground
        className="grid grid-cols-3 gap-1"
        activeIndex={segment}
        onActiveIndexChange={(value) => setSegment(value ?? 0)}
      >
        {["Навигация", "Карточки", "FAQ"].map((item) => (
          <Button key={item} type="button" variant="ghost" size="sm">
            {item}
          </Button>
        ))}
      </AnimatedBackground>
      <div className="relative overflow-hidden border border-border bg-background/70 p-3">
        {/* Menu probe reuses the production Stagger (menuMotion/menuStagger, 400 ms items)
            and the same static blur backdrop as the mobile Sheet. */}
        <div
          aria-hidden="true"
          className={`absolute inset-0 bg-background/70 ${settings.progressiveBlur ? "backdrop-blur-sm" : ""}`}
        />
        <Stagger key={`menu-${replayKey}`} className="relative space-y-1">
          {["События", "О проекте", "Приглашение"].map((item) => (
            <div key={item} className="border-b border-border py-1 text-xs">
              {item}
            </div>
          ))}
        </Stagger>
      </div>
      <p className="text-xs text-muted-foreground">
        Меню: пункты появляются по очереди (шаг {settings.menuStagger.toFixed(2)} с, по 0,4 с); фон
        под меню {settings.progressiveBlur ? "размыт" : "только затемнён"}.
      </p>
      {/* Image probe reuses production ImageReveal: max 500 ms, y 12, scale from setting. */}
      <ImageReveal key={`image-${replayKey}`} replay className="border border-border">
        <img
          src="/media/gallery-of-light/v1/gallery-space-mobile-v1-480.webp"
          alt="Проба появления изображения"
          className="h-24 w-full object-cover"
        />
      </ImageReveal>
      <p className="text-xs text-muted-foreground">
        Изображение: подъём и масштаб до 0,5 с, как на рабочих страницах.
      </p>
      <Accordion type="single" collapsible className="border-t border-border">
        <AccordionItem value="probe" className="border-border">
          <AccordionTrigger className="min-h-11 font-display text-left text-sm no-underline hover:no-underline">
            Проба FAQ: что означает допуск?
          </AccordionTrigger>
          <AccordionContent className="text-xs leading-relaxed text-muted-foreground">
            Ответ раскрывается тем же компонентом, что и на странице FAQ (
            {settings.faqMotion && !reduced ? "0,26 с" : "сразу"}).
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="vne-glow min-h-11"
          data-enabled={enabled && settings.glow ? "true" : "false"}
        >
          Наведите курсор
        </Button>
        <span
          className="vne-shimmer self-center font-display text-xs uppercase text-mint"
          data-enabled={enabled && settings.shimmer ? "true" : "false"}
        >
          Световой акцент
        </span>
      </div>
      <motion.div
        key={page}
        initial={
          enabled && settings.pageTransition ? { opacity: 0, y: motionTokens.page.y } : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: enabled && settings.pageTransition ? settings.pageDuration : 0 }}
        className="border border-border p-3 text-xs"
      >
        Локальная страница {page + 1}
      </motion.div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setPage((value) => (value + 1) % 2)}
        >
          Проба перехода
        </Button>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="min-h-11">
              Проба окна
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Проба окна</DialogTitle>
              <DialogDescription>Escape закрывает окно и возвращает фокус.</DialogDescription>
            </DialogHeader>
            <Button type="button" className="min-h-11" onClick={() => setDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function AdminMotionPreview({
  activeKey,
  replayKey,
  onReplay,
}: {
  activeKey: keyof MotionSettings;
  replayKey: number;
  onReplay: () => void;
}) {
  const { settings } = useMotionEnv();
  const [group, setGroup] = useState<PreviewGroup>(settingPreviews[activeKey].group);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setGroup(settingPreviews[activeKey].group), [activeKey]);
  const meta = settingPreviews[activeKey];
  const value = useMemo(
    () => displayValue(settings[activeKey], meta.unit),
    [activeKey, meta.unit, settings],
  );

  return (
    <aside
      className="admin-preview-sticky order-first min-w-0 w-full max-w-full lg:order-last lg:col-span-5"
      aria-label="Контекстный предпросмотр"
    >
      <div className="w-full min-w-0 max-w-full overflow-hidden border border-border bg-surface/95 shadow-lg backdrop-blur-md">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h3 className="font-display text-sm uppercase">Предпросмотр</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {meta.label}: <span className="text-foreground">{value}</span>
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Повторить пример"
              title="Повторить пример"
              onClick={onReplay}
            >
              <RotateCcw aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label={collapsed ? "Развернуть предпросмотр" : "Свернуть предпросмотр"}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
            >
              <ChevronDown aria-hidden="true" className={collapsed ? "" : "rotate-180"} />
            </Button>
          </div>
        </div>
        <div className={`${collapsed ? "hidden" : "block"} lg:block`}>
          <div
            className="flex gap-1 overflow-x-auto border-b border-border p-2"
            aria-label="Группы примеров"
          >
            {(Object.keys(groupLabels) as PreviewGroup[]).map((key) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={group === key ? "secondary" : "ghost"}
                aria-pressed={group === key}
                onClick={() => setGroup(key)}
              >
                {groupLabels[key]}
              </Button>
            ))}
          </div>
          <div className="admin-preview-body overflow-y-auto p-4" data-preview-group={group}>
            {group === "reveal" ? <RevealPreview replayKey={replayKey} /> : null}
            {group === "text" ? <TextPreview activeKey={activeKey} replayKey={replayKey} /> : null}
            {group === "loop" ? <LoopPreview replayKey={replayKey} /> : null}
            {group === "pointer" ? <PointerPreview replayKey={replayKey} /> : null}
            {group === "roll" ? <RollPreview replayKey={replayKey} /> : null}
            {group === "scramble" ? <ScramblePreview replayKey={replayKey} /> : null}
            {group === "sections" ? <SectionsPreview /> : null}
            {group === "extras" ? <ExtrasPreview replayKey={replayKey} /> : null}
          </div>
        </div>
      </div>
    </aside>
  );
}
