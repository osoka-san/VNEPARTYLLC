import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, SectionHeading } from "@/components/app/PageShell";
import { useCookieNotice } from "@/components/app/CookieNotice";
import { cookieIntroduction, cookieNoticeScope } from "@/content/cookies";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/seo";

export const Route = createFileRoute("/cookies")({
  head: () =>
    pageMeta(
      "Файлы cookie и настройки — ВНЕ",
      "Технические записи браузера, вход в аккаунт и сохранение настроек ВНЕ.",
      true,
    ),
  component: CookiesPage,
});

function CookiesPage() {
  const { openNotice } = useCookieNotice();
  return (
    <PageShell
      eyebrow="ВНЕ / Cookies"
      title="Технические настройки сайта"
      intro={cookieIntroduction}
      density="compact"
      quiet
    >
      <article className="mx-auto max-w-3xl space-y-12 px-5 py-12 sm:px-8">
        <section>
          <SectionHeading title="Ваш выбор" />
          <p className="mt-5 leading-8 text-muted-foreground">
            {cookieNoticeScope} Этот выбор не является согласием на рассылки или рекламные
            технологии.
          </p>
          <Button onClick={openNotice} type="button" variant="outline" className="mt-5 min-h-11">
            Открыть уведомление cookies
          </Button>
        </section>
        <section>
          <SectionHeading title="Что сохраняется" />
          <dl className="mt-6 divide-y divide-border">
            <div className="py-5">
              <dt className="font-medium">Вход в аккаунт</dt>
              <dd className="mt-2 leading-7 text-muted-foreground">
                Техническая cookie поддерживает сессию просмотра сайта и админки. Сессия действует
                до 8 часов и прекращается при выходе. Удаление записи может потребовать повторного
                входа.
              </dd>
            </div>
            <div className="py-5">
              <dt className="font-medium">Движение и настройки интерфейса</dt>
              <dd className="mt-2 leading-7 text-muted-foreground">
                Выбранный режим уменьшенного движения и параметры анимации хранятся локально в
                браузере. Режим можно изменить кнопкой «Движение», параметры — в настройках
                анимации. Опубликованные администратором настройки применяются к новым превью.
              </dd>
            </div>
            <div className="py-5">
              <dt className="font-medium">Ответ на это уведомление</dt>
              <dd className="mt-2 leading-7 text-muted-foreground">
                Браузер запоминает нажатие «ОК» на срок до одного года. Запись содержит версию
                уведомления и время выбора. После обновления текста или удаления записи уведомление
                появится снова.
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <SectionHeading title="Как изменить настройки" />
          <p className="mt-5 leading-8 text-muted-foreground">
            Вы можете снова открыть уведомление из подвала сайта и управлять данными сайта в
            настройках браузера. Удаление записей может сбросить предпочтения и потребовать
            повторного входа. Если браузер запрещает сохранение, нажатие «ОК» закрывает уведомление
            для текущего просмотра.
          </p>
          <Link
            to="/privacy"
            className="mt-5 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            Политика конфиденциальности
          </Link>
        </section>
      </article>
    </PageShell>
  );
}
