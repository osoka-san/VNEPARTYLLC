// Оригинальный Flow SVG сайта (идентичен ассету vne-pass-kit), маской — без наборной замены.
const mask = 'url("/brand/wordmark/wordmark-flow-light.svg")';
export default function BrandMark() {
  return (
    <span
      className="vne-brand-mark"
      role="img"
      aria-label="ВНЕ"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    />
  );
}
