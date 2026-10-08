import { useEffect, useState } from "react";
import { PATTERNS, type Pattern } from "@/lib/qr-studio/pattern";
import { renderArtwork } from "@/lib/qr-studio/render-client";
export function ReferenceComparison() {
  const [samples, setSamples] = useState<{ pattern: Pattern; svg: string }[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all(
      PATTERNS.map(async (pattern) => ({
        pattern,
        svg: (await renderArtwork("на удачу", pattern, controller.signal)).art?.svg ?? "",
      })),
    )
      .then((value) => {
        if (!controller.signal.aborted) setSamples(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <div className="qs-comparison">
      <h2>От референса к работающему коду</h2>
      <p className="qs-hint">
        Два генератора, один текст — «на удачу». Сравните характер линий, ритм и окончания. Референс
        — художественный образец; справа — настоящий QR.
      </p>
      {!samples.length && <p role="status">Собираем новые композиции…</p>}
      {samples.map(({ pattern, svg }) => (
        <section key={pattern.geometry}>
          <h3>{pattern.name}</h3>
          <div className="qs-comparison-grid">
            <figure>
              <div className={`qs-reference-frame ${pattern.geometry}`}>
                <div className="qs-reference-crop">
                  <img
                    src={`/assets/qr-studio/reference-${pattern.geometry}.png`}
                    alt={`Выбранный референс ${pattern.name}`}
                    loading="lazy"
                  />
                </div>
              </div>
              <figcaption>
                Выбранный референс · {pattern.geometry === "syncopa" ? "02" : "04"}
              </figcaption>
            </figure>
            <figure>
              <img
                src={`/assets/qr-studio/before-clean-${pattern.geometry}.svg`}
                alt="Версия со скриншота: до исправления контуров"
                loading="lazy"
              />
              <figcaption>До исправления контуров</figcaption>
            </figure>
            <figure>
              <div dangerouslySetInnerHTML={{ __html: svg }} />
              <figcaption>Цельные формы · «на удачу»</figcaption>
            </figure>
          </div>
        </section>
      ))}
    </div>
  );
}
