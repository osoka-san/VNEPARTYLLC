import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Layers3 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "./workspace.css";
const details: Record<string, string[]> = {
  applications: [
    "Очередь заявок и карточка гостя",
    "Решения модератора и история изменений",
    "Подключение базы заявок",
  ],
  orders: [
    "Список заказов и статусы",
    "История оплаты и возвратов",
    "Подключение платёжного сервиса",
  ],
  requests: [
    "Заявки на членство",
    "Приглашения после одобрения",
    "Подключение закрытой базы гостей",
  ],
  team: [
    "Назначения команды и рабочие роли",
    "Допуск к персональным данным",
    "Подключение проверки второго фактора",
  ],
};
export function UnavailableBody({ section, label }: { section: string; label: string }) {
  return (
    <div className="aw-unavailable">
      <div className="aw-section-number">ВНЕ / В РАЗРАБОТКЕ</div>
      <Layers3 size={38} strokeWidth={1} className="aw-unavailable-icon" />
      <h2>Раздел ещё не заполнен</h2>
      <p>«{label}» появится здесь после подключения необходимых данных и проверки функций.</p>
      <ul>
        {(details[section] ?? ["Подготовка данных", "Настройка доступа", "Проверка функций"]).map(
          (x) => (
            <li key={x}>{x}</li>
          ),
        )}
      </ul>
      <p className="aw-subtle">Для доступа к этому сайту используйте раздел «Учётные записи».</p>
      <Link to="/admin" search={{ section: "accounts" }} className="aw-text-link">
        Учётные записи <ArrowUpRight size={16} />
      </Link>
    </div>
  );
}
export function UnavailableDialog({
  item,
  onClose,
}: {
  item: { key: string; label: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="aw-dialog">
        <DialogHeader className="sr-only">
          <DialogTitle>Раздел ещё не заполнен</DialogTitle>
          <DialogDescription>Статус подготовки выбранного раздела.</DialogDescription>
        </DialogHeader>
        {item && <UnavailableBody section={item.key} label={item.label} />}
      </DialogContent>
    </Dialog>
  );
}
