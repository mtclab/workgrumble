import { TICKETS } from './content/tickets';
import { Game } from './game';
import { rest } from './hosts';
import { findPrompt, interact } from './interact';
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
  };
} catch (err) {
  mount.innerHTML = '<div class="screen" style="display:flex"><div class="title-logo small dead">BSOD</div>'
    + '<p class="title-blurb">The workstation could not start WebGL. Try a different browser, or turn hardware acceleration on.</p></div>';
  console.error(err);
}
