export function pageMeta(title: string, description: string, noindex = false) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
    ],
  };
}
