/** Единые параметры движения ВНЕ. Длительности в секундах. */
export const motionTokens = {
  duration: { fast: 0.16, standard: 0.4, cinematic: 0.8, atmospheric: 1.4 },
  ease: {
    out: [0.22, 1, 0.36, 1] as [number, number, number, number],
    inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  },
  spring: { type: "spring", stiffness: 260, damping: 30, mass: 0.6 } as const,
  reveal: { y: 16, blur: 8 },
  hero: { eyebrow: 0.3, title: 0.5, subtitle: 0.75, actions: 0.95 },
  magnetic: { maxOffset: 6, strength: 0.18 },
  tilt: { maxDeg: 3 },
  press: { hover: 1.015, tap: 0.98 },
  menu: { stagger: 0.045, y: 10, blur: 12 },
  image: { scale: 1.045, y: 12 },
  dialog: { scale: 0.97 },
  page: { y: 8 },
};
