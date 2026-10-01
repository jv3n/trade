/**
 * Gives a detached window the app's look : a Document Picture-in-Picture window starts bare, so
 * every stylesheet of the page is copied over — inline rules as a `<style>`, a sheet the browser
 * will not let us read (another origin) as a `<link>` to the same address.
 */
export function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const style = to.createElement('style');
      style.textContent = Array.from(sheet.cssRules)
        .map((rule) => rule.cssText)
        .join('\n');
      to.head.append(style);
    } catch {
      if (!sheet.href) continue;
      const link = to.createElement('link');
      link.rel = 'stylesheet';
      link.href = sheet.href;
      to.head.append(link);
    }
  }
}
