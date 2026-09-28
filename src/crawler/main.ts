import { TICKETS } from './content/tickets';
import { Game } from './game';
import { rest } from './hosts';
import { findPrompt, interact } from './interact';
import { offerStaffing } from './questing';
import { currentObjective, type QuestState } from './quests';
import { requestMentoring } from './teamwork';

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
  };
} catch (err) {
  mount.innerHTML = '<div class="screen" style="display:flex"><div class="title-logo small dead">BSOD</div>'
    + '<p class="title-blurb">The workstation could not start WebGL. Try a different browser, or turn hardware acceleration on.</p></div>';
  console.error(err);
}
