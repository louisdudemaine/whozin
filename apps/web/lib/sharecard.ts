"use client";

/**
 * Génération d'images partageables (canvas) — format story 1080×1920.
 * Style Afterglow : nuit, néons, grain. Zéro dépendance.
 */

interface CardOpts {
  title: string;
  subtitle?: string;
  emoji?: string;
  accent?: string;
  lines?: { label: string; value: string }[];
  footer?: string;
}

export async function renderShareCard(opts: CardOpts): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d")!;
  const accent = opts.accent ?? "#ff2e63";

  // fond nuit
  x.fillStyle = "#07070d";
  x.fillRect(0, 0, W, H);

  // pluie de néons (3 halos radiaux)
  const halo = (cx: number, cy: number, r: number, color: string, a: number) => {
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color.replace(")", `,${a})`).replace("rgb", "rgba"));
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  };
  halo(120, 80, 700, "rgb(255,46,99", 0.35);
  halo(W - 60, 600, 600, "rgb(139,92,246", 0.3);
  halo(W * 0.75, H, 800, "rgb(22,217,197", 0.28);

  // carte verre fumé
  const cardX = 90;
  const cardY = 520;
  const cardW = W - 180;
  const cardH = 760;
  x.save();
  roundRect(x, cardX, cardY, cardW, cardH, 48);
  x.fillStyle = "rgba(16,16,27,0.85)";
  x.shadowColor = accent;
  x.shadowBlur = 80;
  x.fill();
  x.restore();
  x.save();
  roundRect(x, cardX, cardY, cardW, cardH, 48);
  x.strokeStyle = "rgba(255,255,255,0.16)";
  x.lineWidth = 2;
  x.stroke();
  x.restore();

  // wordmark
  x.textAlign = "center";
  x.fillStyle = "#f4f2f8";
  x.font = "800 72px Unbounded, sans-serif";
  x.fillText("Whoz", W / 2 - 52, 220);
  const grad = x.createLinearGradient(W / 2, 0, W / 2 + 160, 0);
  grad.addColorStop(0, "#ff2e63");
  grad.addColorStop(1, "#ff7849");
  x.fillStyle = grad;
  x.fillText("in", W / 2 + 116, 220);

  // emoji géant
  if (opts.emoji) {
    x.font = "200px sans-serif";
    x.fillText(opts.emoji, W / 2, cardY + 260);
  }

  // titre
  x.fillStyle = "#f4f2f8";
  x.font = "800 64px Unbounded, sans-serif";
  wrapText(x, opts.title, W / 2, cardY + 420, cardW - 120, 80);

  // sous-titre
  if (opts.subtitle) {
    x.fillStyle = accent;
    x.font = "600 40px 'Space Grotesk', sans-serif";
    wrapText(x, opts.subtitle, W / 2, cardY + 560, cardW - 140, 52);
  }

  // lignes de stats
  if (opts.lines?.length) {
    let y = cardY + 460;
    x.font = "600 38px 'Space Grotesk', sans-serif";
    for (const line of opts.lines) {
      x.textAlign = "left";
      x.fillStyle = "#8b8b9e";
      x.fillText(line.label, cardX + 70, y);
      x.textAlign = "right";
      x.fillStyle = "#f4f2f8";
      x.font = "800 44px Unbounded, sans-serif";
      x.fillText(line.value, cardX + cardW - 70, y);
      x.font = "600 38px 'Space Grotesk', sans-serif";
      y += 86;
    }
    x.textAlign = "center";
  }

  // pied
  x.fillStyle = "#8b8b9e";
  x.font = "500 34px 'Space Grotesk', sans-serif";
  x.fillText(opts.footer ?? "La ville s'allume. T'es où?", W / 2, H - 140);

  // grain léger
  const noise = x.createImageData(W, H);
  for (let i = 0; i < noise.data.length; i += 4) {
    const v = Math.random() * 255;
    noise.data[i] = v;
    noise.data[i + 1] = v;
    noise.data[i + 2] = v;
    noise.data[i + 3] = 10; // ~4 %
  }
  x.putImageData(noise, 0, 0);

  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

function roundRect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

function wrapText(x: CanvasRenderingContext2D, text: string, cx: number, cy: number, maxW: number, lineH: number) {
  const words = text.split(" ");
  let line = "";
  let y = cy;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (x.measureText(test).width > maxW && line) {
      x.fillText(line, cx, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  x.fillText(line, cx, y);
}

/** Partage natif (story IG via la feuille de partage) ou téléchargement. */
export async function shareImage(blob: Blob, filename: string, text?: string): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch {
      /* annulé -> fallback download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
