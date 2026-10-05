/**
 * Серверные функции билетов. Каждое админ-действие повторно проверяет Origin и staff/MFA guard;
 * VNE_PASS_SERVICE_URL / VNE_PASS_ADMIN_KEY читаются только здесь, внутри handler.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

async function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("X-Robots-Tag", "noindex, nofollow");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

async function deps() {
  const { isSameOrigin } = await import("@/lib/auth/auth-core");
  const { readPassConfig, staffAdminOk } = await import("./pass-proxy.server");
  const req = getRequest();
  return {
    originOk: isSameOrigin(req.headers.get("origin"), req.url),
    staffOk: () => staffAdminOk(req),
    config: readPassConfig(process.env as Record<string, string | undefined>),
  };
}

const passthrough = (d: unknown) => d;

/** Только флаг «выдача подключена», и только для актуального staff. */
export const getTicketServiceStatus = createServerFn({ method: "GET" }).handler(async () => {
  await privateResponse();
  const d = await deps();
  if (!(await d.staffOk())) return { issueEnabled: false };
  return { issueEnabled: Boolean(d.config?.adminKey) };
});

export const issueTicket = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    await privateResponse();
    const { handleAdminAction } = await import("./pass-proxy.server");
    return handleAdminAction({ kind: "issue", input: data }, await deps());
  });

export const getTicket = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    await privateResponse();
    const { handleAdminAction } = await import("./pass-proxy.server");
    return handleAdminAction({ kind: "get", input: data }, await deps());
  });

export const revokeTicket = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    await privateResponse();
    const { handleAdminAction } = await import("./pass-proxy.server");
    return handleAdminAction({ kind: "revoke", input: data }, await deps());
  });

/** Предъявитель ссылки: без admin key и без проверки роли; просмотр не погашает код. */
export const readPass = createServerFn({ method: "POST" })
  .inputValidator(passthrough)
  .handler(async ({ data }) => {
    await privateResponse();
    const { handleReadPass } = await import("./pass-proxy.server");
    const d = await deps();
    return handleReadPass(data, { originOk: d.originOk, config: d.config });
  });
