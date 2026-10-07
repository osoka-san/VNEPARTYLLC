import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { designConfig } from "@/config/design-config";

export type PortalLinkSpec = {
  id: string;
  color: string;
  path: string;
  anchor: [number, number];
  sideCutX: number;
};

export const SVG_TO_WORLD = 0.01;

// Full, owner-approved 10C11-6 silhouettes; never substitute reconstructed front profiles.
export const portalLinks: PortalLinkSpec[] = [
  {
    id: "portal-link-01",
    color: "#86ABFF",
    anchor: [183.3, 197.02362286850015],
    sideCutX: 24.0,
    path: "M1.6 28.13231Q1.6 20.13231 9.02781 23.10343L24 29.09231Q24 29.09231 24 29.09231L357.49523 152.22901Q365 155 365 163L365 298Q365 306 357.57219 303.02887L335.19947 294.07979Q330 292 330 286.4L330 186Q330 181 325.29556 179.3064L84.70444 92.6936Q80 91 80 96L80 338.4Q80 344 75.04177 346.60307L31.08318 369.68133Q24 373.4 16.57219 370.42887L9.02781 367.41113Q1.6 364.44 1.6 356.44Z",
  },
  {
    id: "portal-link-02",
    color: "#30E5AD",
    anchor: [203.6, 236.90181507152795],
    sideCutX: 120.0,
    path: "M103.2 146.02419Q103.2 140.02419 108.77086 142.25253L120 146.74419Q120 146.74419 120 146.74419L298.3451 209.99448Q304 212 304 218L304 287Q304 293 298.41549 290.80609L279.90916 283.53574Q276 282 276 277.8L276 237Q276 233 272.21534 231.70525L165.78466 195.29475Q162 194 162 198L162 306.8Q162 311 158.29412 312.97647L125.29412 330.57647Q120 333.4 114.42914 331.17166L108.77086 328.90834Q103.2 326.68 103.2 320.68Z",
  },
  {
    id: "portal-link-03",
    color: "#E55330",
    anchor: [229.88, 263.30156389868256],
    sideCutX: 206.4,
    path: "M195.76 232.16Q195.76 229.16 198.54543 230.27417L206.4 233.416Q206.4 233.416 206.4 233.416L261.15968 252.03429Q264 253 264 256L264 279Q264 282 261.22597 280.85775L248.94182 275.79957Q247 275 247 272.9L247 267.5Q247 266 245.58739 265.4955L234.41261 261.5045Q233 261 233 262.5L233 283.9Q233 286 231.06457 286.81492L209.16491 296.03583Q206.4 297.2 203.61457 296.08583L198.54543 294.05817Q195.76 292.944 195.76 289.944Z",
  },
];

function buildPortalGeometry(spec: PortalLinkSpec) {
  const loader = new SVGLoader();
  const parsed = loader.parse(
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="${spec.path}" /></svg>`,
  );
  const shapePath = parsed.paths[0];
  if (!shapePath) throw new Error(`Portal profile could not be parsed: ${spec.id}`);
  const toWorld = (point: THREE.Vector2) =>
    new THREE.Vector2(
      (point.x - spec.anchor[0]) * SVG_TO_WORLD,
      (spec.anchor[1] - point.y) * SVG_TO_WORLD,
    );
  const sourceShapes = shapePath.toShapes();
  const shapes = sourceShapes.map((sourceShape) => {
    const shape = new THREE.Shape(sourceShape.getPoints(36).map(toWorld));
    shape.holes = sourceShape.holes.map(
      (sourceHole) => new THREE.Path(sourceHole.getPoints(36).map(toWorld)),
    );
    return shape;
  });
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: designConfig.material.depth,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: designConfig.material.bevel,
    bevelThickness: designConfig.material.bevel,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -designConfig.material.depth / 2);
  // Retain the illustrated left facet from the original SVG as a subtle vertex gradient.
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const sourceLeft = Math.min(
    ...sourceShapes.flatMap((shape) => shape.getPoints(8).map((p) => p.x)),
  );
  for (let i = 0; i < positions.count; i++) {
    const sourceX = positions.getX(i) / SVG_TO_WORLD + spec.anchor[0];
    const t = THREE.MathUtils.clamp((sourceX - sourceLeft) / (spec.sideCutX - sourceLeft), 0, 1);
    const shade = 0.43 + 0.57 * t * t * (3 - 2 * t);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

const geometryCache = new Map<string, THREE.ExtrudeGeometry>();

/** Cached per link id: the three profiles are static for the lifetime of the page. */
export function createPortalGeometry(spec: PortalLinkSpec) {
  const cached = geometryCache.get(spec.id);
  if (cached) return cached;
  const geometry = buildPortalGeometry(spec);
  geometryCache.set(spec.id, geometry);
  return geometry;
}

export function disposePortalGeometries() {
  geometryCache.forEach((geometry) => geometry.dispose());
  geometryCache.clear();
}
