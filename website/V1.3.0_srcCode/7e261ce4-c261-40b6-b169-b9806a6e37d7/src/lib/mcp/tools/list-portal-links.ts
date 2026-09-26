import { defineTool } from "@lovable.dev/mcp-js";
import { portalLinks } from "@/lib/portal-geometry";

const links = portalLinks.map((link, index) => ({
  id: link.id,
  order: index + 1,
  color: link.color,
  anchor: { x: link.anchor[0], y: link.anchor[1] },
  svg: `/brand/portal/${link.id}.svg`,
  frontProfile: `/brand/portal/${link.id}-front-profile.svg`,
}));

export default defineTool({
  name: "list_portal_links",
  title: "Звенья портала",
  description: "Три звена эмблемы портала ВНЕ: порядок, цвет, точка привязки и файлы SVG.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [{ type: "text" as const, text: JSON.stringify(links, null, 2) }],
    structuredContent: { links },
  }),
});
