let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(font: string): CanvasRenderingContext2D {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d");
  }
  const ctx = measureCtx!;
  ctx.font = font;
  return ctx;
}

// CJK characters wrap individually (no spaces between them); everything
// else wraps as whitespace-delimited words.
const CJK_RANGE =
  "\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef";
const TOKEN_PATTERN = new RegExp(`[${CJK_RANGE}]|[^\\s${CJK_RANGE}]+`, "g");

export function wrapText(
  text: string,
  maxWidth: number,
  maxLines: number,
  font = "14px sans-serif"
): string[] {
  const ctx = getMeasureCtx(font);
  const width = (s: string) => ctx.measureText(s).width;

  // Honour explicit (Ctrl+Enter) line breaks, then word-wrap each segment.
  const hardSegments = text.split(/\r?\n/);
  let lines: string[] = [];
  for (const segment of hardSegments) {
    const wrapped = wrapSegment(segment, maxWidth, width);
    lines = lines.concat(wrapped.length ? wrapped : [""]);
  }
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

function wrapSegment(
  text: string,
  maxWidth: number,
  width: (s: string) => number
): string[] {
  const lines: string[] = [];
  let current = "";

  const spaceChunks = text.split(/(\s+)/).filter(Boolean);

  for (const chunk of spaceChunks) {
    if (/^\s+$/.test(chunk)) continue;
    const tokens = chunk.match(TOKEN_PATTERN) || [chunk];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const needsSpace = i === 0 && current.length > 0;
      const candidate = needsSpace ? `${current} ${token}` : `${current}${token}`;
      if (width(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (width(token) <= maxWidth) {
        current = token;
        continue;
      }
      let piece = "";
      for (const char of token) {
        const test = piece + char;
        if (width(test) <= maxWidth) {
          piece = test;
        } else {
          if (piece) lines.push(piece);
          piece = char;
        }
      }
      current = piece;
    }
  }
  if (current) lines.push(current);
  return lines;
}
