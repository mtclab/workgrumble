import { stageDuel, standBeforeActor } from './combat';
import { TICKETS } from './content/tickets';
import type { ActorKind } from './entities';
import { Game } from './game';
import { rest } from './hosts';
import type { HubDebug } from './hub';
import { findPrompt, interact, standAt } from './interact';
import { CARDS_SHOWN, INDUCTION_TERMINAL_ID } from './inductionday';
import type { InteractKind } from './level';
import { type MissionDebug, startMission } from './missionplay';
import { missionById } from './missions';
import { pageNow } from './pager';
import { offerStaffing } from './questing';
import { currentObjective, type QuestState } from './quests';
import { requestMentoring } from './teamwork';
import { standNearFigure } from './vision';

const mount = document.getElementById('crawler');
if (mount === null) throw new Error('#crawler missing');
mount.replaceChildren();
try {
  const game = new Game(mount);
  // Handles for the browser smoke tests (and the curious).
  const w = window as unknown as { __crawler: Game; __helldesk: unknown };
  w.__crawler = game;
  w.__helldesk = {
    findPrompt: (): void => findPrompt(game),
    interact: (): void => interact(game),
    staff: (by: string, id?: string): boolean => offerStaffing(game, by, id),
    mentor: (id?: string): boolean => requestMentoring(game, id),
    fixesFor: (t: number): readonly string[] => TICKETS[t]?.fixes ?? [],
    objective: (st: QuestState) => currentObjective(st),
    rest: (): void => rest(game, true),
    page: (): boolean => pageNow(game),
    // SUO: a real kiuas to throw löyly on, the figure's side, and what the vision shows.
    toKiuas: (): boolean => standAt(game, 'kiuas'),
    toFigure: (): boolean => standNearFigure(game),
    calm: (): void => { for (const a of game.actors) a.aggro = false; },
    vision: (): { left: number; dist: number } | null => (game.vision === null ? null : { left: game.vision.clock.left, dist: game.vision.distance() }),
    // Combat: one of `kind` squared up in front of you, and what it is doing.
    duel: (kind: ActorKind, dist: number): number => stageDuel(game, kind, dist),
    // Induction day: where it is, what is standing in the lobby for it, and a place in front of each prop.
    induction: (): { step: string; sanityTold: boolean; dummy: number; props: string[]; terminal: boolean; hidden: string[] } | null => {
      const st = game.save.induction;
      const day = game.inductionDay;
      const props = game.actors.filter((a) => a.npcId === 'induction-morag' || a.npcId === 'induction-practice' || a.kind === 'dummy').map((a) => a.name);
      const terminal = game.level.interactables.some((it) => it.id === INDUCTION_TERMINAL_ID);
      if (st === null) return { step: 'none', sanityTold: false, dummy: -1, props, terminal, hidden: [...game.save.hudHidden] };
      return { step: st.step, sanityTold: st.sanityTold, dummy: day?.dummy?.id ?? -1, props, terminal, hidden: [...game.save.hudHidden] };
    },
    cardsShown: (): string[] => [...CARDS_SHOWN],
    standBefore: (which: 'morag' | 'colleague' | 'dummy' | 'terminal', dist: number): boolean => game.inductionDay?.standBefore(which, dist) ?? false,
    foe: (id: number): { pending: string | null; windup: number; stunned: number; resolved: boolean; calm: boolean; hp: number; dist: number } | null => {
      const a = game.actors.find((x) => x.id === id);
      if (a === undefined) return null;
      const dist = Math.hypot(a.pos.x - game.player.pos.x, a.pos.z - game.player.pos.z);
      return { pending: a.pending, windup: a.windup, stunned: a.stunned, resolved: a.resolved, calm: a.calm, hp: a.hp, dist };
    },
    // The playthrough (e2e/helldesk-playthrough.spec.ts). These place the
    // player or skip a wait; none of them resolves, fixes or saves anything.
    // In front of the first unused one of these (the lift, a terminal, the kiuas, the car).
    standAt: (kind: InteractKind): boolean => standAt(game, kind),
    // Turn to face somebody (the mouse's job, which a headless runner cannot aim).
    face: (id: number): boolean => {
      const a = game.actors.find((x) => x.id === id);
      if (a === undefined) return false;
      game.player.yaw = Math.atan2(game.player.pos.x - a.pos.x, game.player.pos.z - a.pos.z);
      game.player.pitch = 0;
      return true;
    },
    // This floor's boss: where the fight stands, and a spot `dist` metres in front of it.
    boss: (): { name: string; hp: number; maxHp: number; active: boolean; resolved: boolean } | null => {
      const b = game.boss;
      return b === null ? null : { name: b.name, hp: b.hp, maxHp: b.maxHp, active: b.bossActive, resolved: b.resolved };
    },
    toBoss: (dist: number): boolean => game.boss !== null && !game.boss.resolved && standBeforeActor(game, game.boss, dist),
    // A spot `dist` metres in front of somebody on the floor (the hub spec's fight with one of the floor's own people).
    toPerson: (id: number, dist: number): boolean => {
      const a = game.actors.find((x) => x.id === id && !x.resolved);
      return a !== undefined && standBeforeActor(game, a, dist);
    },
    // A long fight's damage already done: the boss down to `hp` (never up). The last hits are the player's.
    weakenBoss: (hp: number): boolean => {
      const b = game.boss;
      if (b === null || b.resolved) return false;
      b.hp = Math.max(1, Math.min(b.hp, hp));
      return true;
    },
    // A long shift's hits already taken: Sanity down to `left` (never up). The last hit is somebody's.
    wear: (left: number): void => { game.save.sanity = Math.max(1, Math.min(game.save.sanity, left)); },
    // Missions (the 0.3.0 spike, e2e/helldesk-mission.spec.ts and the balance bot): read-only state -
    // the tier, each person's suspicion and patrol, the spine's cells, the run - and two that only place the player.
    mission: (): MissionDebug | null => game.mission?.debug() ?? null,
    missionStandInView: (id: number, dist: number): boolean => game.mission?.standInView(id, dist) ?? false,
    missionToSpine: (): boolean => game.mission?.toSpine() ?? false,
    // The hub (0.3.0 S1a, e2e/helldesk-hub.spec.ts and the bot's hub-only week): read-only state, and one that only skips the wait for a walk-up.
    hub: (): HubDebug | null => game.hub?.debug() ?? null,
    hubWalkUpNow: (): void => game.hub?.walkUpNow(),
  };
  // `crawler.html?mission=stapler` (or vendor): a fresh trainee straight into
  // that card, no induction, nothing saved. `&seed=N` pins its map. With no
  // query (or an unknown card) the page is what it always was.
  const params = new URLSearchParams(window.location.search);
  const card = missionById(params.get('mission'));
  if (card !== undefined) {
    const asked = params.get('seed');
    const pinned = asked !== null && /^\d+$/.test(asked);
    startMission(game, card, pinned ? Number(asked) >>> 0 : Date.now() >>> 0, pinned);
  }
} catch (err) {
  mount.innerHTML = '<div class="screen" style="display:flex"><div class="title-logo small dead">BSOD</div>'
    + '<p class="title-blurb">The workstation could not start WebGL. Try a different browser, or turn hardware acceleration on.</p></div>';
  console.error(err);
}
