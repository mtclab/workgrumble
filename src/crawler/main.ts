import { Game } from './game';

const mount = document.getElementById('crawler');
if (mount === null) throw new Error('#crawler missing');
mount.replaceChildren();
try {
  const game = new Game(mount);
  (window as unknown as { __crawler: Game }).__crawler = game;
} catch (err) {
  mount.innerHTML = '<div class="screen" style="display:flex"><div class="title-logo small dead">BSOD</div>'
    + '<p class="title-blurb">The workstation could not start WebGL. Try a different browser, or turn hardware acceleration on.</p></div>';
  console.error(err);
}
