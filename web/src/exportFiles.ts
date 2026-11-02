/** Browser helpers for getting an exported roadmap out of the page. */

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "roadmap";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function svgBlob(svg: string): Blob {
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: "image/svg+xml;charset=utf-8" });
}

/** Draws the SVG onto a canvas at 2x so it stays sharp in slides and documents. */
export function svgToPngBlob(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(svgBlob(svg));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("This browser can't draw the image.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image."))), "image/png");
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Couldn't create the image."));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't create the image."));
    };
    img.src = url;
  });
}

/** A page that shows the roadmap one landscape page wide, ready to print or save as PDF. */
export function printDocument(svg: string, title: string): string {
  const safe = title.replace(/[<>&"]/g, "");
  return (
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${safe}</title>` +
    `<style>@page{size:A4 landscape;margin:10mm}html,body{margin:0;background:#fff}svg{display:block;width:100%;height:auto}</style>` +
    `</head><body>${svg}</body></html>`
  );
}

/** Opens the print dialog for the roadmap. Choosing "Save as PDF" there gives a PDF. */
export function printSvg(svg: string, title: string): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.srcdoc = printDocument(svg, title);
  frame.onload = () => {
    const w = frame.contentWindow;
    if (!w) return;
    w.focus();
    w.print();
    setTimeout(() => frame.remove(), 60000);
  };
  document.body.appendChild(frame);
}

/** Copies text; resolves false when the browser won't allow it, so the caller can show the text instead. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
