import { defineTool } from "@lovable.dev/mcp-js";
import { designConfig } from "@/config/design-config";

const brand = {
  name: "ВНЕ / VNE",
  concept: "Закрытые вечеринки. Главный образ — эмблема 10C11-6 из трёх вложенных арок.",
  wordmark: {
    style: "Flow — органичный рукописный знак «ВНЕ» в векторе",
    onDark: "/brand/wordmark/wordmark-flow-light.svg",
    inline: "/brand/wordmark/wordmark-flow.svg",
  },
  fonts: {
    display: "Unbounded Variable",
    text: "Onest Variable",
    accent: "HealthGoth Regular",
  },
  palette: designConfig.colors,
};

export default defineTool({
  name: "get_brand_identity",
  title: "Айдентика ВНЕ",
  description: "Публичные материалы бренда ВНЕ: палитра, шрифты и векторный знак Flow.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text" as const, text: JSON.stringify(brand, null, 2) }],
    structuredContent: { brand },
  }),
});
