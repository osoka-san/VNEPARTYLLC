import jsQR from "jsqr";
export async function rasterize(svg: string, size: number) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Браузер не поддерживает обработку изображения.");
    ctx.drawImage(img, 0, 0, size, size);
    return { canvas, ctx };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function verifyArtwork(svg: string, expected: string, sizes = [900, 420, 280]) {
  const bytes = Array.from(new TextEncoder().encode(expected));
  for (const size of sizes) {
    const { ctx } = await rasterize(svg, size);
    const image = ctx.getImageData(0, 0, size, size);
    const code = jsQR(image.data, size, size, { inversionAttempts: "attemptBoth" });
    if (
      !code ||
      code.data !== expected ||
      code.binaryData.length !== bytes.length ||
      code.binaryData.some((v, i) => v !== bytes[i])
    )
      return { ok: false, size };
  }
  return { ok: true, size: sizes[sizes.length - 1] };
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function pngBlob(svg: string) {
  const { canvas } = await rasterize(svg, 1200);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось подготовить PNG."))),
      "image/png",
    ),
  );
}
