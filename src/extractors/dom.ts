const BLOCK_TAGS = new Set([
  "BR", "DIV", "P", "LI", "DT", "DD", "SECTION", "ARTICLE", "H1", "H2", "H3",
]);

function isHidden(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  const style = view?.getComputedStyle(element);
  if (!style) return false;
  if (style.display === "none" || style.visibility === "hidden") return true;
  const width = Number.parseFloat(style.width);
  const height = Number.parseFloat(style.height);
  return style.overflow === "hidden" && width <= 0.1 && height <= 0.1;
}

function collect(node: Node, output: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    output.push(node.nodeValue ?? "");
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as Element;
  if (isHidden(element)) return;
  if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(element.tagName)) return;
  if (element.tagName === "BR") {
    output.push("\n");
    return;
  }
  const block = BLOCK_TAGS.has(element.tagName);
  if (block) output.push("\n");
  element.childNodes.forEach((child) => collect(child, output));
  if (block) output.push("\n");
}

export function normalizeLines(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function visibleText(element: Element | null): string {
  if (!element) return "";
  const output: string[] = [];
  collect(element, output);
  return normalizeLines(output.join(""));
}

export function ownVisibleText(element: Element | null): string {
  if (!element) return "";
  return normalizeLines(
    [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.nodeValue ?? "")
      .join(" "),
  );
}

export function htmlToText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  return visibleText(document.body);
}
