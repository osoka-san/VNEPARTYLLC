import { useId } from "react";

type Pt = { x: number; y: number };

/**
 * LanyardRibbon renders a flexible, curved fabric lanyard strap
 * given an array of Verlet physics points: [{x, y}, ...].
 * It calculates normal vectors at each node to draw a consistent-width ribbon mesh,
 * complete with woven fabric pattern, edge stitching, and curved text branding.
 */
export default function LanyardRibbon({
  points = [],
  width = 36,
  text = "ВНЕ / PRIVATE EXPERIENCE",
  badgeNumber = "1.",
  color = "#141518",
  edgeColor = "#24272e",
}: {
  points?: Pt[];
  width?: number;
  text?: string;
  badgeNumber?: string;
  color?: string;
  edgeColor?: string;
}) {
  const pathId = useId().replace(/:/g, "");

  if (!points || points.length < 2) return null;

  const halfW = width / 2;

  // Calculate normals at each point to construct left and right edge boundaries
  const leftPts: Pt[] = [];
  const rightPts: Pt[] = [];
  const centerPts: Pt[] = [];

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]!;
    let dx = 0;
    let dy = 1;

    if (i === 0) {
      dx = points[1]!.x - curr.x;
      dy = points[1]!.y - curr.y;
    } else if (i === points.length - 1) {
      dx = curr.x - points[i - 1]!.x;
      dy = curr.y - points[i - 1]!.y;
    } else {
      dx = points[i + 1]!.x - points[i - 1]!.x;
      dy = points[i + 1]!.y - points[i - 1]!.y;
    }

    const len = Math.hypot(dx, dy) || 1;
    // Normal vector perpendicular to curve direction
    const nx = -dy / len;
    const ny = dx / len;

    leftPts.push({ x: curr.x - nx * halfW, y: curr.y - ny * halfW });
    rightPts.push({ x: curr.x + nx * halfW, y: curr.y + ny * halfW });
    centerPts.push({ x: curr.x, y: curr.y });
  }

  // Construct smooth SVG path through points using Catmull-Rom or smooth Béziers
  const buildSmoothCurve = (pts: Pt[]) => {
    if (pts.length < 2) return "";
    let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2 < pts.length ? i + 2 : pts.length - 1]!;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
    }
    return d;
  };

  // Center curve for textPath
  const centerPathD = buildSmoothCurve(centerPts);

  // Left boundary forward, right boundary backwards to form closed ribbon polygon
  const leftD = buildSmoothCurve(leftPts);
  const rightD = buildSmoothCurve([...rightPts].reverse());

  // Closed ribbon contour
  const ribbonD = `${leftD} L ${rightPts[rightPts.length - 1]!.x.toFixed(2)} ${rightPts[rightPts.length - 1]!.y.toFixed(2)} ${rightD.replace(/^M [^ ]+ [^ ]+/, "")} Z`;

  return (
    <g className="lanyard-ribbon-group">
      <defs>
        {/* Fabric weave pattern */}
        <pattern id={`fabric-weave-${pathId}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M 0 2 L 2 0 L 4 2 L 2 4 Z" fill="rgba(255,255,255,0.03)" />
          <path d="M 2 0 L 4 2 L 2 4 L 0 2 Z" fill="rgba(0,0,0,0.18)" />
        </pattern>

        {/* Ribbon length gradient with subtle lighting */}
        <linearGradient id={`ribbon-grad-${pathId}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a1c22" />
          <stop offset="50%" stopColor={color} />
          <stop offset="100%" stopColor="#101114" />
        </linearGradient>

        {/* Center guide path for text */}
        <path id={`text-spine-${pathId}`} d={centerPathD} fill="none" />
      </defs>

      {/* Ribbon Shadow */}
      <path
        d={ribbonD}
        fill="none"
        stroke="rgba(0,0,0,0.2)"
        strokeWidth="6"
        filter="blur(4px)"
        transform="translate(0, 3)"
      />

      {/* Main Ribbon Body */}
      <path d={ribbonD} fill={`url(#ribbon-grad-${pathId})`} stroke="#0d0e11" strokeWidth="0.8" />

      {/* Fabric Texture Overlay */}
      <path d={ribbonD} fill={`url(#fabric-weave-${pathId})`} opacity="0.85" />

      {/* Left Edge Stitched Seam */}
      <path
        d={leftD}
        fill="none"
        stroke={edgeColor}
        strokeWidth="1.2"
        strokeDasharray="3 1.8"
        opacity="0.7"
      />

      {/* Right Edge Stitched Seam */}
      <path
        d={buildSmoothCurve(rightPts)}
        fill="none"
        stroke={edgeColor}
        strokeWidth="1.2"
        strokeDasharray="3 1.8"
        opacity="0.7"
      />

      {/* Center Highlight Shimmer */}
      <path d={centerPathD} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={width * 0.5} />

      {/* Printed Lanyard Text - following the ribbon curve */}
      <text
        fill="#ffffff"
        fontSize="6.5"
        fontWeight="600"
        letterSpacing="0.09em"
        fontFamily="'Onest', sans-serif"
        textAnchor="middle"
        opacity="0.9"
        dy="2.6"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <textPath href={`#text-spine-${pathId}`} startOffset="37%">
          {text}
        </textPath>
      </text>

      {/* Printed Numeral ('1.', '07', etc.) near bottom of ribbon */}
      <text
        fill="#ffffff"
        fontSize="14.5"
        fontWeight="800"
        fontFamily="'Onest', sans-serif"
        textAnchor="middle"
        opacity="0.95"
        dy="5"
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <textPath href={`#text-spine-${pathId}`} startOffset="84%">
          {badgeNumber}
        </textPath>
      </text>
    </g>
  );
}
