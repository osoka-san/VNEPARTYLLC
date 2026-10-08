// Component-test entrypoint only. Not imported by the preview build or deployed routes.
import { createRoot } from "react-dom/client";
import { Observatory } from "../../src/components/diagnostics/Observatory";
import { telemetry } from "../../src/components/diagnostics/telemetry";

const append = (count = 1) => {
  for (let n = 0; n < count; n++) telemetry.record("page_ready", "observatory");
};
append(20);
createRoot(document.getElementById("root")!).render(
  <>
    <div style={{ position: "fixed", right: 0, top: 0, zIndex: 1000 }}>
      <button id="append" onClick={() => append()}>
        Append safe fixture
      </button>
      <button id="append-many" onClick={() => append(205)}>
        Roll fixture buffer
      </button>
      <button id="append-error" onClick={() => telemetry.record("render_failed", "observatory")}>
        Append error fixture
      </button>
    </div>
    <Observatory />
  </>,
);
