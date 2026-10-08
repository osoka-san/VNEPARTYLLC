import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getQrAdmissionAvailability, qrAdmissionRead } from "@/lib/admission/admission.functions";
import type { AdmissionReadResult } from "@/lib/admission/contract";
import { ownerPassHref, ownerStateTitle, qrMessage, eventTime } from "./OwnerPassModel";
import "./OwnerPass.css";
export function MemberPasses() {
  const availability = useServerFn(getQrAdmissionAvailability),
    read = useServerFn(qrAdmissionRead);
  const [result, setResult] = useState<AdmissionReadResult | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    setResult(null);
    void availability()
      .then(async (status) => {
        if (!alive) return;
        if (!status.enabled) {
          setResult({ ok: false, reason: status.reason ?? "unconfigured" });
          return;
        }
        const next = await read({ data: { action: "list" } });
        if (alive) setResult(next);
      })
      .catch(() => {
        if (alive) setResult({ ok: false, reason: "unavailable" });
      });
    return () => {
      alive = false;
    };
  }, [availability, read, revision]);
  return (
    <section className="member-passes" aria-labelledby="member-passes-title">
      <h2 id="member-passes-title">Мои пропуска</h2>
      <p className="owner-small">
        Закрытый TEST. QR доступен после одобрения заявки на событие и подтверждения тестовой
        оплаты. Реальная оплата и реальный проход не проверяются.
      </p>
      {!result ? (
        <p role="status">Проверяем пропуска…</p>
      ) : !result.ok ? (
        <p className="owner-message" role="status">
          {qrMessage(result.reason)}
        </p>
      ) : !result.items.length ? (
        <p className="owner-message">Доступных пропусков пока нет.</p>
      ) : (
        <ul className="member-pass-list">
          {result.items.map((pass) => (
            <li key={pass.participationId}>
              <h3>{pass.eventTitle}</h3>
              <p className="owner-small">
                {ownerStateTitle(pass.status)} · {eventTime(pass.entryOpensAt, pass.timezone)}
              </p>
              <a className="owner-button owner-button-secondary" href={ownerPassHref("pass", pass)}>
                Открыть мой пропуск ↗
              </a>
            </li>
          ))}
        </ul>
      )}
      <button
        className="owner-text-button"
        type="button"
        onClick={() => setRevision((value) => value + 1)}
      >
        Обновить пропуска
      </button>
    </section>
  );
}
