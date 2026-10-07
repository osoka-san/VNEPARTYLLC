import { Link, createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeading } from "@/components/app/PageShell";
import { pageMeta } from "@/lib/seo";
import { EditorialPicture } from "@/components/app/EditorialPicture";
import { ImageReveal } from "@/components/motion/Primitives";
import { InView } from "@/components/motion/InView";
import { TextLoop } from "@/components/motion/TextLoop";
import { TextSection } from "@/components/motion/TextSection";
import { TextScramble } from "@/components/motion/Interactive";
import { editorialMedia } from "@/content/editorial-media";
import { getPublishedSections } from "@/lib/sections.functions";
import { sectionText } from "@/lib/sections";
export const Route = createFileRoute("/about")({
  head: () => ({
    ...pageMeta("О проекте — ВНЕ", "Музыка, пространство и сообщество проекта ВНЕ."),
    links: [
      {
        rel: "preload",
        as: "image",
        href: editorialMedia.aboutPines.src,
        imageSrcSet: editorialMedia.aboutPines.avifSrcSet,
        imageSizes: "(min-width: 1376px) 734px, (min-width: 1024px) 58vw, calc(100vw - 40px)",
        type: "image/avif",
        fetchPriority: "high",
      },
    ],
  }),
  loader: () =>
    getPublishedSections({ data: { keys: ["about-intro", "about-space", "about-community"] } }),
  component: AboutPage,
});
function AboutPage() {
  const pub = Route.useLoaderData();
  const intro = sectionText(pub, "about-intro");
  const space = sectionText(pub, "about-space");
  const community = sectionText(pub, "about-community");
  return (
    <PageShell
      eyebrow="ВНЕ / о проекте"
      scrambleEyebrow="about.page.eyebrow"
      title={intro.title}
      intro={intro.body}
      density="editorial"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-12 sm:px-8 sm:py-18 lg:px-12 lg:py-24">
        <div className="grid gap-x-8 gap-y-14 lg:grid-cols-12 lg:gap-y-24">
          <section id="space" className="scroll-mt-24 self-center lg:col-span-5">
            <SectionHeading
              eyebrow="01 / пространство"
              title={space.title}
              scrambleEyebrow="about.space.eyebrow"
            />
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              <TextSection>{space.body}</TextSection>
            </p>
            <InView>
              <p className="mt-6 font-display text-sm text-mint">
                <TextLoop
                  mode="custom"
                  items={["Музыка", "Свет", "Пространство"]}
                  staticText="Музыка / Свет / Пространство"
                />
              </p>
            </InView>
          </section>

          <figure className="lg:col-span-7">
            <ImageReveal className="aspect-[4/3] bg-background">
              <EditorialPicture
                src={editorialMedia.aboutPines.src}
                avifSrcSet={editorialMedia.aboutPines.avifSrcSet}
                webpSrcSet={editorialMedia.aboutPines.webpSrcSet}
                sizes="(min-width: 1376px) 734px, (min-width: 1024px) calc((100vw - 448px) * 0.583333 + 192px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                width={1448}
                height={1086}
                alt="Ночные сосновые кроны в сдержанном направленном свете"
                loading="eager"
                fetchPriority="high"
                objectPosition="50% 50%"
                className="h-full w-full !bg-background"
              />
            </ImageReveal>
            <figcaption className="mt-3 text-xs text-muted-foreground">
              <TextScramble targetId="about.pine.caption">
                Художественный образ ВНЕ, не фотография площадки
              </TextScramble>
            </figcaption>
          </figure>

          <section
            id="community"
            className="scroll-mt-24 lg:col-span-7 lg:col-start-6 lg:row-start-2"
          >
            <SectionHeading
              eyebrow="02 / сообщество"
              title={community.title}
              body={community.body}
              scrambleEyebrow="about.community.eyebrow"
              scrambleTitle="about.community.heading"
            />
            <InView>
              <div className="mt-7 flex flex-wrap gap-5">
                <Link
                  to="/faq"
                  search={{ event: undefined }}
                  hash="access"
                  className="inline-flex min-h-11 items-center text-blue underline underline-offset-4"
                >
                  Что означает допуск
                </Link>
                <Link
                  to="/apply"
                  search={{ event: undefined }}
                  className="inline-flex min-h-11 items-center text-blue underline underline-offset-4"
                >
                  Пройти анкету
                </Link>
              </div>
            </InView>
          </section>

          <figure className="lg:col-span-4 lg:row-start-2">
            <ImageReveal className="aspect-[4/3] bg-background">
              <EditorialPicture
                src={editorialMedia.aboutStone.src}
                avifSrcSet={editorialMedia.aboutStone.avifSrcSet}
                webpSrcSet={editorialMedia.aboutStone.webpSrcSet}
                sizes="(min-width: 1376px) 406px, (min-width: 1024px) calc((100vw - 448px) * 0.333333 + 96px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                width={editorialMedia.aboutStone.width}
                height={editorialMedia.aboutStone.height}
                alt="Художественный графитовый камень в направленном свете"
                objectPosition="58% 50%"
                className="h-full w-full !bg-background"
              />
            </ImageReveal>
            <figcaption className="mt-3 text-xs text-muted-foreground">
              <TextScramble targetId="about.stone.caption">Материал и свет</TextScramble>
            </figcaption>
          </figure>

          <figure className="lg:col-span-7 lg:col-start-6">
            <ImageReveal className="aspect-video bg-background">
              <EditorialPicture
                src={editorialMedia.aboutWater.src}
                avifSrcSet={editorialMedia.aboutWater.avifSrcSet}
                webpSrcSet={editorialMedia.aboutWater.webpSrcSet}
                sizes="(min-width: 1376px) 734px, (min-width: 1024px) calc((100vw - 448px) * 0.583333 + 192px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                width={1672}
                height={941}
                alt="Короткое отражение нейтрального света на тёмной воде"
                objectPosition="68% 50%"
                className="h-full w-full !bg-background"
              />
            </ImageReveal>
            <figcaption className="mt-3 text-xs text-muted-foreground">
              <TextScramble targetId="about.water.caption">Тишина и отражение</TextScramble>
            </figcaption>
          </figure>
        </div>
      </section>
    </PageShell>
  );
}
