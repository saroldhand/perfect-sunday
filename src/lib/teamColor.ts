// Several clubs have a near-black primary colour — Raiders #000000, Bears
// #0B162A, Browns #311D00 — which is invisible as a 3px accent against the
// #0B0D10 page background. The teams table stores each club's true colour, so
// the correction happens here at render time instead of being baked into data.

const PAGE_BG_LUMINANCE = 0.0075; // relative luminance of #0B0D10
const MIN_CONTRAST = 2.2; // enough for a 3px bar to read at arm's length

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  );
}

function contrastAgainstPage(luminance: number): number {
  return (luminance + 0.05) / (PAGE_BG_LUMINANCE + 0.05);
}

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const p = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${p(r)}${p(g)}${p(b)}`;
}

/**
 * Returns the team colour if it already reads against the page background, or
 * a lightened version of it if it does not. Hue is preserved — the Raiders bar
 * becomes silver-grey rather than some unrelated colour.
 */
export function accentColor(hex: string): string {
  let [r, g, b] = parseHex(hex);

  if (contrastAgainstPage(relativeLuminance(r, g, b)) >= MIN_CONTRAST) {
    return hex.toUpperCase();
  }

  // Pure black has no hue to preserve, so lift it to the Raiders' silver.
  if (r === 0 && g === 0 && b === 0) return "#A5ACAF";

  // Otherwise walk the colour toward white in small steps until it clears the
  // contrast floor. Capped so a stubborn colour cannot loop forever.
  for (let step = 0; step < 24; step++) {
    r += (255 - r) * 0.12;
    g += (255 - g) * 0.12;
    b += (255 - b) * 0.12;
    if (contrastAgainstPage(relativeLuminance(r, g, b)) >= MIN_CONTRAST) break;
  }

  return toHex(r, g, b);
}
