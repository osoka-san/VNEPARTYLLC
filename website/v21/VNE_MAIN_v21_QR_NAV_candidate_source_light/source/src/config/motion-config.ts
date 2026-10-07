export type PortalPose = { position: [number, number, number]; rotation: [number, number, number] };

export const motionConfig = {
  scroll: {
    desktopVh: 195,
    mobileVh: 165,
    staticVh: 100,
    reveal: [
      [0.015, 0.27],
      [0.2, 0.46],
      [0.4, 0.64],
    ] as [number, number][],
    settle: [
      [0.27, 0.66],
      [0.46, 0.79],
      [0.64, 0.9],
    ] as [number, number][],
    holdStart: 0.9,
  },
  smoothing: {
    responseSeconds: 0.14,
    maxDeltaSeconds: 0.12,
    endpointEpsilon: 0.00035,
  },
  camera: { position: [0, 0, 7] as [number, number, number], fov: 40 },
  // The SVG already includes perspective. At the final pose do not distort it a second time.
  presentation: { rotation: [0, 0, 0] as [number, number, number] },
  hidden: {
    concealSafetyPx: 40,
    depthOffsets: [-0.28, 0, 0.28] as [number, number, number],
  },
  separated: [
    { position: [-0.3, 0.13, -0.12], rotation: [-0.075, 0.1, -0.035] },
    { position: [0.5, -0.14, 0.15], rotation: [0.055, -0.12, 0.025] },
    { position: [0.51, -0.45, 0.3], rotation: [0.06, 0.08, -0.025] },
  ] as PortalPose[],
  separatedMobile: [
    { position: [-0.16, 0.1, -0.09], rotation: [-0.04, 0.055, -0.02] },
    { position: [0.36, -0.19, 0.1], rotation: [0.035, -0.07, 0.02] },
    { position: [0.47, -0.48, 0.2], rotation: [0.04, 0.05, -0.015] },
  ] as PortalPose[],
  assembled: [
    { position: [-0.047, 0.029763771314998452, 0], rotation: [0, 0, 0] },
    { position: [0.156, -0.3690181507152795, 0], rotation: [0, 0, 0] },
    { position: [0.4188, -0.6330156389868256, 0], rotation: [0, 0, 0] },
  ] as PortalPose[],
} as const;

/** A single, scroll-driven light pass when each part finds its place; no idle loop. */
export function portalLightPass(index: number, progress: number) {
  const range = motionConfig.scroll.settle[index];
  if (!range) return 0;
  const t = Math.min(1, Math.max(0, (progress - range[0]) / (range[1] - range[0])));
  return Math.sin(Math.PI * t) ** 2;
}

export function portalPhase(progress: number) {
  if (progress >= motionConfig.scroll.holdStart) return { index: 3, label: "ВНЕ привычного" };
  if (progress >= 0.54) return { index: 2, label: "03 / Присутствие" };
  if (progress >= 0.28) return { index: 1, label: "02 / Глубина" };
  return { index: 0, label: "01 / Контур" };
}

export function rangeEase(progress: number, range: [number, number]) {
  const [start, end] = range;
  const t = Math.min(1, Math.max(0, (progress - start) / (end - start)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function interpolatePoseInto(from: PortalPose, to: PortalPose, t: number, output: PortalPose) {
  for (let axis = 0; axis < 3; axis += 1) {
    const fromPosition = from.position[axis] ?? 0;
    const toPosition = to.position[axis] ?? 0;
    const fromRotation = from.rotation[axis] ?? 0;
    const toRotation = to.rotation[axis] ?? 0;
    output.position[axis] = fromPosition + (toPosition - fromPosition) * t;
    output.rotation[axis] = fromRotation + (toRotation - fromRotation) * t;
  }
}

export function createPortalPose(): PortalPose {
  return { position: [0, 0, 0], rotation: [0, 0, 0] };
}

export function getHiddenPoseInto(index: number, hiddenDrop: number, output: PortalPose) {
  const assembled = motionConfig.assembled[index];
  if (!assembled) return output;
  output.position[0] = assembled.position[0];
  output.position[1] = assembled.position[1] + hiddenDrop;
  output.position[2] = assembled.position[2] + (motionConfig.hidden.depthOffsets[index] ?? 0);
  output.rotation[0] = 0;
  output.rotation[1] = 0;
  output.rotation[2] = 0;
  return output;
}

export function getPortalScrollPoseInto(
  index: number,
  progress: number,
  mobile: boolean,
  hiddenDrop: number,
  output: PortalPose,
  hidden: PortalPose,
) {
  const revealRange = motionConfig.scroll.reveal[index];
  const settleRange = motionConfig.scroll.settle[index];
  const separated = (mobile ? motionConfig.separatedMobile : motionConfig.separated)[index];
  const assembled = motionConfig.assembled[index];
  if (!revealRange || !settleRange || !separated || !assembled) return output;

  getHiddenPoseInto(index, hiddenDrop, hidden);
  if (progress <= 0) return (interpolatePoseInto(hidden, hidden, 0, output), output);
  if (progress >= motionConfig.scroll.holdStart) {
    return (interpolatePoseInto(assembled, assembled, 0, output), output);
  }

  const revealT = rangeEase(progress, revealRange);
  interpolatePoseInto(hidden, separated, revealT, output);
  const settleT = rangeEase(progress, settleRange);
  interpolatePoseInto(output, assembled, settleT, output);
  return output;
}

export function advanceDisplayedProgress(current: number, target: number, rawDelta: number) {
  if (Math.abs(target - current) <= motionConfig.smoothing.endpointEpsilon) return target;
  const delta = Math.min(Math.max(rawDelta, 0), motionConfig.smoothing.maxDeltaSeconds);
  const blend = 1 - Math.exp(-delta / motionConfig.smoothing.responseSeconds);
  const next = current + (target - current) * blend;
  return Math.abs(target - next) <= motionConfig.smoothing.endpointEpsilon ? target : next;
}
