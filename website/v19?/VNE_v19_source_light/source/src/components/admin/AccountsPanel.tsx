import { useSiteLoading } from "@/components/loading/SiteLoading";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ShieldCheck, Eye, UserRound, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { siteAdminRequest, useSiteAccess, type SiteAccount } from "@/lib/site-admin";
import "./workspace.css";
const presets: Record<string, string[]> = {
  Просмотр: ["admin.view", "qr.read", "content.read", "requests.read"],
  Дизайнер: ["admin.view", "qr.read", "qr.write", "content.read", "content.write"],
  Управляющий: [
    "admin.view",
    "qr.read",
    "qr.write",
    "content.read",
    "content.write",
    "accounts.read",
    "accounts.manage",
    "audit.read",
    "requests.read",
    "requests.manage",
  ],
};
export function AccountsPanel() {
  const access = useSiteAccess(),
    client = useQueryClient();
  const [query, setQuery] = useState(""),
    [editing, setEditing] = useState<SiteAccount | "new" | null>(null);
  const [notice, setNotice] = useState("");
  const list = useQuery({
    queryKey: ["site-accounts"],
    queryFn: () => siteAdminRequest<{ accounts: SiteAccount[] }>("accounts"),
    enabled: access.can("accounts.read"),
    retry: false,
  });
  if (access.isPending)
    return (
      <div className="aw-empty" role="status">
        Проверяем права…
      </div>
    );
  if (access.error)
    return (
      <div className="aw-message" role="alert">
        {access.error.message}
      </div>
    );
  const accounts = access.can("accounts.read")
    ? (list.data?.accounts ?? [])
    : access.actor
      ? [access.actor]
      : [];
  return (
    <section className="aw-workspace">
      <div className="aw-heading">
        <div>
          <div className="aw-eyebrow">ДОСТУП / 01</div>
          <h2>Учётные записи</h2>
          <p>Персональный вход. Точные права. История действий.</p>
        </div>
        <button
          className="aw-button"
          disabled={!access.can("accounts.manage")}
          onClick={() => setEditing("new")}
        >
          <Plus size={16} /> Создать запись
        </button>
      </div>
      {!access.can("accounts.read") && (
        <div className="aw-message">
          <Eye size={18} />
          <span>
            Режим просмотра. Здесь показана ваша запись. Список команды и выдача прав доступны
            администратору.
          </span>
        </div>
      )}
      <div className="aw-toolbar">
        <label className="aw-search">
          <span className="sr-only">Найти пользователя</span>
          <input
            placeholder="Поиск по имени или логину"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          className="aw-icon-button"
          aria-label="Обновить пользователей"
          onClick={() => {
            void list.refetch();
          }}
          disabled={!access.can("accounts.read") || list.isFetching}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      {(notice || list.error) && (
        <p className="aw-message" role="status">
          {list.error?.message ?? notice}
        </p>
      )}
      <div className="aw-account-grid">
        {accounts
          .filter((a) =>
            (a.displayName + " " + a.username).toLowerCase().includes(query.toLowerCase()),
          )
          .map((a) => (
            <article className="aw-account" key={a.id}>
              <div className="aw-account-top">
                <div className="aw-avatar">
                  {a.role === "owner" ? <ShieldCheck size={23} /> : <UserRound size={23} />}
                </div>
                <span className={"aw-badge " + (a.disabled ? "is-muted" : "")}>
                  {a.disabled
                    ? "Заблокирован"
                    : a.role === "owner"
                      ? "Владелец"
                      : a.role === "reviewer" &&
                          !a.permissions.some((p) => p.endsWith(".write") || p.endsWith(".manage"))
                        ? "Тестовый просмотр"
                        : "Свои права"}
                </span>
              </div>
              <h3>{a.displayName}</h3>
              <p className="aw-login">@{a.username}</p>
              <div className="aw-permissions">
                {a.permissions.map((p) => (
                  <span key={p}>{access.data?.permissionLabels[p] ?? p}</span>
                ))}
              </div>
              <p className="aw-subtle">
                Последний вход:{" "}
                {a.lastLoginAt
                  ? new Date(a.lastLoginAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) +
                    " МСК"
                  : "Ещё не входил"}
              </p>
              <button
                className="aw-button secondary"
                disabled={
                  !access.can("accounts.manage") || a.role === "owner" || a.id === access.actor?.id
                }
                onClick={() => setEditing(a)}
              >
                Настроить доступ
              </button>
            </article>
          ))}
      </div>
      {list.isPending && access.can("accounts.read") && (
        <p role="status">Загружаем пользователей…</p>
      )}
      {accounts.length === 0 && !list.isPending && (
        <div className="aw-empty">Учётные записи не найдены.</div>
      )}
      <Dialog
        open={editing !== null}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="aw-dialog aw-account-dialog">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Новая учётная запись" : "Настроить доступ"}
            </DialogTitle>
            <DialogDescription>
              Права действуют на этом сайте. Допуск на мероприятие выдаётся отдельно.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <AccountEditor
              key={editing === "new" ? "new" : editing.id}
              account={editing === "new" ? null : editing}
              labels={access.data?.permissionLabels ?? {}}
              onSaved={() => {
                setEditing(null);
                setNotice(
                  "Изменения сохранены. При смене прав, пароля или блокировке старые сессии завершены.",
                );
                void client.invalidateQueries({ queryKey: ["site-accounts"] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
function AccountEditor({
  account,
  labels,
  onSaved,
}: {
  account: SiteAccount | null;
  labels: Record<string, string>;
  onSaved: () => void;
}) {
  const [name, setName] = useState(account?.displayName ?? ""),
    [username, setUsername] = useState(account?.username ?? ""),
    [password, setPassword] = useState("");
  const [grants, setGrants] = useState(account?.permissions ?? presets["Просмотр"]!),
    [disabled, setDisabled] = useState(account?.disabled ?? false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState(false);
  useSiteLoading(busy, "Сохраняем учётную запись");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await siteAdminRequest("accounts", {
        action: account ? "update" : "create",
        ...(account ? { id: account.id, version: account.version, disabled } : { username }),
        displayName: name,
        permissions: grants,
        ...(password ? { password } : {}),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="aw-form" onSubmit={(e) => void submit(e)}>
      <fieldset disabled={busy}>
        <label>
          Имя
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Логин
          <input
            required
            disabled={Boolean(account)}
            pattern="[a-z0-9][a-z0-9_.-]{2,39}"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
          />
        </label>
        <label>
          {account ? "Новый пароль (если нужно заменить)" : "Пароль"}
          <input
            type={visible ? "text" : "password"}
            required={!account}
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="aw-inline">
          <button type="button" className="aw-text-link" onClick={() => setVisible(!visible)}>
            {visible ? "Скрыть" : "Показать"} пароль
          </button>
          <button
            type="button"
            className="aw-text-link"
            onClick={() => {
              setPassword(
                "Vne-" +
                  Array.from(crypto.getRandomValues(new Uint8Array(9)), (x) =>
                    x.toString(16).padStart(2, "0"),
                  ).join(""),
              );
              setVisible(true);
            }}
          >
            Сгенерировать
          </button>
        </div>
        <p className="aw-subtle">Не менее 12 символов. Сохраните пароль до закрытия окна.</p>
        <div className="aw-preset-row">
          {Object.entries(presets).map(([name, values]) => (
            <button
              type="button"
              className="aw-chip"
              key={name}
              onClick={() => setGrants([...values])}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="aw-grants">
          {Object.entries(labels).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={grants.includes(key)}
                onChange={(e) =>
                  setGrants(e.target.checked ? [...grants, key] : grants.filter((p) => p !== key))
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {account && (
          <label className="aw-check">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
            />{" "}
            Заблокировать вход
          </label>
        )}
        {error && (
          <p className="aw-error" role="alert">
            {error}
          </p>
        )}
        <button className="aw-button" type="submit">
          {busy ? "Сохраняем…" : account ? "Сохранить доступ" : "Создать учётную запись"}
        </button>
      </fieldset>
    </form>
  );
}
