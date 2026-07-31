const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

interface IconShape {
  readonly element: 'circle' | 'line' | 'path' | 'polyline' | 'rect';
  readonly attributes: Readonly<Record<string, string>>;
}

const ICONS: Readonly<Record<string, readonly IconShape[]>> = {
  'icon-about': [
    {
      element: 'rect',
      attributes: { x: '3', y: '4', width: '18', height: '14', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '22', x2: '16', y2: '22' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '18', x2: '12', y2: '22' },
    },
    {
      element: 'circle',
      attributes: { cx: '12', cy: '8', r: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '11', x2: '12', y2: '15' },
    },
  ],
  'icon-bubbles': [
    {
      element: 'circle',
      attributes: { cx: '8', cy: '15', r: '5' },
    },
    {
      element: 'circle',
      attributes: { cx: '16', cy: '8', r: '4' },
    },
    {
      element: 'circle',
      attributes: { cx: '18', cy: '18', r: '2' },
    },
  ],
  'icon-start': [
    {
      element: 'path',
      attributes: { d: 'M3 4h8v7H3zM13 3h8v8h-8zM3 13h8v7H3zM13 13h8v8h-8z' },
    },
  ],
  'icon-minimize': [
    {
      element: 'line',
      attributes: { x1: '5', y1: '17', x2: '19', y2: '17' },
    },
  ],
  'icon-maximize': [
    {
      element: 'rect',
      attributes: { x: '5', y: '5', width: '14', height: '14' },
    },
    {
      element: 'line',
      attributes: { x1: '5', y1: '8', x2: '19', y2: '8' },
    },
  ],
  'icon-restore': [
    {
      element: 'path',
      attributes: { d: 'M8 5h11v11M5 8h11v11H5z' },
    },
  ],
  'icon-close': [
    {
      element: 'line',
      attributes: { x1: '6', y1: '6', x2: '18', y2: '18' },
    },
    {
      element: 'line',
      attributes: { x1: '18', y1: '6', x2: '6', y2: '18' },
    },
  ],
  'icon-bell': [
    {
      element: 'path',
      attributes: { d: 'M6 17h12l-2-3V10a4 4 0 0 0-8 0v4z' },
    },
    {
      element: 'path',
      attributes: { d: 'M10 19a2 2 0 0 0 4 0' },
    },
  ],
  'icon-user': [
    {
      element: 'circle',
      attributes: { cx: '12', cy: '8', r: '4' },
    },
    {
      element: 'path',
      attributes: { d: 'M4 21a8 8 0 0 1 16 0' },
    },
  ],
  'icon-restart': [
    {
      element: 'path',
      attributes: { d: 'M19 8V3l-2 2a8 8 0 1 0 2 11' },
    },
    {
      element: 'polyline',
      attributes: { points: '14 3 19 3 19 8' },
    },
  ],
  'icon-log-out': [
    {
      element: 'path',
      attributes: { d: 'M10 4H4v16h6' },
    },
    {
      element: 'line',
      attributes: { x1: '9', y1: '12', x2: '21', y2: '12' },
    },
    {
      element: 'polyline',
      attributes: { points: '17 8 21 12 17 16' },
    },
  ],
  'icon-check': [
    {
      element: 'polyline',
      attributes: { points: '4 13 9 18 20 6' },
    },
  ],
  'icon-tickets': [
    {
      element: 'rect',
      attributes: { x: '5', y: '3', width: '14', height: '18', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '9', y1: '8', x2: '15', y2: '8' },
    },
    {
      element: 'line',
      attributes: { x1: '9', y1: '12', x2: '15', y2: '12' },
    },
    {
      element: 'line',
      attributes: { x1: '9', y1: '16', x2: '13', y2: '16' },
    },
  ],
  'icon-directory': [
    {
      element: 'rect',
      attributes: { x: '4', y: '3', width: '16', height: '18', rx: '1' },
    },
    {
      element: 'circle',
      attributes: { cx: '12', cy: '10', r: '2.5' },
    },
    {
      element: 'path',
      attributes: { d: 'M8 17a4 4 0 0 1 8 0' },
    },
  ],
  'icon-cmd': [
    {
      element: 'rect',
      attributes: { x: '3', y: '4', width: '18', height: '16', rx: '1' },
    },
    {
      element: 'polyline',
      attributes: { points: '7 10 10 13 7 16' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '16', x2: '17', y2: '16' },
    },
  ],
  'icon-chat': [
    {
      element: 'path',
      attributes: { d: 'M4 5h16v11H9l-5 4z' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '9', x2: '16', y2: '9' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '12', x2: '13', y2: '12' },
    },
  ],
  'icon-mail': [
    {
      element: 'rect',
      attributes: { x: '3', y: '5', width: '18', height: '14', rx: '1' },
    },
    {
      element: 'polyline',
      attributes: { points: '3 7 12 13 21 7' },
    },
  ],
  'icon-remote': [
    {
      element: 'rect',
      attributes: { x: '3', y: '4', width: '18', height: '12', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '20', x2: '16', y2: '20' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '16', x2: '12', y2: '20' },
    },
    {
      element: 'polyline',
      attributes: { points: '9 8 12 10 9 12' },
    },
  ],
  'icon-kb': [
    {
      element: 'path',
      attributes: { d: 'M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z' },
    },
    {
      element: 'path',
      attributes: { d: 'M20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z' },
    },
  ],
  'icon-day': [
    {
      element: 'circle',
      attributes: { cx: '12', cy: '12', r: '8' },
    },
    {
      element: 'polyline',
      attributes: { points: '12 7 12 12 16 14' },
    },
  ],
  'icon-scorecard': [
    {
      element: 'rect',
      attributes: { x: '5', y: '3', width: '14', height: '18', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '8', x2: '16', y2: '8' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '12', x2: '16', y2: '12' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '16', x2: '13', y2: '16' },
    },
  ],
  'icon-pause': [
    {
      element: 'line',
      attributes: { x1: '9', y1: '5', x2: '9', y2: '19' },
    },
    {
      element: 'line',
      attributes: { x1: '15', y1: '5', x2: '15', y2: '19' },
    },
  ],
  'icon-play': [
    {
      element: 'path',
      attributes: { d: 'M7 4l12 8-12 8z' },
    },
  ],
  'icon-save': [
    {
      element: 'rect',
      attributes: { x: '4', y: '4', width: '16', height: '16', rx: '1' },
    },
    {
      element: 'rect',
      attributes: { x: '8', y: '4', width: '8', height: '6' },
    },
    {
      element: 'rect',
      attributes: { x: '8', y: '14', width: '8', height: '6' },
    },
  ],
  'icon-load': [
    {
      element: 'path',
      attributes: { d: 'M3 7h6l2 2h10v10H3z' },
    },
    {
      element: 'polyline',
      attributes: { points: '9 14 12 17 15 14' },
    },
  ],
  'icon-lock': [
    {
      element: 'rect',
      attributes: { x: '5', y: '10', width: '14', height: '11', rx: '1' },
    },
    {
      element: 'path',
      attributes: { d: 'M8 10V7a4 4 0 0 1 8 0v3' },
    },
  ],
};

/** Every icon id drawn in this repo. Manifest icons must come from this set. */
export const ICON_IDS: readonly string[] = Object.freeze(Object.keys(ICONS));

function configureShape(shape: IconShape): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, shape.element);

  for (const [name, value] of Object.entries(shape.attributes)) {
    element.setAttribute(name, value);
  }

  return element;
}

export function createIconSprite(): SVGSVGElement {
  const sprite = document.createElementNS(SVG_NAMESPACE, 'svg');
  sprite.classList.add('icon-sprite');
  sprite.setAttribute('aria-hidden', 'true');
  const definitions = document.createElementNS(SVG_NAMESPACE, 'defs');

  for (const [id, shapes] of Object.entries(ICONS)) {
    const symbol = document.createElementNS(SVG_NAMESPACE, 'symbol');
    symbol.id = id;
    symbol.setAttribute('viewBox', '0 0 24 24');

    for (const shape of shapes) {
      symbol.append(configureShape(shape));
    }

    definitions.append(symbol);
  }

  sprite.append(definitions);
  return sprite;
}

export function createIcon(iconId: string): SVGSVGElement {
  if (!(iconId in ICONS)) {
    throw new Error(`Unknown inline SVG icon "${iconId}".`);
  }

  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.classList.add('svg-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NAMESPACE, 'use');
  use.setAttribute('href', `#${iconId}`);
  icon.append(use);
  return icon;
}
