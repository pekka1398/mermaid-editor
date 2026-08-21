let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(font: string): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  const ctx = measureCtx!;
  ctx.font = font;
  return ctx;
}

export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  font = "14px sans-serif"
): string[] {
  const ctx = getMeasureCtx(font);
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  const width = (s: string) => ctx.measureText(s).width;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (width(word) <= maxWidth) {
      current = word;
      continue;
    }
    let chunk = "";
    for (const char of word) {
      const test = chunk + char;
      if (width(test) <= maxWidth) {
        chunk = test;
      } else {
        if (chunk) lines.push(chunk);
        chunk = char;
      }
    }
    current = chunk;
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push("");

  if (lines.length > maxLines) {
    const truncated = lines.slice(0, maxLines);
    let last = truncated[maxLines - 1];
    while (last.length > 0 && width(`${last}…`) > maxWidth) {
      last = last.slice(0, -1);
    }
    truncated[maxLines - 1] = `${last}…`;
    return truncated;
  }

  return lines;
}
