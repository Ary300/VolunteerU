/* ==========================================================================
   hoursCardImage.js, the hour card as a PNG
   Draws the same ticket ShareHoursCard shows (white, a 1px line, logo and
   school year, the confirmed number, a dashed tear line, then name and
   details) onto a canvas, so a student can save it or hand it to their
   phone's share sheet. Fonts are read from the card on screen, so the image
   uses the page's own typefaces.
   ========================================================================== */

import { C } from './tokens.js';

const W = 720;
const H = 420;
const SCALE = 2;
const PAD = 44;
const INK = C.ink;
const INK2 = C.ink2;
const LINE = C.line2;

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Shortens text with an ellipsis until it fits `max` pixels. */
function fit(ctx, text, max) {
  let t = String(text || '');
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/**
 * @param {{ name: string, hours: string, unit: string, year: string, details: string[],
 *           displayFont?: string, bodyFont?: string }} card
 * @returns {Promise<Blob|null>} a PNG, or null when the browser can't draw one
 */
export async function hoursCardPng(card) {
  if (typeof document === 'undefined') return null;
  const display = card.displayFont || 'system-ui, sans-serif';
  const body = card.bodyFont || 'system-ui, sans-serif';
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch { /* draw with whatever is loaded */ }
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  roundRect(ctx, 0.5, 0.5, W - 1, H - 1, 20);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const logo = await loadImage('/logo.png');
  let x = PAD;
  if (logo && logo.naturalHeight) {
    const h = 28;
    const w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, x, PAD - 4, w, h);
    x += w + 10;
  }
  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.font = `700 22px ${display}`;
  ctx.fillText('VolunteerU', x, PAD + 10);
  ctx.font = `500 18px ${body}`;
  ctx.fillStyle = INK2;
  ctx.textAlign = 'right';
  ctx.fillText(card.year || '', W - PAD, PAD + 10);
  ctx.textAlign = 'left';

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  ctx.font = `800 132px ${display}`;
  const numW = ctx.measureText(card.hours).width;
  ctx.fillText(card.hours, PAD - 4, 212);
  ctx.fillStyle = INK2;
  ctx.font = `500 21px ${body}`;
  const unitX = PAD + numW + 16;
  const words = String(card.unit || '').split(' ');
  const half = Math.ceil(words.length / 2);
  ctx.fillText(words.slice(0, half).join(' '), unitX, 182);
  ctx.fillText(words.slice(half).join(' '), unitX, 208);

  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(PAD, 270);
  ctx.lineTo(W - PAD, 270);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = INK;
  ctx.font = `650 30px ${display}`;
  ctx.fillText(fit(ctx, card.name || 'Your name', W - PAD * 2), PAD, 322);
  if (card.details && card.details.length) {
    ctx.fillStyle = INK2;
    ctx.font = `400 20px ${body}`;
    ctx.fillText(fit(ctx, card.details.join('  ·  '), W - PAD * 2), PAD, 360);
  }

  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
