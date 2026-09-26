import * as THREE from "three";
import {
  createPortalPose,
  getPortalScrollPoseInto,
  motionConfig,
  type PortalPose,
} from "@/config/motion-config";
import { createPortalGeometry, portalLinks } from "@/lib/portal-geometry";

export type SceneBounds = {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  minY: number;
  maxY: number;
};

const INNER_GROUP_OFFSET = new THREE.Vector3(0, -0.25, 0);

function poseCorners(index: number, pose: PortalPose, target: THREE.Box3) {
  const geometry = createPortalGeometry(portalLinks[index]!);
  const box = geometry.boundingBox;
  if (!box) return;
  const euler = new THREE.Euler(...pose.rotation);
  const presentation = new THREE.Euler(...motionConfig.presentation.rotation);
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i += 1) {
    corner.set(
      i & 1 ? box.max.x : box.min.x,
      i & 2 ? box.max.y : box.min.y,
      i & 4 ? box.max.z : box.min.z,
    );
    corner.applyEuler(euler);
    corner.x += pose.position[0];
    corner.y += pose.position[1];
    corner.z += pose.position[2];
    corner.add(INNER_GROUP_OFFSET);
    corner.applyEuler(presentation);
    target.expandByPoint(corner);
  }
}

const cache = new Map<string, SceneBounds>();

/**
 * Real bounds of the three source profiles across every visible scroll pose.
 * The hidden drop is excluded because it is derived later from the fitted
 * scene and the dock's screen-space upper edge.
 */
export function computeSceneBounds(mobile: boolean): SceneBounds {
  const key = mobile ? "mobile" : "desktop";
  const cached = cache.get(key);
  if (cached) return cached;

  const box = new THREE.Box3();
  const pose = createPortalPose();
  const hidden = createPortalPose();
  for (let index = 0; index < portalLinks.length; index += 1) {
    for (let step = 0; step <= 50; step += 1) {
      getPortalScrollPoseInto(index, step / 50, mobile, 0, pose, hidden);
      poseCorners(index, pose, box);
    }
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const bounds: SceneBounds = {
    width: Math.max(0.001, size.x),
    height: Math.max(0.001, size.y),
    centerX: center.x,
    centerY: center.y,
    minY: box.min.y,
    maxY: box.max.y,
  };
  cache.set(key, bounds);
  return bounds;
}
