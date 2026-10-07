import QRCode from "qrcode";

/** Search is deterministic and payload-preserving. This is NOT a similarity metric. */
export type MatrixCandidate = {
  qr: QRCode.QRCode;
  mask: number;
  segments: string[] | null;
  cuts: number[];
  packingScore: number;
};
export type MatrixSearchOptions = {
  maxPartitions?: number;
  keep?: number;
  score?: (qr: QRCode.QRCode) => number;
};
const templateSeeds = [
  {
    type: "S",
    p: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  {
    type: "S",
    p: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
      [2, 3],
    ],
  },
  {
    type: "S",
    p: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [1, 3],
      [1, 4],
    ],
  },
  {
    type: "S",
    p: [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [2, 2],
      [2, 3],
    ],
  },
  {
    type: "C",
    p: [
      [2, 0],
      [1, 0],
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  },
  {
    type: "C",
    p: [
      [1, 0],
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 3],
    ],
  },
  {
    type: "J",
    p: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
  },
  {
    type: "J",
    p: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ],
  },
];
const templates: { p: number[][]; w: number; h: number; weight: number }[] = [];
const keys = new Set<string>();
for (const seed of templateSeeds)
  for (const flip of [1, -1])
    for (let rotation = 0; rotation < 4; rotation++) {
      let p = seed.p.map(([x, y]) => [x! * flip, y!]);
      for (let r = 0; r < rotation; r++) p = p.map(([x, y]) => [-y!, x!]);
      const minX = Math.min(...p.map((v) => v[0]!));
      const minY = Math.min(...p.map((v) => v[1]!));
      p = p.map(([x, y]) => [x! - minX, y! - minY]);
      const key = p
        .map((v) => v.join(":"))
        .sort()
        .join("|");
      if (keys.has(key)) continue;
      keys.add(key);
      templates.push({
        p,
        w: Math.max(...p.map((v) => v[0]!)) + 1,
        h: Math.max(...p.map((v) => v[1]!)) + 1,
        weight: p.length + (seed.type === "S" ? 3 : seed.type === "C" ? 2 : 0),
      });
    }

/** Fast structural prefilter. Final geometric fitting and decoding stay separate. */
export function scoreQrMatrix(qr: QRCode.QRCode): number {
  const n = qr.modules.size;
  const dark = new Uint8Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++)
      dark[y * n + x] = qr.modules.get(y, x) && !qr.modules.isReserved(y, x) ? 1 : 0;
  const placements: { ids: number[]; weight: number }[] = [];
  for (const t of templates)
    for (let y = 0; y <= n - t.h; y++)
      for (let x = 0; x <= n - t.w; x++) {
        let fits = true;
        for (const [dx, dy] of t.p)
          if (!dark[(y + dy!) * n + x + dx!]) {
            fits = false;
            break;
          }
        if (fits)
          placements.push({
            ids: t.p.map(([dx, dy]) => (y + dy!) * n + x + dx!),
            weight: t.weight,
          });
      }
  placements.sort(
    (a, b) => b.weight - a.weight || b.ids.length - a.ids.length || a.ids[0]! - b.ids[0]!,
  );
  const occupied = new Uint8Array(n * n);
  let score = 0;
  for (const p of placements) {
    if (p.ids.some((id) => occupied[id])) continue;
    for (const id of p.ids) occupied[id] = 1;
    score += p.weight;
  }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (!dark[y * n + x]) continue;
      let adjacent = false;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (
            (dx || dy) &&
            x + dx >= 0 &&
            x + dx < n &&
            y + dy >= 0 &&
            y + dy < n &&
            dark[(y + dy) * n + x + dx]
          )
            adjacent = true;
      if (!adjacent) score -= 4;
    }
  return score;
}

function partitions(text: string, budget: number): { segments: string[]; cuts: number[] }[] {
  const chars = Array.from(text); // Never split a Unicode code point's UTF-8 bytes.
  const anchors =
    chars.length <= 8
      ? Array.from({ length: Math.max(0, chars.length - 1) }, (_, i) => i + 1)
      : [
          ...new Set(Array.from({ length: 7 }, (_, i) => Math.floor((chars.length * (i + 1)) / 8))),
        ].filter((i) => i > 0 && i < chars.length);
  const list: { segments: string[]; cuts: number[] }[] = [];
  for (let bits = 0; bits < 1 << anchors.length; bits++) {
    const cuts = anchors.filter((_, i) => bits & (1 << i));
    if (cuts.length > 3) continue;
    const b = [0, ...cuts, chars.length];
    list.push({
      cuts,
      segments: b.slice(0, -1).map((start, i) => chars.slice(start, b[i + 1]).join("")),
    });
  }
  // Sampling covers the entire legal partition space; never depends on timing.
  if (list.length <= budget) return list;
  return Array.from({ length: budget }, (_, i) => list[Math.floor((i * list.length) / budget)]!);
}

export function createQrMatrixCandidates(text: string, options: MatrixSearchOptions = {}) {
  const byteLength = new TextEncoder().encode(text).length;
  if (byteLength < 1 || byteLength > 220)
    throw new Error("QR payload must contain 1–220 UTF-8 bytes.");
  const maxPartitions = Math.max(
    1,
    Math.min(
      64,
      Math.floor(options.maxPartitions ?? (byteLength <= 32 ? 64 : byteLength <= 80 ? 16 : 8)),
    ),
  );
  const keep = Math.max(1, Math.min(32, Math.floor(options.keep ?? 8)));
  const baseline = QRCode.create(text, { errorCorrectionLevel: "Q" });
  const version = baseline.version;
  const candidates: MatrixCandidate[] = [];
  const fingerprints = new Set<string>();
  let searchedMatrices = 0;
  let partitionCount = 0;
  let partitionsTooLarge = 0;
  const accept = (qr: QRCode.QRCode, mask: number, segments: string[] | null, cuts: number[]) => {
    // A short fingerprint-free byte string is exact and deterministic; no hash collisions.
    const key = Array.from(qr.modules.data).join("");
    if (fingerprints.has(key)) return;
    fingerprints.add(key);
    searchedMatrices++;
    candidates.push({
      qr,
      mask,
      segments,
      cuts,
      packingScore: (options.score ?? scoreQrMatrix)(qr),
    });
    // Bounded retention: large grids are discarded after ranking, no persistent payload cache.
    candidates.sort(
      (a, b) =>
        b.packingScore - a.packingScore ||
        (a.segments?.length ?? 0) - (b.segments?.length ?? 0) ||
        a.mask - b.mask ||
        (a.cuts.join(",") < b.cuts.join(",") ? -1 : a.cuts.join(",") > b.cuts.join(",") ? 1 : 0),
    );
    if (candidates.length > keep) candidates.length = keep;
  };
  // Preserve automatic numeric/alphanumeric optimization as a baseline.
  for (let mask = 0; mask < 8; mask++)
    accept(
      QRCode.create(text, {
        version,
        errorCorrectionLevel: "Q",
        maskPattern: mask as QRCode.QRCodeMaskPattern,
      }),
      mask,
      null,
      [],
    );
  for (const part of partitions(text, maxPartitions)) {
    if (part.segments.join("") !== text) throw new Error("QR segmentation changed the payload.");
    const input = part.segments.map((data) => ({
      data: new TextEncoder().encode(data),
      mode: "byte" as const,
    }));
    let first: QRCode.QRCode;
    try {
      first = QRCode.create(input, { version, errorCorrectionLevel: "Q", maskPattern: 0 });
    } catch {
      partitionsTooLarge++;
      continue;
    } // Added headers may not fit; version must not grow.
    partitionCount++;
    accept(first, 0, part.segments, part.cuts);
    for (let mask = 1; mask < 8; mask++)
      accept(
        QRCode.create(input, {
          version,
          errorCorrectionLevel: "Q",
          maskPattern: mask as QRCode.QRCodeMaskPattern,
        }),
        mask,
        part.segments,
        part.cuts,
      );
  }
  return {
    candidates,
    searchedMatrices,
    partitionCount,
    partitionsTooLarge,
    byteLength,
    baseVersion: version,
  };
}
