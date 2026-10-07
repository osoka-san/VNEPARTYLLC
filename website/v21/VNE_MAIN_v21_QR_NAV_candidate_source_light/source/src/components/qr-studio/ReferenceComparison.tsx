import { QR_STUDIO_TEMPLATES, templateImage } from "@/lib/qr-studio/catalog";
export function ReferenceComparison() {
  return (
    <div className="qs-comparison">
      <h2>Шесть референсов и работающие QR</h2>
      <p className="qs-hint">
        Слева художественный образец, справа генератор с текстом «на удачу». Поля и служебные
        элементы сохранены; рисунок меняется вместе с содержимым QR.
      </p>
      {QR_STUDIO_TEMPLATES.map((template) => (
        <section key={template.id}>
          <h3>{template.name}</h3>
          <div className="qs-comparison-grid qs-comparison-pair">
            <figure>
              <img
                src={templateImage(template.id, "reference")}
                alt={`${template.name} · исходный референс`}
                loading="lazy"
              />
              <figcaption>Исходный референс</figcaption>
            </figure>
            <figure>
              <img
                src={templateImage(template.id, "working")}
                alt={`${template.name} · настоящий QR`}
                loading="lazy"
              />
              <figcaption>Рабочий QR · «на удачу»</figcaption>
            </figure>
          </div>
        </section>
      ))}
    </div>
  );
}
