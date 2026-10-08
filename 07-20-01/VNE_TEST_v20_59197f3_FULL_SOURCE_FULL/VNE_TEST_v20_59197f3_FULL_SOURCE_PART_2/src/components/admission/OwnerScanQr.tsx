import QRCode from "qrcode";
import { isAdmissionToken } from "@/lib/admission/contract";
/** Render geometry only: no text payload, image URL, cache, download or analytics. */
export function OwnerScanQr({ value }: { value: string }) {
  if (!isAdmissionToken(value)) return null;
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "Q" });
  const size = modules.size + 8,
    dots: string[] = [];
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++)
      if (modules.get(y, x)) dots.push(`M${x + 4},${y + 4}h1v1h-1z`);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Тестовый QR для первичного прохода"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={dots.join("")} fill="#111" />
    </svg>
  );
}
