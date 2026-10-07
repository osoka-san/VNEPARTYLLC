import { defineTool } from "@lovable.dev/mcp-js";
import { vneContent } from "@/content/vne-content";

export default defineTool({
  name: "get_site_copy",
  title: "Тексты первого экрана",
  description:
    "Публичные русские тексты первого экрана сайта ВНЕ: надписи, кнопки и текст диалога.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const copy = { ...vneContent };
    return {
      content: [{ type: "text" as const, text: JSON.stringify(copy, null, 2) }],
      structuredContent: { copy },
    };
  },
});
