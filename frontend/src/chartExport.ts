import type { ParetoProject } from './domain/pareto';
import { projectFileName } from './projectFile';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXPORT_STYLE_PROPERTIES = [
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'opacity',
  'paint-order',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'visibility',
] as const;

function viewBoxSize(svg: SVGSVGElement): { width: number; height: number } {
  const parts = (svg.getAttribute('viewBox') ?? '0 0 680 660').trim().split(/[\s,]+/).map(Number);
  return { width: parts[2] || 680, height: parts[3] || 660 };
}

/** Returns a standalone SVG: computed CSS is inlined and a white background is added. */
function cloneForExport(svg: SVGSVGElement): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const { width, height } = viewBoxSize(svg);
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];

  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!(original instanceof Element) || !(copy instanceof SVGElement)) return;
    const computed = getComputedStyle(original);
    for (const property of EXPORT_STYLE_PROPERTIES) {
      if (original.hasAttribute(property)) continue;
      const value = computed.getPropertyValue(property);
      if (value) copy.style.setProperty(property, value);
    }
  });

  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.removeProperty('aspect-ratio');
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;

  const background = document.createElementNS(SVG_NS, 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', '#ffffff');
  clone.insertBefore(background, clone.firstChild);

  return clone;
}

function chartMarkup(svg: SVGSVGElement): string {
  const markup = new XMLSerializer().serializeToString(cloneForExport(svg));
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** Downloads the current chart as a standalone SVG file. */
export function exportChartSvg(svg: SVGSVGElement, project: ParetoProject): void {
  const blob = new Blob([chartMarkup(svg)], { type: 'image/svg+xml;charset=utf-8' });
  download(blob, projectFileName(project, 'svg'));
}

/** Rasterizes the current chart at 2x by default and downloads it as a PNG file. */
export async function exportChartPng(
  svg: SVGSVGElement,
  project: ParetoProject,
  scale = 2,
): Promise<void> {
  const { width, height } = viewBoxSize(svg);
  const source = new Blob([chartMarkup(svg)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The chart could not be rendered as a PNG.'));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is not available in this browser.');
    context.scale(scale, scale);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('The chart could not be encoded as a PNG.');
    download(png, projectFileName(project, 'png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
