import { stageDuel } from './combat';
import { TICKETS } from './content/tickets';
import type { ActorKind } from './entities';
import { Game } from './game';
import { rest } from './hosts';
import { findPrompt, interact } from './interact';
import { CARDS_SHOWN, INDUCTION_TERMINAL_ID } from './inductionday';
import { pageNow } from './pager';
import { offerStaffing } from './questing';
import { currentObjective, type QuestState } from './quests';
import { requestMentoring } from './teamwork';
import { standAtKiuas, standNearFigure } from './vision';

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
    toKiuas: (): boolean => standAtKiuas(game, findPrompt),
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
    foe: (id: number): { pending: string | null; windup: number; stunned: number; resolved: boolean } | null => {
      const a = game.actors.find((x) => x.id === id);
      return a === undefined ? null : { pending: a.pending, windup: a.windup, stunned: a.stunned, resolved: a.resolved };
    },
  };
} catch (err) {
  mount.innerHTML = '<div class="screen" style="display:flex"><div class="title-logo small dead">BSOD</div>'
    + '<p class="title-blurb">The workstation could not start WebGL. Try a different browser, or turn hardware acceleration on.</p></div>';
  console.error(err);
}
