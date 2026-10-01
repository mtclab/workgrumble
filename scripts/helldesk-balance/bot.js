/* global window, document, performance, MouseEvent */
// Helldesk balance bot: plays the real game headlessly, as a reasonable (not
// perfect) player, and records what happens floor by floor. Injected into a
// running crawler.html by run.mjs; see docs/HELLDESK.md ("Balance testing").
// Its decisions use Math.random unless the runner supplies a seed.
(() => {
  const g = window.__crawler;
  const H = window.__helldesk;
  const TILE = 2;
  const cc = (c) => c * TILE + TILE / 2;
  const cell = (v) => Math.floor(v / TILE);
  const inp = g.input;
  const K = g.settings.keys;
  let R = Math.random;
  let activity = 'other';

  const B = (window.__bot = {
    policy: { staff: 'accept', mentor: 'accept', talk: 0.3, fixAcc: 0.75, block: 0.5, sideQuests: true, treats: true, recruit: true, buy: true, maxFloorMinutes: 22 },
    log: [],
    floors: [],
    cur: null,
    events: [],
  });
  B.seed = (seed) => {
    let state = seed >>> 0;
    R = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---------------------------------------------------------------- paths
  let fieldCache = new Map();
  let fieldLevel = null;
  function field(tx, tz) {
    const L = g.level;
    if (fieldLevel !== L) { fieldCache = new Map(); fieldLevel = L; }
    const W = L.w, Hh = L.h;
    const start = cell(tz) * W + cell(tx);
    // Keep out of the boss's room unless that is where we are going (people can see the red carpet).
    const bossRoom = g.boss && !g.boss.resolved ? g.boss.room : -1;
    const avoid = bossRoom >= 0 && L.roomOf[start] !== bossRoom ? bossRoom : -1;
    const hit = fieldCache.get(start * 2 + (avoid >= 0 ? 1 : 0));
    if (hit) return hit;
    const dist = new Int32Array(W * Hh).fill(-1);
    const q = new Int32Array(W * Hh);
    let h = 0, t = 0;
    dist[start] = 0; q[t++] = start;
    while (h < t) {
      const cur = q[h++];
      const cx = cur % W, cz = (cur - cx) / W;
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox, nz = cz + oz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= Hh) continue;
        const n = nz * W + nx;
        if (dist[n] !== -1 || L.solid[n] === 1) continue;
        if (avoid >= 0 && L.roomOf[n] === avoid) continue;
        dist[n] = dist[cur] + 1; q[t++] = n;
      }
    }
    if (fieldCache.size > 200) fieldCache.clear();
    fieldCache.set(start * 2 + (avoid >= 0 ? 1 : 0), dist);
    return dist;
  }
  function reachable(tx, tz) {
    const L = g.level;
    const f = field(tx, tz);
    return f[cell(g.player.pos.z) * L.w + cell(g.player.pos.x)] >= 0;
  }
  function face(x, z) {
    const p = g.player.pos;
    g.player.yaw = Math.atan2(-(x - p.x), -(z - p.z));
    g.player.pitch = 0;
  }
  let lastPos = null, lastPosT = 0, jiggle = 0;
  function release() { inp.keys.delete(K.forward); inp.keys.delete(K.left); inp.keys.delete(K.right); inp.keys.delete(K.sprint); }
  /** Walk toward (tx,tz); true when within `near`. */
  function goTo(tx, tz, near) {
    activity = target && target.staffing ? 'staffing' : 'walking';
    const p = g.player.pos;
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (d < near) { activity = target && target.staffing ? 'staffing' : 'idle'; release(); return true; }
    const L = g.level, W = L.w;
    const f = field(tx, tz);
    const pc = cell(p.z) * W + cell(p.x);
    let ax = tx, az = tz;
    const here = f[pc];
    if (here > 1) {
      let best = here, bx = null, bz = null;
      const px = cell(p.x), pz = cell(p.z);
      for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = px + ox, nz = pz + oz;
        const n = nz * W + nx;
        if (f[n] < 0 || f[n] >= best) continue;
        if (ox !== 0 && oz !== 0 && (L.solid[pz * W + nx] === 1 || L.solid[nz * W + px] === 1)) continue;
        best = f[n]; bx = cc(nx); bz = cc(nz);
      }
      if (bx !== null) { ax = bx; az = bz; }
    }
    face(ax, az);
    inp.keys.add(K.forward);
    if (!B.quiet && d > 12 && g.save.energy > 60) inp.keys.add(K.sprint); else inp.keys.delete(K.sprint);
    // Unstick.
    if (jiggle > 0) { jiggle -= DT; inp.keys.add(R() < 0.5 ? K.left : K.right); } else { inp.keys.delete(K.left); inp.keys.delete(K.right); }
    return false;
  }
  function checkStuck(wantMove) {
    const p = g.player.pos;
    if (lastPos === null) { lastPos = p.clone(); lastPosT = 0; return; }
    lastPosT += DT;
    if (lastPosT > 1.5) {
      const moved = Math.hypot(p.x - lastPos.x, p.z - lastPos.z);
      if (wantMove && moved < 0.4) { jiggle = 0.6; if (!B.quiet) inp.pressed.add(K.jump); }
      lastPos = p.clone(); lastPosT = 0;
    }
  }
  function press(code) { inp.pressed.add(code); }

  // ---------------------------------------------------------------- dialogue policy
  function pct(text) { const m = /(\d+)%/.exec(text); return m ? Number(m[1]) : null; }
  function handleDialogue() {
    // A supply closet's lock: the bot does not pick locks. Walk away.
    const quit = document.querySelector('.lock-quit');
    if (g.lockpick.open && quit) { quit.click(); B.lockQuits = (B.lockQuits ?? 0) + 1; return true; }
    const box = document.querySelector('.dlg');
    const all = [...document.querySelectorAll('.dlg-opt')];
    const opts = all.filter((b) => !b.disabled);
    if (opts.length === 0) {
      if (g.screen === 'minigame' || document.querySelector('.lockpick')) { press('Escape'); inp.keys.clear(); }
      return false;
    }
    const head = box ? box.innerText : '';
    const labels = opts.map((b) => b.textContent);
    let i = 0;
    const find = (re) => labels.findIndex((l) => re.test(l));
    if (/Staffing:/.test(head)) {
      B.cur.staffOffers++;
      if (B.policy.staff === 'pushback') { const k = find(/capacity|bandwidth/); if (k >= 0) { i = k; B.cur.pushTries++; } }
      if (B.policy.staff === 'delegate') { const k = find(/^\d+\. \[Delegate/); if (k >= 0) i = k; }
    } else if (/Mentoring:/.test(head)) {
      B.cur.mentorAsks++;
      if (B.policy.mentor === 'accept') i = 0; else if (B.policy.mentor === 'quick') i = find(/Five minutes/); else i = find(/Not now/);
      if (i < 0) i = 0;
    } else if (/Got a sec\?/.test(head)) {
      const k = find(/async/); i = k >= 0 && (pct(labels[k]) ?? 0) >= 60 ? k : 0;
    } else if (/Leave it with me\./.test(labels.join('|'))) {
      // A side-quest offer.
      const w = g.derivedCache;
      i = B.policy.sideQuests && w.workload < w.capacity ? 0 : find(/Not right now/);
      if (i === 0) B.cur.sideTaken++;
      if (i < 0) i = 0;
    } else if (/Morale \d+/.test(head)) {
      // A teammate: a sweet if they are flagging, otherwise carry on / come with me.
      const m = /Morale (\d+)/.exec(head);
      const morale = m ? Number(m[1]) : 50;
      const sweet = find(/^\d+\. \[\+\d+ morale.*Have some/);
      const come = find(/Come with me/);
      const on = find(/Carry on/);
      if (B.policy.treats && morale < 40 && sweet >= 0) { i = sweet; B.cur && (B.cur.treatsGiven = (B.cur.treatsGiven ?? 0) + 1); }
      else if (come >= 0 && B.policy.recruit && recruitedCount() < 2) i = come;
      else if (on >= 0) i = on;
      else i = find(/Not now/);
      if (i < 0) i = labels.length - 1;
    } else {
      // Pick the best check if there is one worth trying, else the first line.
      let best = -1, bp = -1;
      labels.forEach((l, k) => { const p = pct(l); if (p !== null && p > bp && !/promotion/.test(l)) { bp = p; best = k; } });
      if (best >= 0 && bp >= 45) i = best;
      const come = find(/Come with me/);
      if (come >= 0 && B.policy.recruit && recruitedCount() < 2) i = come;
      if (/Finders keepers|Never saw it|capsule vendor|sell it/i.test(labels[i] ?? '')) i = 0;
    }
    B.dialogues++;
    opts[Math.max(0, i)].click();
    return true;
  }
  B.dialogues = 0;

  function recruitedCount() { return g.actors.filter((a) => a.kind === 'helper' && a.recruited && !a.resolved && a.npcId === null && ['sysadmin', 'security', 'intern'].includes(a.role)).length; }

  // ---------------------------------------------------------------- terminal work
  let osT = 0;
  function workTerminal() {
    const s = g.save;
    osT += DT;
    // Work to close and nothing in the queue: pull some from the backlog, like a person would.
    if (osT < DT * 1.5 && objectives().fix && s.queue.length < 2) { g.pullTickets(); B.cur && (B.cur.pulls = (B.cur.pulls ?? 0) + 1); }
    if (osT < 2 + s.queue.length * 3) return; // reading tickets takes time
    for (const q of [...s.queue]) {
      const fixes = H.fixesFor(q.t);
      const opts = g.fixOptions(q);
      let tries = 0;
      while (s.queue.includes(q) && tries < 4) {
        const good = opts.find((o) => fixes.includes(o));
        const bad = opts.filter((o) => !fixes.includes(o) && !q.struck.includes(o));
        const label = (R() < B.policy.fixAcc || bad.length === 0) ? good : bad[Math.floor(R() * bad.length)];
        if (label === undefined) break;
        const r = g.resolve(q, label);
        tries++;
        if (r.ok) B.cur.fixed++; else B.cur.wrong++;
      }
    }
    // One push-back email per staffed assignment, if that is the policy.
    if (B.policy.staff === 'pushback') {
      s.questLog.forEach((q, idx) => { if (q.staffed && !q.done && !q.failed && !q.delegated && !q.pushed) { const m = g.pushBack(idx); if (m.startsWith('✔')) B.cur.pushOk++; } });
    }
    osT = 0;
    g.close();
    B.cur.terminalVisits++;
  }

  // ---------------------------------------------------------------- goals
  const PEOPLE = ['user', 'caller', 'customer', 'manager', 'consultant', 'shadowit', 'vendor', 'chatbot', 'jam', 'reply', 'mosquito', 'turret'];
  function hostiles() { return g.actors.filter((a) => a.hostile && !a.resolved && a.kind !== 'boss'); }
  function nearestOf(list, maxD = 1e9) {
    const p = g.player.pos;
    let best = null, bd = maxD;
    for (const a of list) {
      const x = a.pos ? a.pos.x : a.x, z = a.pos ? a.pos.z : a.z;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < bd && reachable(x, z)) { bd = d; best = a; }
    }
    return best;
  }
  function objectives() {
    const s = g.save;
    const out = { fix: false, useTerminal: false, kiuas: false, printer: false, healer: false, avoidLocker: false, staffed: new Set() };
    for (const q of s.questLog) {
      if (q.done || q.failed || q.delegated) continue;
      const obj = window.__helldesk.objective ? window.__helldesk.objective(q) : null;
      if (!obj) continue;
      if (q.staffed) {
        if (obj.kind === 'fix') out.staffed.add('fix');
        if (obj.kind === 'use') out.staffed.add(obj.use === 'terminal' ? 'useTerminal' : obj.use);
        if (obj.kind === 'count' && obj.match && obj.match({ type: 'talk', npc: 'healer' })) out.staffed.add('healer');
      }
      if (obj.kind === 'fix') out.fix = true;
      if (obj.kind === 'use' && obj.use === 'terminal') out.useTerminal = true;
      if (obj.kind === 'use' && obj.use === 'kiuas') out.kiuas = true;
      if (obj.kind === 'use' && obj.use === 'printer') out.printer = true;
      if (obj.kind === 'count' && obj.match && obj.match({ type: 'talk', npc: 'healer' })) out.healer = true;
    }
    return out;
  }

  let target = null; // { kind, x, z, near, act, actor, it, until }
  let targetT = 0;
  const DT = 1 / 30;
  B.DT = DT;
  const ignored = new Set();


  let mission = null, spineRoute = [], spineIndex = 0, routeReturning = null;
  const patrolLast = new Map();
  function missionTarget(m) {
    const threat = nearestOf(g.actors.filter((a) => a.hostile && a.aggro && !a.resolved), 14);
    if (threat) return { kind: 'fight', actor: threat };
    if (m.objectiveDone) {
      const it = g.level.interactables.find((i) => i.kind === 'elevator');
      return it ? { kind: 'use', it, x: it.x, z: it.z } : null;
    }
    if (m.card === 'vendor') {
      const consultant = nearestOf(g.actors.filter((a) => a.kind === 'consultant' && !a.resolved));
      const vendor = nearestOf(g.actors.filter((a) => a.kind === 'vendor' && !a.resolved));
      const actor = consultant ?? vendor;
      return actor ? { kind: 'fight', actor } : null;
    }
    const mark = g.markers.find((m) => m.icon === '◆');
    const it = mark && g.level.interactables.find((i) => i.kind === 'locker' && Math.hypot(i.x - mark.x, i.z - mark.z) < 1);
    return it ? { kind: 'use', it, x: it.x, z: it.z } : null;
  }

  function routeAlongSpine(m, goal) {
    const L = g.level, W = L.w;
    const cells = new Set(m.spine.map((p) => cell(p.z) * W + cell(p.x)).filter((c) => L.solid[c] === 0));
    const from = field(g.player.pos.x, g.player.pos.z), to = field(goal.x, goal.z);
    const closest = (f) => [...cells].filter((c) => f[c] >= 0).sort((a, b) => f[a] - f[b])[0];
    const start = closest(from), end = closest(to);
    if (start === undefined || end === undefined) return [];
    const prev = new Map([[start, null]]), q = [start];
    for (let i = 0; i < q.length && !prev.has(end); i++) {
      const c = q[i];
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (!cells.has(n) || prev.has(n) || Math.abs(n % W - c % W) > 1) continue;
        prev.set(n, c); q.push(n);
      }
    }
    if (!prev.has(end)) return [];
    const route = [];
    for (let c = end; c !== null; c = prev.get(c)) route.unshift({ x: cc(c % W), z: cc(Math.floor(c / W)) });
    return route;
  }

  // Quiet reads only m.hud (eye, visible people/bars, learned patrols),
  // m.spine, objectiveDone, map geometry/markers and the player's own state.
  // m.actors is diagnostics and is never a quiet-policy input.
  function quietAct(m) {
    activity = 'idle';
    inp.holdAttack(false); inp.holdBlock(false);
    inp.keys.delete(K.sprint);
    if (!g.player.crouching) press(K.sneak);
    const mark = g.markers.find((a) => a.icon === '◆');
    if (!mark) { release(); return; }
    if (routeReturning !== m.objectiveDone) {
      routeReturning = m.objectiveDone;
      spineRoute = routeAlongSpine(m, mark); spineIndex = 0;
    }
    let node = spineRoute[spineIndex];
    const p = g.player.pos;
    if (node && Math.hypot(node.x - p.x, node.z - p.z) < 0.7) {
      const ahead = spineRoute[spineIndex + 1] ?? mark;
      const patrols = m.hud.actors.filter((a) => a.visible && a.sort === 'patrol' && a.patrol.length > 0);
      const nearest = patrols.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
      const last = nearest && patrolLast.get(nearest.id);
      const approaching = nearest && last && (nearest.x - last.x) * (ahead.x - nearest.x) + (nearest.z - last.z) * (ahead.z - nearest.z) > 1e-6;
      if (nearest && approaching && Math.hypot(nearest.x - p.x, nearest.z - p.z) <= 8) {
        release(); face(nearest.x, nearest.z); return;
      }
      node = spineRoute[++spineIndex];
    }
    if (node) { goTo(node.x, node.z, 0.6); checkStuck(true); return; }
    const it = g.level.interactables.find((i) => (m.objectiveDone ? i.kind === 'elevator' : i.kind === 'locker') && Math.hypot(i.x - mark.x, i.z - mark.z) < 1);
    if (!it) { release(); return; }
    useMissionObjective(it);
  }

  function useMissionObjective(it) {
    const p = g.player.pos;
    if (Math.hypot(it.x - p.x, it.z - p.z) < 3.4) { face(it.x, it.z); H.findPrompt(); }
    const prompt = g.promptTarget;
    if (prompt && prompt.kind === 'interact' && prompt.it === it) { release(); press(K.interact); }
    else { goTo(it.x, it.z, 0.8); checkStuck(true); }
  }

  function missionPolicy(m) {
    mission = m;
    const quiet = B.policy.approach !== 'loud' && m.hud.tier < 2;
    if (quiet !== B.quiet) { target = null; targetT = 0; }
    B.quiet = quiet;
    if (!quiet && g.player.crouching) press(K.sneak);
    if (quiet) quietAct(m);
    else act();
    for (const a of m.hud.actors) if (a.visible) patrolLast.set(a.id, { x: a.x, z: a.z });
  }

  let lastPinAt = -Infinity;
  function missionLock() {
    release(); inp.holdAttack(false); inp.holdBlock(false);
    const marker = document.querySelector('.lock-marker');
    const zone = document.querySelector('.lock-zone');
    const bar = document.querySelector('.lock-bar');
    if (!marker || !zone || !bar) return;
    const pos = parseFloat(marker.style.left), left = parseFloat(zone.style.left), width = parseFloat(zone.style.width);
    // Aim inside the green, with a little margin; the animation runs in real time.
    if (pos >= left + width * 0.2 && pos <= left + width * 0.8 && performance.now() - lastPinAt >= 100) {
      bar.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      lastPinAt = performance.now();
    }
  }

  function pickTarget() {
    if (mission) return missionTarget(mission);
    const s = g.save, d = g.derivedCache;
    const ob = objectives();
    const low = s.sanity < d.maxSanity * 0.3;
    // 0. Hurt and cornered: back off toward a healer, or away from trouble.
    if (low) {
      const lady = nearestOf(g.actors.filter((a) => a.kind === 'healer' && !a.resolved));
      if (lady) return { kind: 'goto', x: lady.pos.x, z: lady.pos.z, near: 2.5, wait: 8, flee: true };
      return { kind: 'goto', x: g.level.start.x, z: g.level.start.z, near: 2, wait: 6, flee: true };
    }
    // 1. Anyone on us. The boss only when we are fit for it.
    const bossOk = s.sanity >= d.maxSanity * 0.7;
    const threat = nearestOf(g.actors.filter((a) => a.hostile && !a.resolved && (a.aggro || a.kind === 'turret') && (a.kind !== 'boss' || (a.bossActive && bossOk))), 14);
    if (threat) return { kind: 'fight', actor: threat };
    // 2. Low sanity: supplies, or a healer.
    if (s.sanity < d.maxSanity * 0.45) {
      const lady = nearestOf(g.actors.filter((a) => a.kind === 'healer' && !a.resolved));
      if (lady) return { kind: 'goto', x: lady.pos.x, z: lady.pos.z, near: 2.5, actor: lady, wait: 6 };
    }
    // 3. Tickets and terminal objectives.
    const slaLow = s.queue.some((q) => q.sla < 45);
    if (s.queue.length >= 3 || slaLow || ob.fix || ob.useTerminal) {
      const terms = g.level.interactables.filter((i) => i.kind === 'terminal' && !ignored.has(i.id) && (!ob.useTerminal || !g.loggedOn.has(i.id) || s.queue.length > 0));
      const t = nearestOf(terms);
      if (t) return { kind: 'use', it: t, x: t.x, z: t.z, staffing: ob.staffed.has('fix') || ob.staffed.has('useTerminal') };
    }
    // 4. A mentee who wandered off, or a mentor ask.
    if (g.mentorAsk && !g.mentorAsk.actor.resolved) { const a = g.mentorAsk.actor; return { kind: 'talk', actor: a }; }
    for (const q of s.questLog) if (q.mentor && !q.done && !q.failed) { const m = g.actors.find((a) => a.name === q.by && !a.resolved); if (m && !m.recruited) return { kind: 'talk', actor: m }; }
    // 5. Things to use for quests.
    if (ob.kiuas) { const k = nearestOf(g.level.interactables.filter((i) => i.kind === 'kiuas' && !i.used)); if (k) return { kind: 'use', it: k, x: k.x, z: k.z, staffing: ob.staffed.has('kiuas') }; }
    if (ob.printer) { const k = nearestOf(g.level.interactables.filter((i) => i.kind === 'printer' && !i.used)); if (k) return { kind: 'use', it: k, x: k.x, z: k.z, staffing: ob.staffed.has('printer') }; }
    if (ob.healer) { const l = nearestOf(g.actors.filter((a) => a.kind === 'healer' && !a.resolved && a.memo.questTalk !== true)); if (l) return { kind: 'talk', actor: l, staffing: ob.staffed.has('healer') }; }
    // 6. Quest markers: items, turn-ins, rooms, hunts, givers (if there is room).
    const room = d.workload < d.capacity;
    const marks = g.markers.filter((m) => {
      const key = `${Math.round(m.x)},${Math.round(m.z)}`;
      if (ignored.has(key)) return false;
      if (m.icon === '▲' || m.icon === '⌂') return false;
      if (m.label && m.label.includes('(locked)')) return false;
      if (m.icon === '!' && (!room || !B.policy.sideQuests) && m.color === '#ffd54a') return false;
      if (m.icon === '☠' && g.boss && m.label === g.boss.name) return false;
      // Somebody we already gave up on (they wander, so their marker moves): skip them.
      const who = g.actors.find((a) => !a.resolved && Math.hypot(a.pos.x - m.x, a.pos.z - m.z) < 0.6);
      if (who && ignored.has(who.id)) return false;
      return true;
    });
    const m = nearestOf(marks);
    if (m) {
      const actor = g.actors.find((a) => !a.resolved && Math.hypot(a.pos.x - m.x, a.pos.z - m.z) < 0.6);
      const staffing = m.icon === '📌' || (actor && s.questLog.some((q) => q.staffed && !q.done && !q.failed && !q.delegated && q.id === actor.questTag));
      if (actor && actor.hostile) return { kind: 'fight', actor, staffing };
      if (actor) return { kind: 'talk', actor, mark: m, staffing };
      return { kind: 'goto', x: m.x, z: m.z, near: 1.2, mark: m, wait: 0, staffing };
    }
    // 7. Recruit a teammate or two.
    if (B.policy.recruit && recruitedCount() < 2) {
      const h = nearestOf(g.actors.filter((a) => a.kind === 'helper' && !a.recruited && !a.resolved && a.npcId === null && ['sysadmin', 'security', 'intern'].includes(a.role) && a.morale >= 25 && !ignored.has(a.id) && (a.__talkedAt === undefined || g.time - a.__talkedAt > 60)), 30);
      if (h) return { kind: 'talk', actor: h };
    }
    // 8. Clear the floor, then the boss, then the lift.
    const left = hostiles().filter((a) => PEOPLE.includes(a.kind));
    const floorMin = (g.time - B.cur.t0) / 60;
    const total = B.cur.hostiles0 || 1;
    if (left.length / total > 0.3 && floorMin < B.policy.maxFloorMinutes * 0.7) {
      const h = nearestOf(left);
      if (h) return { kind: B.talkers.has(h.id) ? 'talk' : 'fight', actor: h };
    }
    if (g.boss && !g.boss.resolved) {
      if (s.sanity < d.maxSanity * 0.8) {
        const lady = nearestOf(g.actors.filter((a) => a.kind === 'healer' && !a.resolved));
        if (lady) return { kind: 'goto', x: lady.pos.x, z: lady.pos.z, near: 2.5, wait: 10 };
      }
      return { kind: g.boss.docile ? 'talk' : 'fight', actor: g.boss };
    }
    const lift = g.level.interactables.find((i) => i.kind === 'elevator');
    if (lift && g.elevatorOpen) return { kind: 'use', it: lift, x: lift.x, z: lift.z };
    return null;
  }
  B.talkers = new Set();

  function act() {
    activity = 'other';
    const s = g.save, d = g.derivedCache;
    if (s.sanity < d.maxSanity * 0.45 && (B.lastQuick ?? 0) < g.time - 2.5) { press(K.quickuse); B.lastQuick = g.time; }
    if (target && target.flee && s.sanity > d.maxSanity * 0.6) target = null;
    targetT += DT;
    if (target === null || targetT > 20 || (target.actor && target.actor.resolved) || (target.kind === 'goto' && target.done)) {
      if (target && targetT > 20 && target.kind !== 'fight') {
        if (target.it) ignored.add(target.it.id);
        if (target.mark) ignored.add(`${Math.round(target.mark.x)},${Math.round(target.mark.z)}`);
        if (target.actor && target.kind === 'talk') ignored.add(target.actor.id);
      }
      target = pickTarget();
      targetT = 0;
    }
    // Losing: break off and heal.
    if (target && target.kind === 'fight' && s.sanity < d.maxSanity * 0.3) { target = pickTarget(); targetT = 0; }
    // Re-evaluate often in case something attacks us.
    if (target && target.kind !== 'fight' && Math.floor(g.time * 2) !== Math.floor((g.time - DT) * 2)) {
      const threat = g.actors.find((a) => a.hostile && !a.resolved && a.aggro && Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 7 && a.kind !== 'boss');
      if (threat) { target = { kind: 'fight', actor: threat }; targetT = 0; }
    }
    if (target === null) {
      activity = 'idle';
      // Nothing to do: wander somewhere new rather than stand still.
      B.idleT = (B.idleT ?? 0) + DT;
      if (B.idleT > 30) {
        B.idleT = 0;
        const rooms = g.level.rooms.filter((r) => r.kind !== 'boss');
        const rm = rooms[Math.floor(R() * rooms.length)];
        if (rm) target = { kind: 'goto', x: (rm.x + rm.w / 2) * TILE, z: (rm.y + rm.h / 2) * TILE, near: 2, wait: 1 };
      }
      release();
      checkStuck(false);
      return;
    }
    B.idleT = 0;
    const p = g.player.pos;
    if (target.kind === 'fight') {
      const a = target.actor;
      const w = d.weapon;
      const range = w.kind === 'melee' ? Math.max(1.6, (w.range ?? 2.5) * 0.85) : w.kind === 'cone' ? (w.range ?? 5) * 0.7 : 10;
      const dist = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      // Decide once per person whether to try talking them down.
      if (a.__bot === undefined) { a.__bot = R() < B.policy.talk ? 'talk' : 'fight'; if (a.__bot === 'talk') B.talkers.add(a.id); }
      if (a.__bot === 'talk' && !a.talked && ['user', 'caller', 'customer', 'consultant', 'vendor', 'manager'].includes(a.kind) && a.enragedT <= 0) { target = { kind: 'talk', actor: a }; return; }
      if (dist > range) { goTo(a.pos.x, a.pos.z, range * 0.9); checkStuck(true); return; }
      activity = 'fighting';
      release();
      face(a.pos.x, a.pos.z);
      // Block (and sometimes parry) when somebody next to us is about to swing.
      const incoming = g.actors.some((e) => e.hostile && !e.resolved && e.aggro && e.cooldown < 0.12 && e.cooldown > -0.5 && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < (e.kind === 'boss' ? 3.2 : 2.1));
      // Attack and block through the Input's scripted presses (whatever they are bound to).
      if (incoming && s.energy > 15 && R() < B.policy.block) { inp.holdBlock(true); inp.holdAttack(false); checkStuck(false); return; }
      inp.holdBlock(false);
      if (w.kind === 'melee' || w.kind === 'nova') { if (g.attackCd <= 0) inp.tapAttack(); inp.holdAttack(false); }
      else inp.holdAttack(true);
      checkStuck(false);
      return;
    }
    inp.holdAttack(false);
    inp.holdBlock(false);
    if (target.kind === 'talk') {
      activity = target.staffing ? 'staffing' : 'other';
      const a = target.actor;
      const dist = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (dist > 2.0) { goTo(a.pos.x, a.pos.z, 1.8); checkStuck(true); return; }
      release(); face(a.pos.x, a.pos.z);
      H.findPrompt();
      if (g.promptTarget && g.promptTarget.kind === 'actor' && g.promptTarget.a === a) { press(K.interact); a.__talkedAt = g.time; target.done = true; target = null; return; }
      if (dist > 1.1) { goTo(a.pos.x, a.pos.z, 1.0); return; }
      if (targetT > 6) { ignored.add(a.id); if (target.mark) ignored.add(`${Math.round(target.mark.x)},${Math.round(target.mark.z)}`); target = null; }
      return;
    }
    if (target.kind === 'use') {
      const it = target.it;
      const reach = it.kind === 'elevator' || it.kind === 'itdesk' || it.kind === 'car' ? 2.6 : 1.9;
      // Things set into a wall can be out of reach of the path's end: stop when the prompt appears.
      if (Math.hypot(it.x - p.x, it.z - p.z) < 3.4) { face(it.x, it.z); H.findPrompt(); }
      const inPrompt = g.promptTarget && g.promptTarget.kind === 'interact' && g.promptTarget.it === it;
      if (!inPrompt && !goTo(it.x, it.z, reach)) { checkStuck(true); return; }
      activity = target.staffing ? 'staffing' : it.kind === 'terminal' ? 'terminal' : 'other';
      release();
      face(it.x, it.z);
      H.findPrompt();
      if (g.promptTarget && g.promptTarget.kind === 'interact' && g.promptTarget.it === it) { press(K.interact); target = null; }
      else if (targetT > 6) { ignored.add(it.id); target = null; }
      return;
    }
    if (target.kind === 'goto') {
      if (goTo(target.x, target.z, target.near)) {
        target.wait -= DT;
        if (target.wait <= 0) { target.done = true; if (target.mark) ignored.add(`${Math.round(target.mark.x)},${Math.round(target.mark.z)}`); }
      } else checkStuck(true);
    }
  }

  // ---------------------------------------------------------------- the week
  function newFloor() {
    const s = g.save;
    if (g.screen !== 'play' || s.location !== 'office' || B.floors.some((f) => f.floor === s.floor)) return;
    B.cur = {
      floor: s.floor, rung: s.rung, level: s.level, t0: g.time, rep0: s.rep, warnings0: s.warnings, burnouts: 0, minSanity: 1,
      overloadT: 0, maxOver: 0, staffOffers: 0, pushTries: 0, pushOk: 0, mentorAsks: 0, sideTaken: 0, fixed: 0, wrong: 0, terminalVisits: 0,
      hostiles0: hostiles().filter((a) => PEOPLE.includes(a.kind)).length, staffedDone0: s.stats.staffedDone, staffedMissed0: s.stats.staffedMissed,
      mentored0: s.stats.mentored, perk0: s.perkPoints, quits: 0, moraleSum: 0, moraleN: 0, treats0: s.stats.treats, drinks0: s.stats.drinks, sideDone0: s.questLog.filter((q) => q.done && !q.staffed && !q.mentor).length,
      p1: 0, levelUps: 0,
      floorSec: 0, aggroSec: 0, combatSec: 0, aggroEpisodes: 0, combatActive: false, quietSec: 0, lastDamageAt: -Infinity,
      activitySec: { fighting: 0, walking: 0, terminal: 0, dialogue: 0, staffing: 0, idle: 0, other: 0 },
      talkdowns0: s.stats.resolvedPeace, resolvesByForce0: s.stats.resolvedField,
    };
    ignored.clear();
    B.talkers = new Set();
    target = null;
  }
  function endFloor(reason) {
    const s = g.save, c = B.cur;
    if (!c) return;
    const minutes = (g.time - c.t0) / 60;
    const rec = {
      floor: c.floor, rung: c.rung, level: c.level, minutes: +minutes.toFixed(1), reason,
      floorSec: c.floorSec, combatSec: c.combatSec, combatShare: c.floorSec > 0 ? c.combatSec / c.floorSec : 0, aggroEpisodes: c.aggroEpisodes,
      aggroSec: c.aggroSec, aggroShare: c.floorSec > 0 ? c.aggroSec / c.floorSec : 0,
      activitySec: { ...c.activitySec },
      talkdowns: s.stats.resolvedPeace - c.talkdowns0, resolvesByForce: s.stats.resolvedField - c.resolvesByForce0,
      burnouts: c.burnouts, minSanityPct: Math.round(c.minSanity * 100), overloadPct: Math.round((c.overloadT / Math.max(1, g.time - c.t0)) * 100), maxOver: c.maxOver,
      staffOffers: c.staffOffers, staffDone: s.stats.staffedDone - c.staffedDone0, staffMissed: s.stats.staffedMissed - c.staffedMissed0, pushTries: c.pushTries, pushOk: c.pushOk,
      mentorAsks: c.mentorAsks, mentored: s.stats.mentored - c.mentored0, sideTaken: c.sideTaken,
      sideDone: s.questLog.filter((q) => q.done && !q.staffed && !q.mentor).length - c.sideDone0,
      fixed: c.fixed, wrong: c.wrong, repGain: s.rep - c.rep0, warnings: s.warnings - c.warnings0, perkGain: s.perkPoints - c.perk0,
      quits: c.quits, avgMorale: c.moraleN ? Math.round(c.moraleSum / c.moraleN) : null, treats: s.stats.treats - c.treats0,
      resolvedPct: Math.round((1 - hostiles().filter((a) => PEOPLE.includes(a.kind)).length / Math.max(1, c.hostiles0)) * 100),
    };
    B.floors.push(rec);
    B.cur = null;
    return rec;
  }

  // Aggro is sampled at tick start; activity also counts the bot's menu clock.
  function step(doing = activity, advanceClock = false) {
    if (g.screen === 'play' && g.save.location === 'office' && B.cur === null) newFloor();
    const c = B.cur;
    const onFloor = c && g.save.location === 'office' && c.floor === g.save.floor;
    const inFloor = onFloor && g.screen === 'play';
    const p = g.player.pos;
    const aggro = inFloor && g.actors.some((a) => a.hostile && !a.resolved && a.aggro && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) <= 14);
    const clockBefore = g.time;
    if (advanceClock) g.time += DT;
    const before = g.time;
    g.step(DT);
    const dt = g.time - before;
    if (onFloor) c.activitySec[doing] += Math.max(0, g.time - clockBefore);
    if (!inFloor || dt <= 0) return;
    c.floorSec += dt;
    if (aggro) c.aggroSec += dt;
    const combatDt = aggro ? dt : Math.max(0, Math.min(dt, c.lastDamageAt + 2 - before));
    if (combatDt > 1e-9) {
      c.combatSec += combatDt;
      if (!c.combatActive) c.aggroEpisodes++;
      c.combatActive = true;
      c.quietSec = 0;
    }
    if (c.combatActive) {
      c.quietSec += dt - combatDt;
      if (c.quietSec >= 3 - 1e-9) c.combatActive = false;
    }
  }

  function sample() {
    const s = g.save, d = g.derivedCache, c = B.cur;
    if (!c || s.location !== 'office') return;
    c.minSanity = Math.min(c.minSanity, s.sanity / d.maxSanity);
    if (d.overload > 0) c.overloadT += DT;
    c.maxOver = Math.max(c.maxOver, d.overload);
    for (const a of g.actors) {
      if (a.kind === 'helper' && a.recruited && a.npcId === null && ['sysadmin', 'security', 'intern'].includes(a.role)) { c.moraleSum += a.morale; c.moraleN++; a.__wasRec = true; }
      else if (a.__wasRec && !a.recruited && a.morale < 15.5) { c.quits++; a.__wasRec = false; }
      else if (a.__wasRec && !a.recruited) a.__wasRec = false;
    }
  }

  function weekend() {
    const s = g.save;
    // Level up at the mökki, spend perks, buy kit, then back to work.
    let guard = 0;
    while (g.screen === 'dialogue' && guard++ < 40) { handleDialogue(); step(); }
    if (g.screen === 'ending') return 'ending';
    guard = 0;
    while (s.level < 60 && guard++ < 6) {
      const before = s.level;
      H.rest();
      let n = 0;
      while (g.screen === 'dialogue' && n++ < 40) { handleDialogue(); step(); }
      if (s.level === before) break;
      B.cur && B.cur.levelUps++;
    }
    const prefs = ['patience', 'timemgmt', 'percussive', 'thickskin', 'listening', 'back', 'cardio', 'boundaries', 'ironliver', 'loylywell', 'delegate', 'teflon', 'caffeine'];
    for (let k = 0; k < 10 && s.perkPoints > 0; k++) { const p0 = s.perkPoints; for (const id of prefs) { g.takePerk(id); if (s.perkPoints < p0) break; } if (s.perkPoints === p0) break; }
    if (B.policy.buy) {
      // Keep a fund; buy the best affordable weapon and body armour, some biscuits and cans.
      for (const id of ['sudo', 'toner', 'cat6', 'oooRobe', 'cardigan', 'hardhat', 'trainers', 'mug']) {
        const r = g.price ? g.price(0) : 0; void r;
        if (s.gear.some((x) => x.base === id)) continue;
        const msg = g.buy(id);
        if (msg === null) B.events.push(`bought ${id} on floor ${s.floor}`);
      }
      for (const id of ['biscuits', 'biscuits', 'fazer', 'monster', 'korvapuusti']) g.buy(id);
    }
    return 'ok';
  }

  function handleOverlay() {
    const btns = [...document.querySelectorAll('.screen-btn')];
    if (g.screen === 'dead') {
      B.cur && B.cur.burnouts++;
      B.burnouts = (B.burnouts ?? 0) + 1;
      const recent = B.hurtLog.filter((h) => h.t > g.time - 30);
      const by = {};
      for (const h of recent) by[h.src] = Math.round((by[h.src] ?? 0) + h.lost);
      const near = g.actors.filter((a) => a.hostile && !a.resolved && a.aggro && Math.hypot(a.pos.x - g.player.pos.x, a.pos.z - g.player.pos.z) < 10).length;
      B.deaths.push({ floor: g.save.floor, min: B.cur ? +((g.time - B.cur.t0) / 60).toFixed(1) : null, boss: !!(g.boss && g.boss.bossActive && !g.boss.resolved), near, by, lvl: g.save.level, weapon: g.derivedCache.weapon.id, armor: +g.derivedCache.armor.toFixed(2), maxSan: Math.round(g.derivedCache.maxSanity) });
      B.hurtLog = [];
      btns[0]?.click();
      return;
    }
    if (g.screen === 'transition') { btns[0]?.click(); return; }
    if (g.screen === 'ending') { B.ended = true; return; }
    if (g.screen === 'paused') { btns[0]?.click(); }
  }

  // What hurt us, for the last half-minute: the cause of every burnout.
  B.hurtLog = [];
  B.deaths = [];
  B.totalBy = {};
  g.onCombatDamage = () => {
    const c = B.cur;
    if (c && c.floor === g.save.floor && g.save.location === 'office' && g.screen === 'play') c.lastDamageAt = g.time;
  };
  if (!g.__botHooked) {
    g.__botHooked = true;
    const orig = g.hurtPlayer.bind(g);
    g.hurtPlayer = (amount, from, kind) => {
      const before = g.save.sanity;
      orig(amount, from, kind);
      const lost = before - g.save.sanity;
      if (lost > 0) { const src = `${kind}:${from ? from.kind : '-'}${from && from.elite ? '*' : ''}`; B.hurtLog.push({ t: g.time, lost, src }); B.totalBy[src] = (B.totalBy[src] ?? 0) + lost; }
    };
  }
  B.run = (seconds, maxFloors = Infinity, wallMs = 20000) => {
    const s = g.save;
    const t0 = performance.now();
    const until = g.time + seconds;
    let steps = 0;
    while (g.time < until && performance.now() - t0 < wallMs) {
      steps++;
      if (B.ended || B.floors.length >= maxFloors) break;
      const m = H.mission?.();
      if (m) {
        if (m.over) { B.ended = true; release(); inp.holdAttack(false); break; }
        if (g.lockpick.open) { missionLock(); break; }
        if (g.screen !== 'play') { handleDialogue(); break; }
        if (B.cur === null) newFloor();
        missionPolicy(m);
        sample();
        step();
        sample();
        continue;
      }
      if (g.screen === 'dialogue' || g.screen === 'minigame') { if (!handleDialogue()) { g.lockpick?.cancel?.(); if (g.screen !== 'play') { g.screen = 'play'; } } step('dialogue', true); continue; }
      if (g.screen === 'os') { if (g.currentTerminal) workTerminal(); else g.close(); step('terminal', true); continue; }
      if (g.screen !== 'play') { const doing = g.screen === 'paused' ? 'idle' : 'other'; handleOverlay(); step(doing, true); continue; }
      if (s.location === 'mokki') {
        if (B.cur && B.cur.floor === s.floor) endFloor('friday');
        const r = weekend();
        if (r === 'ending') { B.ended = true; break; }
        g.goToWork();
        handleOverlay();
        newFloor();
        continue;
      }
      if (B.cur === null || B.cur.floor !== s.floor) { if (B.cur) endFloor('changed'); newFloor(); }
      if (B.cur === null) { step(); continue; }
      // Too long on a floor: a real player would find the boss eventually.
      if ((g.time - B.cur.t0) / 60 > B.policy.maxFloorMinutes * 1.6 && !B.cur.timedOut) {
        B.cur.timedOut = true;
        if (g.boss && !g.boss.resolved) { g.boss.hp = 0; g.boss.aggro = true; }
        g.elevatorOpen = true;
        B.events.push(`timeout on floor ${s.floor}`);
      }
      act();
      sample();
      const wasMokki = s.location;
      const san0 = s.sanity;
      const hurt0 = B.hurtLog.length;
      // Hostile projectiles close to us before the step: the ones gone after it most likely hit.
      const pp = g.player.pos;
      const close = g.projectiles.filter((q) => q.hostile && q.mesh && Math.hypot(q.mesh.position.x - pp.x, q.mesh.position.z - pp.z) < 2.5);
      step();
      const hurtNow = B.hurtLog.slice(hurt0).reduce((a, h) => a + h.lost, 0);
      const other = san0 - s.sanity - hurtNow;
      if (other > 0.0001 && s.location === 'office') {
        const gone = close.filter((q) => !g.projectiles.includes(q));
        let tag;
        if (gone.length > 0) {
          const q = gone[0];
          tag = `proj:${q.owner ? q.owner.kind : '-'}/${q.kind}`;
        } else {
          const d = g.derivedCache;
          tag = `other:${s.crash > 0 ? 'crash' : ''}${d.caffeine.drain > 0 ? 'caff' : ''}${s.hangover > 0 ? 'hang' : ''}${d.band.regen < 0 ? 'band' : ''}${g.auraSlow > 0 ? 'aura' : ''}${g.hazardSlow > 0 ? 'hazard' : ''}`;
        }
        B.hurtLog.push({ t: g.time, lost: other, src: tag });
        B.totalBy[tag] = (B.totalBy[tag] ?? 0) + other;
      }
      if (s.location === 'mokki' && wasMokki === 'office') endFloor('friday');
    }
    return { steps, lockpick: g.lockpick.open, time: +g.time.toFixed(1), floor: s.floor, loc: s.location, screen: g.screen, rep: s.rep, sanity: Math.round(s.sanity), level: s.level, rung: s.rung, queue: s.queue.length, target: target ? target.kind + (target.actor ? ':' + target.actor.kind : target.it ? ':' + target.it.kind : '') : null, ms: Math.round(performance.now() - t0) };
  };
})();
