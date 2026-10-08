/** A view change or clock tick is not an appended observation. */
export type LogFollowSnapshot = Readonly<{
  view: string;
  latestId: string | undefined;
  visibleLatestId: string | undefined;
}>;

export function shouldFollowLogAppend(
  previous: LogFollowSnapshot | null,
  next: LogFollowSnapshot,
  enabled: boolean,
  nearBottom: boolean,
  reading: boolean,
) {
  return !!(
    previous &&
    previous.view === next.view &&
    next.latestId &&
    next.latestId !== previous.latestId &&
    next.visibleLatestId &&
    next.visibleLatestId !== previous.visibleLatestId &&
    enabled &&
    nearBottom &&
    !reading
  );
}

export function isNearLogBottom(
  list: Pick<HTMLElement, "scrollHeight" | "clientHeight" | "scrollTop">,
) {
  // A few pixels of wheel/subpixel tolerance, not an entire older record.
  return list.scrollHeight - list.clientHeight - list.scrollTop <= 24;
}
