import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { designConfig } from "@/config/design-config";

export type PortalLinkSpec = {
  id: string;
  color: string;
  path: string;
  anchor: [number, number];
};

export const SVG_TO_WORLD = 0.01;

export const portalLinks: PortalLinkSpec[] = [
  {
    id: "portal-link-01",
    color: designConfig.colors.blue,
    anchor: [183.3, 197.0236228685],
    path: "M24 29.09231 L357.49523 152.22901 Q365 155 365 163 L365 298 Q365 306 357.57219 303.02887 L335.19947 294.07979 Q330 292 330 286.4 L330 186 Q330 181 325.29556 179.3064 L84.70444 92.6936 Q80 91 80 96 L80 338.4 Q80 344 75.04177 346.60307 L31.08318 369.68133 Q27.5836515795 371.518582668 24 371.722875033 Z",
  },
  {
    id: "portal-link-02",
    color: designConfig.colors.mint,
    anchor: [203.6, 236.9018150715],
    path: "M120 146.74419 L298.3451 209.99448 Q304 212 304 218 L304 287 Q304 293 298.41549 290.80609 L279.90916 283.53574 Q276 282 276 277.8 L276 237 Q276 233 272.21534 231.70525 L165.78466 195.29475 Q162 194 162 198 L162 306.8 Q162 311 158.29412 312.97647 L125.29412 330.57647 Q122.68077687 331.970252674 120 332.133036982 Z",
  },
  {
    id: "portal-link-03",
    color: designConfig.colors.orange,
    anchor: [229.88, 263.3015638987],
    path: "M206.4 233.416 L261.15968 252.03429 Q264 253 264 256 L264 279 Q264 282 261.22597 280.85775 L248.94182 275.79957 Q247 275 247 272.9 L247 267.5 Q247 266 245.58739 265.4955 L234.41261 261.5045 Q233 261 233 262.5 L233 283.9 Q233 286 231.06457 286.81492 L209.16491 296.03583 Q207.785010526 296.616838992 206.4 296.63036684 Z",
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
