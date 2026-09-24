export function getSectionProgress(element: HTMLElement | null) {
  if (!element) return 0;
  const rect = element.getBoundingClientRect();
  const distance = Math.max(1, element.offsetHeight - window.innerHeight);
  return Math.min(1, Math.max(0, -rect.top / distance));
}
