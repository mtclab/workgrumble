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
  // The channel client: the chat bubble again, with a hash where the words
  // would be - which is the whole product, drawn honestly.
  'icon-hubbub': [
    {
      element: 'path',
      attributes: { d: 'M4 4h16v12H9l-5 4z' },
    },
    {
      element: 'line',
      attributes: { x1: '10.5', y1: '7', x2: '9.5', y2: '13' },
    },
    {
      element: 'line',
      attributes: { x1: '14.5', y1: '7', x2: '13.5', y2: '13' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '9', x2: '16.5', y2: '9' },
    },
    {
      element: 'line',
      attributes: { x1: '7.5', y1: '11', x2: '16', y2: '11' },
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
  // A screen with a heartbeat across it: a monitoring board, eyes on glass.
  'icon-monitor': [
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
      attributes: { points: '5 11 9 11 11 7 13 13 15 10 19 10' },
    },
  ],
  // A page of ruled lines with one of them flagged: a log, and the one entry
  // somebody should have read.
  'icon-events': [
    {
      element: 'rect',
      attributes: { x: '4', y: '3', width: '16', height: '18', rx: '1' },
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
    {
      element: 'circle',
      attributes: { cx: '17', cy: '16', r: '1' },
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
  'icon-browser': [
    {
      element: 'circle',
      attributes: { cx: '12', cy: '12', r: '9' },
    },
    {
      element: 'line',
      attributes: { x1: '3', y1: '12', x2: '21', y2: '12' },
    },
    {
      element: 'path',
      attributes: { d: 'M12 3c3.2 3.6 3.2 14.4 0 18' },
    },
    {
      element: 'path',
      attributes: { d: 'M12 3c-3.2 3.6-3.2 14.4 0 18' },
    },
  ],
  'icon-can': [
    {
      element: 'rect',
      attributes: { x: '8', y: '4', width: '8', height: '17', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '8', x2: '16', y2: '8' },
    },
    {
      element: 'line',
      attributes: { x1: '8', y1: '17', x2: '16', y2: '17' },
    },
    {
      element: 'polyline',
      attributes: { points: '10 4 10 2 14 2 14 4' },
    },
  ],
  'icon-beer': [
    {
      element: 'rect',
      attributes: { x: '5', y: '8', width: '10', height: '13', rx: '1' },
    },
    {
      element: 'path',
      attributes: { d: 'M15 11h3a2 2 0 0 1 0 5h-3' },
    },
    {
      element: 'line',
      attributes: { x1: '5', y1: '12', x2: '15', y2: '12' },
    },
  ],
  'icon-bin': [
    {
      element: 'polyline',
      attributes: { points: '5 7 6 21 18 21 19 7' },
    },
    {
      element: 'line',
      attributes: { x1: '3', y1: '7', x2: '21', y2: '7' },
    },
    {
      element: 'path',
      attributes: { d: 'M9 7V4h6v3' },
    },
  ],
  'icon-door': [
    {
      element: 'rect',
      attributes: { x: '6', y: '3', width: '12', height: '18', rx: '1' },
    },
    {
      element: 'circle',
      attributes: { cx: '14', cy: '12', r: '1' },
    },
  ],
  'icon-cat-sitting': [
    {
      element: 'circle',
      attributes: { cx: '12', cy: '8', r: '4' },
    },
    {
      element: 'polyline',
      attributes: { points: '9 5 8 2 11.5 3.6' },
    },
    {
      element: 'polyline',
      attributes: { points: '15 5 16 2 12.5 3.6' },
    },
    {
      element: 'path',
      attributes: { d: 'M8.5 11.4c-1.2 3-1.2 6.6-0.5 8.6h8c0.7-2 0.7-5.6-0.5-8.6' },
    },
    {
      element: 'path',
      attributes: { d: 'M16 20c3.2 0.4 4.4-2 3-4.4' },
    },
  ],
  'icon-cat-loaf': [
    {
      element: 'path',
      attributes: { d: 'M3 20c0-5.5 4-9 9-9s9 3.5 9 9z' },
    },
    {
      element: 'polyline',
      attributes: { points: '7.5 12 7 8.5 10 10.5' },
    },
    {
      element: 'polyline',
      attributes: { points: '16.5 12 17 8.5 14 10.5' },
    },
    {
      element: 'line',
      attributes: { x1: '9.5', y1: '15', x2: '10.5', y2: '15' },
    },
    {
      element: 'line',
      attributes: { x1: '13.5', y1: '15', x2: '14.5', y2: '15' },
    },
  ],
  'icon-cat-box': [
    {
      element: 'rect',
      attributes: { x: '3', y: '13', width: '18', height: '8', rx: '1' },
    },
    {
      element: 'circle',
      attributes: { cx: '12', cy: '9', r: '3.2' },
    },
    {
      element: 'polyline',
      attributes: { points: '9.6 6.8 9 4 11.4 5.4' },
    },
    {
      element: 'polyline',
      attributes: { points: '14.4 6.8 15 4 12.6 5.4' },
    },
    {
      element: 'line',
      attributes: { x1: '3', y1: '16', x2: '21', y2: '16' },
    },
  ],
  // A cabinet with a joystick: the toy the web store sells, drawn in the same
  // line language as the tools it is emphatically not one of.
  'icon-arcade': [
    {
      element: 'rect',
      attributes: { x: '5', y: '3', width: '14', height: '18', rx: '1' },
    },
    {
      element: 'rect',
      attributes: { x: '8', y: '6', width: '8', height: '5' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '14', x2: '12', y2: '17' },
    },
    {
      element: 'circle',
      attributes: { cx: '12', cy: '13', r: '1' },
    },
    {
      element: 'circle',
      attributes: { cx: '9', cy: '18', r: '1' },
    },
    {
      element: 'circle',
      attributes: { cx: '15', cy: '18', r: '1' },
    },
  ],
  'icon-media': [
    {
      element: 'circle',
      attributes: { cx: '12', cy: '12', r: '9' },
    },
    {
      element: 'circle',
      attributes: { cx: '12', cy: '12', r: '2' },
    },
    {
      element: 'path',
      attributes: { d: 'M10 8 L16 12 L10 16 Z' },
    },
  ],
  'icon-solitaire': [
    {
      element: 'rect',
      attributes: { x: '3', y: '4', width: '11', height: '15', rx: '1' },
    },
    {
      element: 'rect',
      attributes: { x: '9', y: '6', width: '12', height: '15', rx: '1' },
    },
    {
      element: 'path',
      attributes: { d: 'M15 10 l2.5 3.5 -2.5 3.5 -2.5 -3.5 z' },
    },
  ],
  // A covered grid with one square uncovered onto a mine - the whole game in a
  // glyph: the field, and the one square you should not have clicked.
  'icon-minesweeper': [
    {
      element: 'rect',
      attributes: { x: '4', y: '4', width: '16', height: '16', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '4', x2: '12', y2: '20' },
    },
    {
      element: 'line',
      attributes: { x1: '4', y1: '12', x2: '20', y2: '12' },
    },
    {
      element: 'circle',
      attributes: { cx: '16', cy: '16', r: '2' },
    },
    {
      element: 'line',
      attributes: { x1: '16', y1: '12.5', x2: '16', y2: '19.5' },
    },
    {
      element: 'line',
      attributes: { x1: '12.5', y1: '16', x2: '19.5', y2: '16' },
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
  // Something arriving in a tray overnight, which is what an update is.
  'icon-update': [
    {
      element: 'line',
      attributes: { x1: '12', y1: '3', x2: '12', y2: '13' },
    },
    {
      element: 'polyline',
      attributes: { points: '7 9 12 14 17 9' },
    },
    {
      element: 'path',
      attributes: { d: 'M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4' },
    },
  ],
  /*
   * The three glyphs the 0.27.0 skins wear.
   *
   * `icon-kickoff` is KDE's launcher: a disc with a wedge out of it, which is
   * what a Kickoff button reads as in the corner of a Plasma panel. `icon-menu`
   * is Cinnamon's: the stack of bars every Start-menu clone has settled on.
   * GNOME has no launcher glyph at all - Activities is a WORD - which is why
   * there is no third one here. `icon-display` is the window where all of this
   * is chosen, and it is a monitor with a slider under it, because on the
   * caricature this game is set in that is exactly what Display Properties was.
   */
  'icon-kickoff': [
    {
      element: 'circle',
      attributes: { cx: '12', cy: '12', r: '8' },
    },
    {
      element: 'path',
      attributes: { d: 'M12 4v8h8' },
    },
  ],
  'icon-menu': [
    {
      element: 'line',
      attributes: { x1: '4', y1: '7', x2: '20', y2: '7' },
    },
    {
      element: 'line',
      attributes: { x1: '4', y1: '12', x2: '20', y2: '12' },
    },
    {
      element: 'line',
      attributes: { x1: '4', y1: '17', x2: '20', y2: '17' },
    },
  ],
  'icon-display': [
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
      element: 'line',
      attributes: { x1: '6', y1: '10', x2: '18', y2: '10' },
    },
    {
      element: 'circle',
      attributes: { cx: '14', cy: '10', r: '2' },
    },
  ],
  // A form with a fault on it. The one thing in this building that is not a
  // joke, so it looks like the paperwork it is.
  'icon-report': [
    {
      element: 'path',
      attributes: { d: 'M6 3h8l4 4v14H6z' },
    },
    {
      element: 'polyline',
      attributes: { points: '14 3 14 7 18 7' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '10', x2: '12', y2: '15' },
    },
    {
      element: 'circle',
      attributes: { cx: '12', cy: '18', r: '1' },
    },
  ],
  /*
   * The Assistant, and it is a PLACEHOLDER: a small beige workstation with a
   * face, drawn in the same 24-unit line language as everything else here. The
   * eyebrows are the whole character - they are what turns a monitor into a
   * colleague who is about to say something - and the art pass may replace the
   * lot of it (a stapler and a desk fan with eyes are the other candidates)
   * without changing anything but these shapes.
   */
  'icon-assistant': [
    {
      element: 'rect',
      attributes: { x: '2', y: '4', width: '20', height: '14', rx: '1' },
    },
    {
      element: 'line',
      attributes: { x1: '9', y1: '21', x2: '15', y2: '21' },
    },
    {
      element: 'line',
      attributes: { x1: '12', y1: '18', x2: '12', y2: '21' },
    },
    // The eyebrows, up and hopeful, one slightly higher than the other.
    {
      element: 'polyline',
      attributes: { points: '6 8 8 7 10 8' },
    },
    {
      element: 'polyline',
      attributes: { points: '14 8 16 6.6 18 8' },
    },
    {
      element: 'circle',
      attributes: { cx: '8', cy: '11', r: '1' },
    },
    {
      element: 'circle',
      attributes: { cx: '16', cy: '11', r: '1' },
    },
    // A small, extremely pleased mouth.
    {
      element: 'path',
      attributes: { d: 'M9.5 14c1.6 1.4 3.4 1.4 5 0' },
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
