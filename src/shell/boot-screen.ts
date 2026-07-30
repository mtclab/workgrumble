import { BOOT_STEP_COUNT } from './state';

interface BootLine {
  readonly label: string;
  readonly status: string;
}

const BOOT_LINES: readonly BootLine[] = [
  { label: 'Counting memory', status: '640K, ought to be enough' },
  { label: 'Spinning mass storage', status: '1 drive, mild clicking' },
  { label: 'Probing network', status: 'WORKGRUMBLE reachable' },
  { label: 'Loading personality profile', status: 'probationary' },
  { label: 'Starting DeskPro WorkGroup', status: 'please stand by' },
];

if (BOOT_LINES.length !== BOOT_STEP_COUNT) {
  throw new Error('Boot screen copy must cover exactly BOOT_STEP_COUNT steps.');
}

export interface BootScreen {
  readonly element: HTMLElement;
  render(bootStep: number): void;
}

/**
 * Fake POST screen. Every line is inert copy - the state machine owns the
 * progression, this only paints it.
 */
export function createBootScreen(): BootScreen {
  const element = document.createElement('div');
  element.className = 'screen screen-boot';
  element.dataset.testid = 'boot-screen';

  const brand = document.createElement('div');
  brand.className = 'boot-brand';
  const brandName = document.createElement('strong');
  brandName.textContent = 'DeskPro BIOS 0.98¾';
  const brandNote = document.createElement('span');
  brandNote.textContent = 'Beige-Box Industries · no warranty, no refunds';
  brand.append(brandName, brandNote);

  const log = document.createElement('ul');
  log.className = 'boot-log';
  const lines = BOOT_LINES.map((line, index) => {
    const item = document.createElement('li');
    item.className = 'boot-line';
    item.dataset.testid = `boot-line-${String(index)}`;
    const label = document.createElement('span');
    label.textContent = `${line.label} ...`;
    const status = document.createElement('span');
    status.className = 'boot-line-status';
    status.textContent = line.status;
    item.append(label, status);
    log.append(item);
    return { item, status };
  });

  const hint = document.createElement('p');
  hint.className = 'boot-hint';
  hint.dataset.testid = 'boot-hint';
  hint.dataset.blink = 'true';
  hint.textContent = 'Press any key to skip the ceremony.';

  element.append(brand, log, hint);

  return {
    element,
    render: (bootStep: number): void => {
      lines.forEach(({ item, status }, index) => {
        const done = index < bootStep;
        item.dataset.state = done ? 'done' : 'pending';
        status.hidden = !done;
      });
    },
  };
}
