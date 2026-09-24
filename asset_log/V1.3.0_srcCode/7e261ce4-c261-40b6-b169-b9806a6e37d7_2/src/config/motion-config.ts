export type PortalPose = { position: [number, number, number]; rotation: [number, number, number] };

export const motionConfig = {
  scroll: {
    desktopVh: 180,
    mobileVh: 155,
    staticVh: 100,
    reveal: [
      [0, 0.25],
      [0.2, 0.45],
      [0.38, 0.6],
    ] as [number, number][],
    settle: [
      [0.25, 0.82],
      [0.45, 0.82],
      [0.6, 0.82],
    ] as [number, number][],
    holdStart: 0.82,
  },
  smoothing: {
    responseSeconds: 0.105,
    maxDeltaSeconds: 0.12,
    endpointEpsilon: 0.00035,
  },
  camera: { position: [0, 0.08, 7] as [number, number, number], fov: 40 },
  presentation: { rotation: [0.035, -0.075, -0.01] as [number, number, number] },
  hidden: {
    dockOccluderPx: 72,
    concealSafetyPx: 40,
    depthOffsets: [-0.28, 0, 0.28] as [number, number, number],
  },
  separated: [
    { position: [-0.92, -0.02, -0.18], rotation: [0.025, -0.055, -0.075] },
    { position: [0.36, -0.2, 0.01], rotation: [-0.018, 0.042, 0.052] },
    { position: [1.08, -0.2, 0.16], rotation: [0.026, -0.032, -0.046] },
  ] as PortalPose[],
  separatedMobile: [
    { position: [-0.22, -0.3, -0.18], rotation: [0.022, -0.045, -0.064] },
    { position: [0.38, -0.56, 0.01], rotation: [-0.016, 0.035, 0.046] },
    { position: [0.82, -0.5, 0.16], rotation: [0.024, -0.028, -0.04] },
  ] as PortalPose[],
  assembled: [
    { position: [-0.047, 0.0298, 0], rotation: [0, 0, 0] },
    { position: [0.156, -0.369, 0.01], rotation: [0, 0, 0] },
    { position: [0.4188, -0.633, 0.02], rotation: [0, 0, 0] },
  ] as PortalPose[],
} as const;

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
