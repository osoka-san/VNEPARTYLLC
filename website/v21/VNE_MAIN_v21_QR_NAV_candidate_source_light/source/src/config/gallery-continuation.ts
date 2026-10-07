export const galleryContinuationConfig = {
  sceneCount: 4,
  initialScenes: 24,
  allocationChunk: 64,
  allocationBuffer: 8,
  maxScenes: 8192,
  sceneViewportMultiplier: 1,
  darkPhase: 0.12,
  transitionMs: 180,
  memoryEntries: 8,
} as const;

export type GalleryPhase = {
  absoluteIndex: number;
  sceneIndex: number;
  sceneProgress: number;
  opacity: number;
};

export function getGalleryPhase(
  scrollY: number,
  runwayStart: number,
  sceneUnit: number,
  darkPhase = galleryContinuationConfig.darkPhase,
): GalleryPhase {
  const unit = Math.max(1, sceneUnit);
  const local = Math.max(0, scrollY - runwayStart);
  const absoluteIndex = Math.floor(local / unit);
  const sceneProgress = (local % unit) / unit;
  const edgeOpacity =
    sceneProgress < darkPhase
      ? sceneProgress / darkPhase
      : sceneProgress > 1 - darkPhase
        ? (1 - sceneProgress) / darkPhase
        : 1;
  return {
    absoluteIndex,
    sceneIndex:
      ((absoluteIndex % galleryContinuationConfig.sceneCount) +
        galleryContinuationConfig.sceneCount) %
      galleryContinuationConfig.sceneCount,
    sceneProgress,
    opacity: Math.min(1, Math.max(0, edgeOpacity)),
  };
}

export function growGalleryAllocation(current: number, absoluteIndex: number) {
  if (
    current >= galleryContinuationConfig.maxScenes ||
    absoluteIndex < current - galleryContinuationConfig.allocationBuffer
  ) {
    return current;
  }
  return Math.min(
    galleryContinuationConfig.maxScenes,
    current + galleryContinuationConfig.allocationChunk,
  );
}
