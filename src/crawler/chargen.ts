import {
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
} from './rpg';
import { type CharacterSetup, newSave } from './state';

/**
 * New career: who you are, where you came from, what you were born under,
 * and the title you are hired at - which is the difficulty. Hired at or past
 * the branch rung, you also choose a domain and whether you are an
 * Operations Specialist or an Engineer.
 */
export function showCharGen(parent: HTMLElement, onDone: (setup: CharacterSetup) => void, onBack: () => void): void {
  const root = document.createElement('div');
  root.className = 'chargen';
  parent.append(root);
  let name = 'Pat Pending';
  let background = BACKGROUNDS[0]?.id ?? 'grad';
  let sign = SIGNS[0]?.id ?? 'patch';
  let rung = 0;
  let domain: Domain = 'Systems';
  let track: Track = 'specialist';

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
    nameRow.innerHTML = '<label>Name on the badge <input maxlength="28"></label>';
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
      bg.append(card(b.name, b.desc, b.id === background, () => { background = b.id; }, `${bits.join(' · ')} — Major: ${majors}`));
    }

    const sg = section('Born under');
    for (const s of SIGNS) sg.append(card(s.name, s.desc, s.id === sign, () => { sign = s.id; }));

    const rg = section('Hired as (this is the difficulty)');
    for (let r = 0; r < RUNG_COUNT; r++) {
      const t = titleFor(r, r >= BRANCH_RUNG ? domain : null, r >= BRANCH_RUNG ? track : null);
      const label = r === 0 ? 'Recommended for a first career.' : r >= 7 ? 'The building will not forgive you.' : `Arrive with ${r} rung${r > 1 ? 's' : ''} of experience.`;
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
      note.textContent = `At ${titleFor(BRANCH_RUNG, null, null).replace('Systems ', '')} level you will choose a domain (Systems, Network, Cloud, Security, Database) and whether you are an Operations Specialist or an Engineer.`;
      root.append(note);
    }

    // Preview.
    const setup: CharacterSetup = { name: name.trim() === '' ? 'Pat Pending' : name.trim(), background, sign, rung, domain: rung >= BRANCH_RUNG ? domain : null, track: rung >= BRANCH_RUNG ? track : null };
    const preview = newSave(1, setup);
    const pv = document.createElement('div');
    pv.className = 'cg-preview';
    pv.textContent = `${setup.name}, ${titleFor(setup.rung, setup.domain, setup.track)} · `
      + ATTRIBUTES.map((a) => `${ATTRIBUTE_INFO[a].name} ${preview.attrs[a]}`).join(' · ')
      + ` · Rep ₡${preview.rep}`;
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
    go.addEventListener('click', () => { root.remove(); onDone(setup); });
    row.append(back, go);
    root.append(row);
    root.scrollTop = scroll;
  };
  render();
}
