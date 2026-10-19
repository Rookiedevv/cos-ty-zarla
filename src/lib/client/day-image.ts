"use client";

/**
 * Draws a day's meals as a picture to share (Messenger, WhatsApp…). Runs in the browser on a canvas,
 * so it uses the app's own font (with Polish letters) and needs no server or AI.
 */

export interface ShareMeal {
  time: string;
  description: string;
  kcal: number;
  items: { name: string; amount: number | null; unit: string | null; kcal: number }[];
}

export interface ShareDay {
  appName: string;
  heading: string; // e.g. "poniedziałek, 19 października"
  meals: ShareMeal[];
  eaten: number;
  target: number | null;
  labels: { eaten: string; target: string; left: string; over: string; kcal: string; pcs: string };
  locale: string;
}

export type Measure = (text: string) => number;

/** Splits text into lines no wider than maxWidth; a single over-long word is cut by characters. */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (measure(word) <= maxWidth) {
      line = word;
      continue;
    }
    // Word wider than the line: break it up.
    let part = "";
    for (const ch of word) {
      if (measure(part + ch) > maxWidth && part) {
        lines.push(part);
        part = ch;
      } else part += ch;
    }
    line = part;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

const W = 1080;
const PAD = 64;
const C = { bg: "#f4f5f7", card: "#ffffff", ink: "#1d2128", soft: "#5f6b7a", line: "#e3e6eb", accent: "#2563eb", good: "#15803d", over: "#d92d20" };
const FAMILY = `"Bricolage Grotesque Variable", ui-sans-serif, system-ui, sans-serif`;
const font = (weight: number, size: number) => `${weight} ${size}px ${FAMILY}`;

interface Op {
  y: number;
  draw: (ctx: CanvasRenderingContext2D, y: number) => void;
}

/** Lays out and draws the picture. Returns the canvas; call toBlob on it. */
export function drawDay(day: ShareDay, makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): HTMLCanvasElement {
  const canvas = makeCanvas();
  const probe = canvas.getContext("2d")!;
  const nf = new Intl.NumberFormat(day.locale, { maximumFractionDigits: 1 });
  const kcal = (n: number) => `${nf.format(Math.round(n))} ${day.labels.kcal}`;

  const inner = W - PAD * 2; // inside the card
  const cardX = PAD / 2;
  const timeW = 120;
  const kcalW = 200;
  const textX = PAD + timeW;
  const textW = inner - timeW - kcalW - 16;

  const ops: Op[] = [];
  let y = PAD;

  // Header
  ops.push({ y, draw: (c, yy) => { c.font = font(600, 30); c.fillStyle = C.accent; c.fillText(day.appName, PAD, yy + 30); } });
  y += 46;
  probe.font = font(700, 52);
  for (const line of wrapText(day.heading, inner, (s) => probe.measureText(s).width)) {
    ops.push({ y, draw: (c, yy) => { c.font = font(700, 52); c.fillStyle = C.ink; c.fillText(line, PAD, yy + 52); } });
    y += 64;
  }
  y += 24;

  // Meals
  day.meals.forEach((m, idx) => {
    if (idx > 0) {
      const ly = y;
      ops.push({ y: ly, draw: (c, yy) => { c.fillStyle = C.line; c.fillRect(PAD, yy, inner, 2); } });
      y += 28;
    }
    const top = y;
    ops.push({ y: top, draw: (c, yy) => {
      c.font = font(500, 32); c.fillStyle = C.soft; c.fillText(m.time, PAD, yy + 36);
      c.font = font(700, 36); c.fillStyle = C.ink; c.textAlign = "right"; c.fillText(kcal(m.kcal), PAD + inner, yy + 36); c.textAlign = "left";
    } });
    probe.font = font(650, 36);
    for (const line of wrapText(m.description, textW, (s) => probe.measureText(s).width)) {
      ops.push({ y, draw: (c, yy) => { c.font = font(650, 36); c.fillStyle = C.ink; c.fillText(line, textX, yy + 36); } });
      y += 46;
    }
    probe.font = font(400, 28);
    for (const it of m.items) {
      const amount = it.amount != null ? ` · ${nf.format(it.amount)} ${it.unit === "pcs" ? day.labels.pcs : (it.unit ?? "")}`.trimEnd() : "";
      const lines = wrapText(`${it.name}${amount}`, textW, (s) => probe.measureText(s).width);
      lines.forEach((line, i) => {
        const last = i === lines.length - 1;
        ops.push({ y, draw: (c, yy) => {
          c.font = font(400, 28); c.fillStyle = C.soft; c.fillText(line, textX, yy + 30);
          if (last) { c.textAlign = "right"; c.fillText(nf.format(it.kcal), PAD + inner, yy + 30); c.textAlign = "left"; }
        } });
        y += 38;
      });
    }
    y += 20;
  });

  // Total
  y += 8;
  ops.push({ y, draw: (c, yy) => { c.fillStyle = C.ink; c.fillRect(PAD, yy, inner, 3); } });
  y += 30;
  ops.push({ y, draw: (c, yy) => {
    c.font = font(600, 36); c.fillStyle = C.ink; c.fillText(day.labels.eaten, PAD, yy + 40);
    c.font = font(800, 48); c.textAlign = "right"; c.fillText(kcal(day.eaten), PAD + inner, yy + 44); c.textAlign = "left";
  } });
  y += 64;
  if (day.target != null) {
    const left = day.target - day.eaten;
    const status = left >= 0 ? `${kcal(left)} ${day.labels.left}` : `${kcal(-left)} ${day.labels.over}`;
    ops.push({ y, draw: (c, yy) => {
      c.font = font(500, 32); c.fillStyle = C.soft; c.fillText(`${day.labels.target}: ${kcal(day.target!)}`, PAD, yy + 34);
      c.font = font(700, 32); c.fillStyle = left >= 0 ? C.good : C.over; c.textAlign = "right"; c.fillText(status, PAD + inner, yy + 34); c.textAlign = "left";
    } });
    y += 52;
  }
  y += PAD;

  // Draw: page background, white card, then everything in order.
  const H = Math.ceil(y + PAD / 2);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.card;
  ctx.beginPath();
  ctx.roundRect(cardX, cardX, W - cardX * 2, H - cardX * 2, 32);
  ctx.fill();
  ctx.textBaseline = "alphabetic";
  for (const op of ops) op.draw(ctx, op.y);
  return canvas;
}
