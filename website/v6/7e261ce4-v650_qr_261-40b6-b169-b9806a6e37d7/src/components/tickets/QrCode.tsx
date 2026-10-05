import { memo, useMemo } from "react";
import QRCode from "qrcode";

// Полная тихая зона 4 модуля. Без логотипов, градиентов и удалённых модулей.
export function qrGeometry(value: string) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "Q" });
  const dots: [number, number][] = [];
  for (let y = 0; y < modules.size; y++)
    for (let x = 0; x < modules.size; x++) if (modules.get(y, x)) dots.push([x + 4, y + 4]);
  return { size: modules.size + 8, dots };
}

export default memo(function QrCode({
  value,
  className = "",
}: {
  value: string | null;
  className?: string;
}) {
  const geo = useMemo(() => (value ? qrGeometry(value) : null), [value]);
  if (!geo)
    return (
      <svg className={className} viewBox="0 0 10 10" role="img" aria-label="QR недоступен">
        <rect width="10" height="10" fill="#fff" />
      </svg>
    );
  const { size, dots } = geo;
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Индивидуальный QR-код пропуска"
    >
      <rect width={size} height={size} fill="#fff" />
      <g fill="#0a1915">
        {dots.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
        ))}
      </g>
    </svg>
  );
});
