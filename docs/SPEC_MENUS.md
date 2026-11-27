# Menus: flow and readability (spec, Helldesk 0.2.0 slice 3)

Status: decided with the owner - flow and readability, keeping the game's
loud look (not a visual redesign).

## Why

No screen answers the keyboard (no Enter, no focus styles); Esc does not
resume from pause; burnout offers only "Clock back in"; dialogue has no
Esc or Enter and dim option numbers; the backpack (Tab) hides the OS
icons, so Character (where perks are spent), Help and Achievements cannot
be reached from it; the New Starter Form is one long page of multipliers;
reading text is Tahoma; the maker's mark is missing.

## Changes

- **Keyboard on every overlay** (`screens.ts` `setOverlay`, chargen,
  dialogue, load/save lists): the default button is focused on open; Enter
  activates the focused button; arrow keys (and Tab) move between buttons;
  a clear `:focus-visible` style that fits the game's look.
- **Pause**: Esc resumes. The button "Backpack & Career" is renamed to what
  it opens.
- **Burnout** screen: "Clock back in", plus "Load game" and "Title screen".
  (The career-over and fired screens keep their single path.)
- **Dialogue**: Enter picks the highlighted option; Esc picks the safe
  "leave" option where one exists (never a hostile or costly choice);
  option numbers readable (not dim grey).
- **Backpack (pack mode)**: a small app bar along the top of the pack so
  Inventory, Character, Journal, Help and Achievements are one click or
  key away. Opening Character from the pause menu works too.
- **New Starter Form**: the name box is focused on open; Background and
  Hired as are shown first; Born under, Employer and Ironman fold under
  "More options" (closed by default, remembered); multipliers shown as
  plain words ("easier", "harder") with the number as a detail; Enter on
  the form signs the contract.
- **Type**: reading text (title blurb, dialogue text, tips, help, the
  induction cards, ending text) in the house serif stack
  `"Source Serif 4", Charter, "Bitstream Charter", "Sitka Text", Cambria,
  Georgia, serif` at line-height ~1.6. Display type stays for logos and
  boss cards; HUD numbers stay monospace.
- **Title is a real main menu** (owner, 2026-09-30): before any game is
  started, the title offers Continue / New career / Load game /
  **Settings** / **Controls & help** / What's new (slice 4). Settings is
  the same Control Panel settings (graphics, audio, keys, accessibility),
  opened as a panel over the title, working without a save or a world.
  The controls grid moves into Controls & help (trimmed to the essentials,
  including Space for jump); the title itself stays clean. A quiet "Built
  by MTC Lab" mark on title and pause.
- **Frozen states say so** (owner: "got stuck after talking to an NPC"):
  a talk-down or negotiation can end in a meeting that roots you for up
  to 4 s, shown today only as a small status chip - it reads as broken
  controls. Any time the player cannot move (meeting, freeze, sitting
  down), show a centred card with the reason and a countdown bar, and if
  a movement key is pressed while rooted, pulse the card and play a short
  "busy" sound so the player knows the input was heard.

## Gates

- e2e keyboard-only walk, no mouse: title -> New career (Enter) -> form
  (typed name, Enter) -> play -> Esc (pause) -> Esc (resume) -> Tab
  (backpack) -> Character via the app bar -> close.
- e2e: burnout -> Load game lands in the loaded save.
- e2e: dialogue answered by Enter; Esc takes the leave option.
- e2e: from a fresh browser (no save), Settings opens from the title,
  a change (e.g. quality) is kept, and New career starts with it.
- e2e: negotiate a manager into a meeting: the rooted card is visible
  with its reason while movement is blocked, pressing W pulses it, and it
  goes when movement returns.
- Unit where logic is pure (focus order, which option is "safe").
- Each proven to fail with its fix reverted.
