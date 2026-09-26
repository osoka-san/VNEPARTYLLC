import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app/PageShell";
import { StatusBadge } from "@/components/app/EventCard";
import { MotionControlPanel } from "@/components/admin/MotionControlPanel";
import { pageMeta } from "@/lib/seo";
import { AnimatedText } from "@/components/motion/AnimatedText";
import { useMotionEnv } from "@/components/motion/MotionProvider";
import { SegmentedControl } from "@/components/motion/SegmentedControl";
import { privateRouteHeaders } from "@/components/auth/AuthUi";
import { AppearanceOnlyNotice, StaffBlocked, enforceStaff } from "@/components/auth/StaffGate";
import { getStaffAccess } from "@/lib/auth/auth.functions";
import { MembershipRequestsPanel } from "@/components/admin/MembershipRequestsPanel";
import { TeamPanel } from "@/components/admin/TeamPanel";
import { SectionsPanel } from "@/components/admin/SectionsPanel";

export const Route = createFileRoute("/admin")({
  headers: privateRouteHeaders,
  // Серверный guard: при подключённом бэкенде нужен вход, aal2 и актуальное назначение.
  loader: async () =>
    enforceStaff((await getStaffAccess({ data: { area: "admin" } })).decision, "/admin"),
  head: () =>
    pageMeta(
      "Управление — демонстрация ВНЕ",
      "Незащищённая демонстрационная панель управления сайтом ВНЕ.",
      true,
    ),
  component: AdminPage,
});

const sections = [
  { key: "motion", label: "Движение" },
  { key: "requests", label: "Заявки" },
  { key: "team", label: "Команда" },
  { key: "overview", label: "Обзор" },
  { key: "content", label: "Разделы" },
  { key: "operations", label: "Операции" },
] as const;

type SectionKey = (typeof sections)[number]["key"];

const overview = [
  { label: "Публичных страниц", value: "19", hint: "Главная, события, документы и оболочки." },
  { label: "Глав на главной", value: "06", hint: "От «Порога» до «Приглашения»." },
  { label: "Фоновых сцен", value: "04", hint: "Каждая в версиях для телефона и экрана." },
  { label: "Заявок", value: "В работе", hint: "Новые заявки доступны в отдельном разделе." },
];

const operations = [
  "Заявки",
  "Гости",
  "Заказы",
  "QR и проход",
  "Команда и роли",
  "Журнал действий",
];

function AdminPage() {
  const decision = Route.useLoaderData();
  if (decision === "denied" || decision === "error")
    return <StaffBlocked decision={decision} eyebrow="ВНЕ / управление" />;
  return <AdminPanel appearanceOnly={decision === "unconfigured"} />;
}

function AdminPanel({ appearanceOnly }: { appearanceOnly: boolean }) {
  const [section, setSection] = useState<SectionKey>("motion");
  const { settings } = useMotionEnv();
  const adminText = settings.textAdmin;

  return (
    <PageShell
      eyebrow="ВНЕ / управление"
      title="Панель управления сайтом"
      intro="Здесь настраивается поведение сайта и рассматриваются заявки на регистрацию."
      density="compact"
    >
      <section className="mx-auto max-w-[1376px] px-5 py-10 sm:px-8 sm:py-14 lg:px-12">
        <StatusBadge>{appearanceOnly ? "Только внешний вид" : "Защищённая зона"}</StatusBadge>
        {appearanceOnly && (
          <div className="mt-5">
            <AppearanceOnlyNotice>
              Тестовая среда не подключена: это панель внешнего вида без данных гостей и без прав.
              После подключения раздел закрывается серверной проверкой команды.
            </AppearanceOnlyNotice>
          </div>
        )}
        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          <AnimatedText role="body" enabled={adminText}>
            Данные заявок доступны только назначенной команде с подтверждённым вторым фактором.
            Настройки движения сохраняются только в этом браузере.
          </AnimatedText>
        </p>

        <nav className="mt-8 overflow-x-auto border border-border p-1" aria-label="Разделы панели">
          <SegmentedControl
            value={section}
            options={sections}
            onChange={setSection}
            label="Раздел панели"
          />
        </nav>

        <div className="mt-10">
          {section === "motion" && <MotionControlPanel />}

          {section === "requests" && !appearanceOnly && (
            <>
              <Link to="/admin/applications" className="mb-6 inline-block text-blue underline">
                Заявки на события (очередь модерации) →
              </Link>
              <MembershipRequestsPanel />
            </>
          )}
          {section === "requests" && appearanceOnly && (
            <AppearanceOnlyNotice>
              Заявки появятся после подключения защищённой среды и назначения роли.
            </AppearanceOnlyNotice>
          )}

          {section === "team" && !appearanceOnly && <TeamPanel />}
          {section === "team" && appearanceOnly && (
            <AppearanceOnlyNotice>Команда появится после входа с ролью и MFA.</AppearanceOnlyNotice>
          )}

          {section === "overview" && (
            <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {overview.map((item) => (
                <div className="min-h-36 bg-surface p-5" key={item.label}>
                  <p className="font-display text-3xl">
                    <AnimatedText role="heading" enabled={adminText}>
                      {item.value}
                    </AnimatedText>
                  </p>
                  <h2 className="mt-3 font-display text-sm uppercase tracking-wide">
                    <AnimatedText role="accent" enabled={adminText}>
                      {item.label}
                    </AnimatedText>
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    <AnimatedText role="body" enabled={adminText}>
                      {item.hint}
                    </AnimatedText>
                  </p>
                </div>
              ))}
            </div>
          )}

          {section === "content" && !appearanceOnly && <SectionsPanel />}
          {section === "content" && appearanceOnly && (
            <AppearanceOnlyNotice>
              Редактор разделов доступен после входа с ролью и MFA.
            </AppearanceOnlyNotice>
          )}

          {section === "operations" && (
            <div className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
              {operations.map((area, index) => (
                <div className="min-h-36 bg-surface p-5" key={area}>
                  <p className="font-display text-xs text-mint">
                    <AnimatedText role="accent" enabled={adminText}>
                      {String(index + 1).padStart(2, "0")}
                    </AnimatedText>
                  </p>
                  <h2 className="mt-4 font-display text-lg">
                    <AnimatedText role="heading" enabled={adminText}>
                      {area}
                    </AnimatedText>
                  </h2>
                  <p className="mt-3 text-sm text-muted-foreground">
                    <AnimatedText role="body" enabled={adminText}>
                      Состояние готовится. Действия недоступны.
                    </AnimatedText>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
