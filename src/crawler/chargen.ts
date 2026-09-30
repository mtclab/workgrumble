import {
  ARCH_INFO,
  ARCH_RUNG,
  type ArchPath,
  ATTRIBUTE_INFO,
  ATTRIBUTES,
  BACKGROUNDS,
  BRANCH_RUNG,
  difficultyFor,
  type Domain,
  DOMAIN_INFO,
  DOMAINS,
  RUNG_COUNT,
  SIGNS,
  SKILL_INFO,
  titleFor,
  type Track,
  TRACK_INFO,
  type Workplace,
  WORKPLACES,
} from './rpg';
import { type CharacterSetup, newSave } from './state';

/**
 * New career: who you are, where you came from, what you were born under,
 * the title you are hired at (the difficulty ladder), and what kind of
 * employer it is (a second difficulty dial, plus Ironman). Hired at or past
 * the branch rungs, you also make the choices those rungs would have asked.
 */
export function showCharGen(parent: HTMLElement, onDone: (setup: CharacterSetup, skipInduction: boolean) => void, onBack: () => void, skipByDefault = false): void {
  const root = document.createElement('div');
  root.className = 'chargen';
  parent.append(root);
  let name = 'Pat Pending';
  let background = BACKGROUNDS[0]?.id ?? 'grad';
  let sign = SIGNS[0]?.id ?? 'patch';
  let rung = 0;
  let domain: Domain = 'Systems';
  let track: Track = 'specialist';
  let arch: ArchPath = 'solutions';
  let workplace: Workplace = 'standard';
  let ironman = false;
  // Off for somebody who has never finished an induction, on once they have.
  let skipInduction = skipByDefault;

  const current = (): CharacterSetup => ({
    name: name.trim() === '' ? 'Pat Pending' : name.trim().slice(0, 28),
    background,
    sign,
    rung,
    domain: rung >= BRANCH_RUNG ? domain : null,
    track: rung >= BRANCH_RUNG ? track : null,
    arch: rung >= ARCH_RUNG ? arch : null,
    workplace,
    ironman,
  });

  const card = (title: string, desc: string, selected: boolean, pick: () => void, extra = ''): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = `cg-card${selected ? ' is-selected' : ''}`;
    b.innerHTML = '<b></b><span></span><em></em>';
    (b.children[0] as HTMLElement).textContent = title;
    (b.children[1] as HTMLElement).textContent = desc;
    (b.children[2] as HTMLElement).textContent = extra;
    b.addEventListener('click', () => {
      pick();
      render();
    });
    return b;
  };
  const section = (title: string): HTMLDivElement => {
    const h = document.createElement('h3');
    h.textContent = title;
    root.append(h);
    const d = document.createElement('div');
    d.className = 'cg-grid';
    root.append(d);
    return d;
  };

  const render = (): void => {
    const scroll = root.scrollTop;
    root.replaceChildren();
    const title = document.createElement('div');
    title.className = 'title-logo small';
    title.textContent = 'NEW STARTER FORM';
    root.append(title);
    const sub = document.createElement('p');
    sub.className = 'title-blurb';
    sub.textContent = 'HR needs a few details before security will print your badge.';
    root.append(sub);

    const nameRow = document.createElement('div');
    nameRow.className = 'cg-name';
    nameRow.innerHTML = '<label>Name on the badge <input maxlength="28" autocomplete="off"></label>';
    const input = nameRow.querySelector('input');
    if (input !== null) {
      input.value = name;
      input.addEventListener('input', () => { name = input.value; });
    }
    root.append(nameRow);

    const bg = section('Background');
    for (const b of BACKGROUNDS) {
      const bits = Object.entries(b.attrs).map(([a, v]) => `${v > 0 ? '+' : ''}${v} ${ATTRIBUTE_INFO[a as keyof typeof ATTRIBUTE_INFO].name}`);
      const majors = b.major.map((m) => SKILL_INFO[m].name).join(', ');
      bg.append(card(b.name, b.desc, b.id === background, () => { background = b.id; }, `${bits.join(' · ')} - Major: ${majors}`));
    }

    const sg = section('Born under');
    for (const s of SIGNS) sg.append(card(s.name, s.desc, s.id === sign, () => { sign = s.id; }));

    const rg = section('Hired as (the career ladder is the difficulty)');
    for (let r = 0; r < RUNG_COUNT; r++) {
      const t = titleFor(r, r >= BRANCH_RUNG ? domain : null, r >= BRANCH_RUNG ? track : null, r >= ARCH_RUNG ? arch : null);
      const label = r === 0 ? 'Recommended for a first career.' : r >= 9 ? 'The building will not forgive you.' : `Arrive with ${r} rung${r > 1 ? 's' : ''} of experience.`;
      rg.append(card(t, label, r === rung, () => { rung = r; }, `Difficulty ×${difficultyFor(r).toFixed(2)}`));
    }

    if (rung >= BRANCH_RUNG) {
      const dg = section('Domain');
      for (const d of DOMAINS) dg.append(card(d, DOMAIN_INFO[d].desc, d === domain, () => { domain = d; }, DOMAIN_INFO[d].ability));
      const tg = section('Track');
      for (const t of ['specialist', 'engineer'] as const) tg.append(card(TRACK_INFO[t].name, TRACK_INFO[t].desc, t === track, () => { track = t; }));
    } else {
      const note = document.createElement('p');
      note.className = 'title-blurb';
      note.textContent = 'At the fifth rung you choose a domain (Systems, Network, Cloud, Security, Database) and whether you are an Operations Specialist or an Engineer. At the eleventh, what kind of Architect you become.';
      root.append(note);
    }
    if (rung >= ARCH_RUNG) {
      const ag = section('Architect path');
      for (const p of ['solutions', 'enterprise', 'domain'] as const) ag.append(card(ARCH_INFO[p].name(domain), ARCH_INFO[p].desc, p === arch, () => { arch = p; }));
    }

    const wg = section('Employer (a second difficulty dial)');
    for (const w of ['fourday', 'standard', 'crunch', 'deathmarch'] as const) {
      const def = WORKPLACES[w];
      wg.append(card(def.name, def.desc, w === workplace, () => { workplace = w; }, `Enemies ×${def.enemy} · SLAs ×${def.sla} · Rep ×${def.rep}`));
    }
    const ig = section('Ironman');
    ig.append(card('Normal', 'Save anywhere. Burnouts cost Rep and restart the floor.', !ironman, () => { ironman = false; }));
    ig.append(card('Ironman', 'One autosave, no quicksave. A burnout ends the career.', ironman, () => { ironman = true; }, 'For the brave'));

    // The induction: a guided first morning, for whoever wants one.
    const skipRow = document.createElement('div');
    skipRow.className = 'cg-skip';
    const skipLabel = document.createElement('label');
    const skipBox = document.createElement('input');
    skipBox.type = 'checkbox';
    skipBox.checked = skipInduction;
    // No re-render: nothing else on the form depends on it.
    skipBox.addEventListener('change', () => { skipInduction = skipBox.checked; });
    skipLabel.append(skipBox, ' Skip the induction');
    const skipNote = document.createElement('span');
    skipNote.className = 'cg-skip-note';
    skipNote.textContent = 'Morag walks new starters through the first morning in the lobby. Skip it and the floor is yours at once.';
    skipRow.append(skipLabel, skipNote);
    root.append(skipRow);

    // Preview.
    const setup = current();
    const preview = newSave(1, setup);
    const pv = document.createElement('div');
    pv.className = 'cg-preview';
    pv.textContent = `${setup.name}, ${titleFor(setup.rung, setup.domain, setup.track, setup.arch ?? null)} · `
      + ATTRIBUTES.map((a) => `${ATTRIBUTE_INFO[a].name} ${preview.attrs[a]}`).join(' · ')
      + ` · Rep ₡${preview.rep} · difficulty ×${(difficultyFor(setup.rung) * WORKPLACES[workplace].enemy).toFixed(2)}${ironman ? ' · IRONMAN' : ''}`;
    root.append(pv);

    const row = document.createElement('div');
    row.className = 'screen-buttons';
    const back = document.createElement('button');
    back.className = 'screen-btn';
    back.textContent = 'Back';
    back.addEventListener('click', () => { root.remove(); onBack(); });
    const go = document.createElement('button');
    go.className = 'screen-btn';
    go.textContent = 'Sign the contract';
    // Read the form at click time: the name box does not re-render as you type.
    go.addEventListener('click', () => { root.remove(); onDone(current(), skipInduction); });
    row.append(back, go);
    root.append(row);
    root.scrollTop = scroll;
  };
  render();
}
