import { defineMcp } from "@lovable.dev/mcp-js";
import getBrandIdentity from "./tools/get-brand-identity";
import listPortalLinks from "./tools/list-portal-links";
import getSiteCopy from "./tools/get-site-copy";

export default defineMcp({
  name: "vne-portal",
  title: "VNE Portal",
  version: "0.1.0",
  instructions:
    "Публичные материалы сайта ВНЕ / VNE: айдентика бренда, звенья эмблемы портала и тексты первого экрана.",
  tools: [getBrandIdentity, listPortalLinks, getSiteCopy],
});
