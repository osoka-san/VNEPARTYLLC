export const brandColorTokens = {
  background: { hex: "#070A09", oklch: "oklch(0.1405 0.006 174.67)" },
  surface: { hex: "#101715", oklch: "oklch(0.1966 0.0113 175.78)" },
  text: { hex: "#EDF2EE", oklch: "oklch(0.9562 0.0075 151.89)", cssName: "foreground" },
  muted: { hex: "#AAB5B0", oklch: "oklch(0.763 0.0141 167.05)", cssName: "muted-foreground" },
  mint: { hex: "#30E5AD", oklch: "oklch(0.8221 0.1606 166.2)" },
  orange: { hex: "#E55330", oklch: "oklch(0.6341 0.188 34.65)" },
  blue: { hex: "#86ABFF", oklch: "oklch(0.7485 0.1285 265.34)" },
} as const;

export const designConfig = {
  colors: {
    background: brandColorTokens.background.hex,
    surface: brandColorTokens.surface.hex,
    text: brandColorTokens.text.hex,
    muted: brandColorTokens.muted.hex,
    mint: brandColorTokens.mint.hex,
    orange: brandColorTokens.orange.hex,
    blue: brandColorTokens.blue.hex,
  },
  material: {
    roughness: 0.46,
    metalness: 0.42,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
    depth: 0.105,
    bevel: 0.012,
  },
} as const;
