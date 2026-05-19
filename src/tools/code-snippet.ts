import { z } from "zod";
import { encodeRgbaPng } from "../media/png.js";
import { defineTool } from "../registry/index.js";
import { writeGeneratedImage } from "../media/generated-image.js";

const KEYWORDS = new Set([
  "async",
  "await",
  "class",
  "const",
  "def",
  "else",
  "export",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "interface",
  "let",
  "return",
  "type",
  "var",
  "while",
]);

export const CodeSnippetInputSchema = z.object({
  code: z.string().min(1),
  language: z.string().default("text"),
  theme: z.string().default("show-sidekick-dark"),
  font_size: z.number().int().positive().default(18),
  padding: z.number().int().nonnegative().default(24),
  background: z.string().default("transparent"),
  width: z.number().int().positive().optional(),
});

export const CodeSnippetOutputSchema = z.object({
  image_path: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  cost_usd: z.literal(0),
});

type Rgba = [number, number, number, number];
type Token = { text: string; color: Rgba };

const PALETTE = {
  text: rgba("#e5e7eb"),
  keyword: rgba("#7dd3fc"),
  string: rgba("#86efac"),
  number: rgba("#fdba74"),
  comment: rgba("#94a3b8"),
  punctuation: rgba("#c4b5fd"),
};

export default defineTool({
  name: "code_snippet",
  capability: "image_generation",
  provider: "local",
  status: "beta",
  integration: {
    kind: "library",
    package: "node:zlib",
    install: "Built in to Node.js; no external package required.",
  },
  best_for: "transparent PNG code overlays for explainers and talking-head terminal shots",
  supports: ["transparent-png", "code-overlay", "syntax-color"],
  cost: { unit: "image", usd: 0 },
  input: CodeSnippetInputSchema,
  output: CodeSnippetOutputSchema,

  async execute(params, ctx) {
    const input = CodeSnippetInputSchema.parse(params);
    const scale = Math.max(1, Math.round(input.font_size / 8));
    const charAdvance = 6 * scale;
    const lineHeight = 10 * scale;
    const lines = input.code.replace(/\t/g, "  ").split(/\r?\n/);
    const contentWidth = Math.max(1, ...lines.map((line) => line.length)) * charAdvance;
    const width = input.width ?? contentWidth + input.padding * 2;
    const height = Math.max(1, lines.length) * lineHeight + input.padding * 2;
    const data = new Uint8Array(width * height * 4);
    const background = backgroundColor(input.background);

    if (background[3] > 0) {
      fill(data, width, height, background);
    }

    lines.forEach((line, lineIndex) => {
      let cursorX = input.padding;
      for (const token of tokenize(line)) {
        for (const char of token.text) {
          drawChar(data, width, height, char, cursorX, input.padding + lineIndex * lineHeight, scale, token.color);
          cursorX += charAdvance;
        }
      }
    });

    const imagePath = await writeGeneratedImage(ctx, encodeRgbaPng({ width, height, data }), { extension: "png" });

    return CodeSnippetOutputSchema.parse({ image_path: imagePath, width, height, cost_usd: 0 });
  },
});

function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < line.length) {
    const rest = line.slice(index);
    const commentMatch = /^(\/\/|#).*/.exec(rest);
    if (commentMatch) {
      tokens.push({ text: commentMatch[0], color: PALETTE.comment });
      break;
    }

    const stringMatch = /^(['"`])(?:\\.|(?!\1).)*\1/.exec(rest);
    if (stringMatch) {
      tokens.push({ text: stringMatch[0], color: PALETTE.string });
      index += stringMatch[0].length;
      continue;
    }

    const numberMatch = /^\d+(?:\.\d+)?/.exec(rest);
    if (numberMatch) {
      tokens.push({ text: numberMatch[0], color: PALETTE.number });
      index += numberMatch[0].length;
      continue;
    }

    const wordMatch = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (wordMatch) {
      tokens.push({ text: wordMatch[0], color: KEYWORDS.has(wordMatch[0]) ? PALETTE.keyword : PALETTE.text });
      index += wordMatch[0].length;
      continue;
    }

    const char = line[index] ?? "";
    tokens.push({ text: char, color: /\s/.test(char) ? PALETTE.text : PALETTE.punctuation });
    index += 1;
  }

  return tokens;
}

function fill(data: Uint8Array, width: number, height: number, color: Rgba): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(data, width, x, y, color);
    }
  }
}

function drawChar(data: Uint8Array, width: number, height: number, char: string, x: number, y: number, scale: number, color: Rgba): void {
  if (char === " ") {
    return;
  }

  const glyph = GLYPHS[char] ?? GLYPHS[char.toUpperCase()] ?? GLYPHS["?"];
  if (!glyph) {
    return;
  }

  glyph.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col += 1) {
      if (row[col] !== "1") {
        continue;
      }
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const px = x + col * scale + dx;
          const py = y + rowIndex * scale + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            setPixel(data, width, px, py, color);
          }
        }
      }
    }
  });
}

function setPixel(data: Uint8Array, width: number, x: number, y: number, color: Rgba): void {
  const offset = (y * width + x) * 4;
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = color[3];
}

function backgroundColor(value: string): Rgba {
  return value === "transparent" ? [0, 0, 0, 0] : rgba(value);
}

function rgba(value: string): Rgba {
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!match) {
    throw new Error(`unsupported color: ${value}`);
  }

  const hex = match[1] ?? "000000";
  const alpha = match[2] ? Number.parseInt(match[2], 16) : 255;

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
    alpha,
  ];
}

const GLYPHS: Record<string, string[]> = {
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "01100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "01100", "01000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "\"": ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "`": ["01000", "00100", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
  "\\": ["10000", "01000", "00100", "00010", "00001", "00000", "00000"],
  "*": ["00000", "10101", "01110", "11111", "01110", "10101", "00000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "{": ["00010", "00100", "00100", "01000", "00100", "00100", "00010"],
  "}": ["01000", "00100", "00100", "00010", "00100", "00100", "01000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00001", "00001", "00001", "00001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};
