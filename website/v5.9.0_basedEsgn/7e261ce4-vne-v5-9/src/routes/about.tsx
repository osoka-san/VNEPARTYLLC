import { Link, createFileRoute } from "@tanstack/react-router";
import { PageShell, SectionHeading } from "@/components/app/PageShell";
import { pageMeta } from "@/lib/seo";
import { EditorialPicture } from "@/components/app/EditorialPicture";
import { ImageReveal } from "@/components/motion/Primitives";
import { InView } from "@/components/motion/InView";
import { TextLoop } from "@/components/motion/TextLoop";
import { TextSection } from "@/components/motion/TextSection";
import { TextScramble } from "@/components/motion/Interactive";
export const Route = createFileRoute("/about")({
  head: () => pageMeta("О проекте — ВНЕ", "Музыка, пространство и сообщество проекта ВНЕ."),
  component: AboutPage,
});
function AboutPage() {
  return (
    <PageShell
      eyebrow="ВНЕ / о проекте"
      scrambleEyebrow="about.page.eyebrow"
      title="Пространство для внимательного слушания"
      intro="ВНЕ соединяет музыку, свет и временную архитектуру. Факты о будущей площадке будут опубликованы отдельно после подтверждения."
      density="editorial"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-12 sm:px-8 sm:py-18 lg:px-12 lg:py-24">
        <div className="grid gap-x-8 gap-y-14 lg:grid-cols-12 lg:gap-y-24">
          <section id="space" className="scroll-mt-24 self-center lg:col-span-5">
            <SectionHeading
              eyebrow="01 / пространство"
              title="Художественный образ — не адрес"
              scrambleEyebrow="about.space.eyebrow"
            />
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              <TextSection>
                Свет, масштаб и паузы формируют восприятие музыки. Изображения передают направление
                атмосферы, но не подтверждают конкретную площадку или её характеристики.
              </TextSection>
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
                src="/media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-1448.webp"
                avifSrcSet="/media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-480.avif 480w, /media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-960.avif 960w, /media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-1448.avif 1448w"
                webpSrcSet="/media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-480.webp 480w, /media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-960.webp 960w, /media/gallery-of-light/editorial-v2/vne-about-pine-canopy-v1-1448.webp 1448w"
                sizes="(min-width: 1376px) 734px, (min-width: 1024px) calc((100vw - 448px) * 0.583333 + 192px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                width={1448}
                height={1086}
                alt="Ночные сосновые кроны в сдержанном направленном свете"
                objectPosition="50% 50%"
                className="h-full w-full !bg-background"
              />
            </ImageReveal>
            <figcaption className="mt-3 text-xs text-muted-foreground">
              <TextScramble targetId="about.pine.caption">
                Художественный образ пространства
              </TextScramble>
            </figcaption>
          </figure>

          <section
            id="community"
            className="scroll-mt-24 lg:col-span-7 lg:col-start-6 lg:row-start-2"
          >
            <SectionHeading
              eyebrow="02 / сообщество"
              title="Внимание важнее статуса"
              body="Проект задуман для людей, которым важны музыка, уважение к пространству и друг к другу. Конкретные условия участия будут опубликованы только после утверждения."
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
                  Оставить интерес
                </Link>
              </div>
            </InView>
          </section>

          <figure className="lg:col-span-4 lg:row-start-2">
            <ImageReveal className="aspect-[4/3] bg-background">
              <EditorialPicture
                src="/media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-1280.webp"
                avifSrcSet="/media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-480.avif 480w, /media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-800.avif 800w, /media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-1280.avif 1280w, /media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-1448.avif 1448w"
                webpSrcSet="/media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-480.webp 480w, /media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-800.webp 800w, /media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-1280.webp 1280w, /media/gallery-of-light/addon-v4/vne-about-stone-detail-v4-b-1448.webp 1448w"
                sizes="(min-width: 1376px) 406px, (min-width: 1024px) calc((100vw - 448px) * 0.333333 + 96px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)"
                width={1280}
                height={960}
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
                src="/media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-1672.webp"
                avifSrcSet="/media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-480.avif 480w, /media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-960.avif 960w, /media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-1672.avif 1672w"
                webpSrcSet="/media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-480.webp 480w, /media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-960.webp 960w, /media/gallery-of-light/editorial-v2/vne-about-dark-water-reflection-v1-1672.webp 1672w"
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
