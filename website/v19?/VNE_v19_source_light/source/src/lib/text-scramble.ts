export type ScrambleDirection = "left" | "right" | "random";
export type ScrambleCharset = "auto" | "mixed" | "symbols";
export type ScrambleGroupId = "home" | "about" | "events" | "public" | "headings";
export type ScrambleTargetKind = "accent" | "heading";

export type ScrambleTarget = {
  id: string;
  route: string;
  section: string;
  label: string;
  group: ScrambleGroupId;
  kind: ScrambleTargetKind;
  defaultEnabled: boolean;
};

export const scrambleGroups: ReadonlyArray<{ id: ScrambleGroupId; label: string }> = [
  { id: "home", label: "Главная" },
  { id: "about", label: "О ВНЕ" },
  { id: "events", label: "События" },
  { id: "public", label: "Другие публичные страницы" },
  { id: "headings", label: "Короткие заголовки" },
];

export const scrambleTargets = [
  {
    id: "home.hero.eyebrow",
    route: "/",
    section: "Порог",
    label: "Метка Порога",
    group: "home",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "home.manifesto.eyebrow",
    route: "/",
    section: "Манифест",
    label: "Метка Манифеста",
    group: "home",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "home.space.eyebrow",
    route: "/",
    section: "Пространство",
    label: "Метка Пространства",
    group: "home",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "home.next-night.eyebrow",
    route: "/",
    section: "Ближайшая ночь",
    label: "Метка Ближайшей ночи",
    group: "home",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "home.belonging.eyebrow",
    route: "/",
    section: "Принадлежность",
    label: "Метка Принадлежности",
    group: "home",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "home.invitation.eyebrow",
    route: "/",
    section: "Приглашение",
    label: "Метка Приглашения",
    group: "home",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "home.space.heading",
    route: "/",
    section: "Пространство",
    label: "«Между светом и лесом»",
    group: "headings",
    kind: "heading",
    defaultEnabled: false,
  },
  {
    id: "home.belonging.heading",
    route: "/",
    section: "Принадлежность",
    label: "«На одной частоте»",
    group: "headings",
    kind: "heading",
    defaultEnabled: false,
  },
  {
    id: "about.page.eyebrow",
    route: "/about",
    section: "Первый экран",
    label: "Метка страницы «О ВНЕ»",
    group: "about",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "about.space.eyebrow",
    route: "/about",
    section: "Пространство",
    label: "Метка Пространства",
    group: "about",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "about.community.eyebrow",
    route: "/about",
    section: "Сообщество",
    label: "Метка Сообщества",
    group: "about",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "about.community.heading",
    route: "/about",
    section: "Сообщество",
    label: "«Внимание важнее статуса»",
    group: "headings",
    kind: "heading",
    defaultEnabled: false,
  },
  {
    id: "about.pine.caption",
    route: "/about",
    section: "Пространство",
    label: "Подпись «Художественный образ»",
    group: "about",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "about.stone.caption",
    route: "/about",
    section: "Сообщество",
    label: "Подпись «Материал и свет»",
    group: "about",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "about.water.caption",
    route: "/about",
    section: "Сообщество",
    label: "Подпись «Тишина и отражение»",
    group: "about",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "events.page.eyebrow",
    route: "/events",
    section: "Первый экран",
    label: "Метка страницы событий",
    group: "events",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "events.card.kicker",
    route: "/events",
    section: "Карточки",
    label: "Редакционная метка карточек",
    group: "events",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "event.page.eyebrow",
    route: "/events/:slug",
    section: "Первый экран",
    label: "Метка страницы события",
    group: "events",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "event.program.eyebrow",
    route: "/events/:slug",
    section: "Программа",
    label: "Метка Программы",
    group: "events",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "event.conditions.eyebrow",
    route: "/events/:slug",
    section: "Условия",
    label: "Метка Условий",
    group: "events",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "faq.page.eyebrow",
    route: "/faq",
    section: "Первый экран",
    label: "Метка FAQ",
    group: "public",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "contact.page.eyebrow",
    route: "/contact",
    section: "Первый экран",
    label: "Метка Связи",
    group: "public",
    kind: "accent",
    defaultEnabled: true,
  },
  {
    id: "rules.page.eyebrow",
    route: "/rules",
    section: "Первый экран",
    label: "Метка Правил",
    group: "public",
    kind: "accent",
    defaultEnabled: true,
  },
] as const satisfies ReadonlyArray<ScrambleTarget>;

export type ScrambleTargetId = (typeof scrambleTargets)[number]["id"];

export const defaultScrambleGroups: Record<ScrambleGroupId, boolean> = {
  home: true,
  about: true,
  events: true,
  public: true,
  headings: false,
};

export const defaultScrambleTargets = Object.fromEntries(
  scrambleTargets.map((target) => [target.id, target.defaultEnabled]),
) as Record<ScrambleTargetId, boolean>;

export const scrambleTargetById = new Map(scrambleTargets.map((target) => [target.id, target]));

const RU_UPPER = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ";
const RU_LOWER = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
const EN_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const EN_LOWER = "abcdefghijklmnopqrstuvwxyz";
const SYMBOLS = "·:;+×=<>#%?";
const LETTER = /\p{L}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;

export function splitScrambleGraphemes(value: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  return typeof Segmenter === "function"
    ? Array.from(
        new Segmenter("ru", { granularity: "grapheme" }).segment(value),
        (part) => part.segment,
      )
    : Array.from(value);
}

export function isScrambleLetter(value: string) {
  return LETTER.test(value);
}

export function glyphPool(source: string, charset: ScrambleCharset) {
  const upper =
    source === source.toLocaleUpperCase("ru") && source !== source.toLocaleLowerCase("ru");
  const native = CYRILLIC.test(source)
    ? upper
      ? RU_UPPER
      : RU_LOWER
    : upper
      ? EN_UPPER
      : EN_LOWER;
  if (charset === "auto") return native;
  const mixed = upper ? `${RU_UPPER}${EN_UPPER}` : `${RU_LOWER}${EN_LOWER}`;
  return charset === "symbols" ? `${mixed}${SYMBOLS}` : mixed;
}

export function orderedLetterIndexes(
  graphemes: string[],
  direction: ScrambleDirection,
  random: () => number = Math.random,
) {
  const indexes = graphemes.reduce<number[]>((result, grapheme, index) => {
    if (isScrambleLetter(grapheme)) result.push(index);
    return result;
  }, []);
  if (direction === "right") return indexes.reverse();
  if (direction === "random") {
    for (let index = indexes.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [indexes[index], indexes[swap]] = [indexes[swap] ?? indexes[index] ?? 0, indexes[index] ?? 0];
    }
  }
  return indexes;
}

export function createScrambleFrame({
  graphemes,
  order,
  progress,
  intensity,
  charset,
  random = Math.random,
}: {
  graphemes: string[];
  order: number[];
  progress: number;
  intensity: number;
  charset: ScrambleCharset;
  random?: () => number;
}) {
  const result = graphemes.slice();
  const settled = Math.floor(Math.min(1, Math.max(0, progress)) * order.length);
  const remaining = order.slice(settled);
  const activeCount = Math.max(1, Math.ceil(remaining.length * intensity));
  for (const index of remaining.slice(0, activeCount)) {
    const source = graphemes[index];
    if (!source) continue;
    const pool = glyphPool(source, charset);
    result[index] = pool[Math.floor(random() * pool.length)] ?? source;
  }
  return result.join("");
}

/** Кадр по графемам: длина массива всегда равна исходной, чтобы оверлей совпадал со слотами. */
export function createScrambleFrameGraphemes(args: Parameters<typeof createScrambleFrame>[0]) {
  const { graphemes, order, progress, intensity, charset, random = Math.random } = args;
  const result = graphemes.slice();
  const settled = Math.floor(Math.min(1, Math.max(0, progress)) * order.length);
  const remaining = order.slice(settled);
  const activeCount = Math.max(1, Math.ceil(remaining.length * intensity));
  for (const index of remaining.slice(0, activeCount)) {
    const source = graphemes[index];
    if (!source) continue;
    const pool = glyphPool(source, charset);
    result[index] = pool[Math.floor(random() * pool.length)] ?? source;
  }
  return result;
}

export function isScrambleTargetEnabled(
  targetId: string,
  groups: Record<ScrambleGroupId, boolean>,
  targets: Record<string, boolean>,
) {
  const target = scrambleTargetById.get(targetId as ScrambleTargetId);
  return Boolean(target && groups[target.group] && targets[target.id]);
}
