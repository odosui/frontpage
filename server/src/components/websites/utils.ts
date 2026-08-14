export function toAbsoluteUrl(hrefs: string[], baseUrl: string) {
  return hrefs
    .map((href) => {
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return null;
      }
    })
    .filter((url): url is string => !!url);
}
