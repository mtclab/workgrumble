import type { DialogueNode, DialogueOption } from './dialogue';
import { said } from './dialogue';
import type { Actor } from './entities';
import { SPELLS } from './magic';
import { MAIN_ENDING_EVIDENCE } from './quests';
import {
  type ArchPath,
  ARCH_INFO,
  ARCH_RUNG,
  type Attribute,
  ATTRIBUTE_INFO,
  ATTRIBUTES,
  attributeMultiplier,
  BRANCH_RUNG,
  type Domain,
  DOMAIN_INFO,
  DOMAINS,
  type Faction,
  promotionNeeds,
  RUNG_COUNT,
  salaryFor,
  type Skill,
  SKILL_INFO,
  titleFor,
  type Track,
  TRACK_INFO,
} from './rpg';
import { fx } from './rng';
import { canDelegate } from './team';
import { PATIENCE_BONUS, perk, type SaveState, skillSum } from './state';

/** What the conversations are allowed to do to the world. Game implements it. */
export interface StoryHost {
  readonly save: SaveState;
  readonly floor: number;
  /** Odds for a check, before rolling (persuasion bonuses included). */
  odds(skill: Skill, attr: Attribute, difficulty: number): number;
  /** Roll a check, exercising the skill. */
  check(skill: Skill, attr: Attribute, difficulty: number): boolean;
  standing(f: Faction, delta: number): void;
  addRep(n: number): void;
  flag(key: string, value?: boolean | number): void;
  journal(text: string): void;
  toast(text: string, kind?: 'info' | 'good' | 'bad' | 'epic'): void;
  giveItem(id: string, n: number, from: string): void;
  finding(n: number, why: string): void;
  clearFindings(): void;
  warn(why: string): void;
  resolvePeacefully(a: Actor, how: 'fix' | 'ticket' | 'scared' | 'charmed' | 'meeting' | 'bribe'): void;
  /** A talk-down gone wrong. True if it started a fight (never while the floor sleeps for the induction). */
  enrage(a: Actor): boolean;
  /** `resistible` false: a meeting you chose to accept happens whatever you wear. */
  rootPlayer(seconds: number, reason: string, resistible?: boolean): void;
  /** "Oh, and while I have you": maybe staff you on something after this conversation. */
  maybeStaff(by: string, chance: number): void;
  /** A teammate's morale, cans and protégé status, for the dialogue header. */
  teamNote(a: Actor): string;
  /** Sweets and cans you could hand a teammate. */
  treatOptions(a: Actor): DialogueOption[];
  /** Too worn down to come with you. */
  tooTired(a: Actor): boolean;
  tip(id: 'team'): void;
  addActionItem(from: string): void;
  clearActionItems(from: string): number;
  enqueueTicket(a: Actor, gold: boolean): void;
  ticketTitle(a: Actor): string;
  ticketFix(a: Actor): string;
  healPlayer(amount: number, from: string): void;
  learnSpell(id: string): boolean;
  trainSkill(skill: Skill): void;
  recruitedHelper(): Actor | null;
  dismiss(a: Actor): void;
  promote(domain: Domain | null, track: Track | null, arch: ArchPath | null): void;
  demote(): void;
  fireFromJob(): void;
  spawnHostile(kind: 'user' | 'manager' | 'reply' | 'customer', n: number, name?: string): void;
  deliverLaptop(a: Actor): boolean;
  bossDeal(kind: 'nda' | 'mokki' | 'expose' | 'parachute'): void;
  auditorParley(outcome: 'ally' | 'fight'): void;
  applyLevelUp(first: Attribute, second: Attribute): void;
  evidence(): number;
  runeDiscount(): number;
}

const pct = (p: number): string => `${Math.round(p * 100)}%`;

function checkOption(
  h: StoryHost,
  label: string,
  skill: Skill,
  attr: Attribute,
  difficulty: number,
  ok: () => DialogueNode | null,
  fail: () => DialogueNode | null,
): DialogueOption {
  return {
    label,
    tag: `${SKILL_INFO[skill].name} ${pct(h.odds(skill, attr, difficulty))}`,
    pick: () => (h.check(skill, attr, difficulty) ? ok() : fail()),
  };
}

/** A failed talk-down enrages them - unless you have Executive Presence. */
function failTalk(h: StoryHost, a: Actor, line: string): DialogueNode {
  if (perk(h.save, 'presence') > 0) {
    a.talked = true;
    return said(a.name, `${line} ...but you keep your composure, and they deflate a little.`, 'neutral');
  }
  if (!h.enrage(a)) return said(a.name, `${line} ...but with Morag watching, they let it go. For now.`, 'neutral');
  return said(a.name, line, 'bad', 'Brace yourself');
}

// ---------------------------------------------------------------- hostile people

const OPENERS: Partial<Record<Actor['kind'], string>> = {
  consultant: 'I bill in fifteen-minute increments, so let us make this quick. My deck says your whole team is "legacy".',
  shadowit: 'Look, I spun up my own server because your change process takes six weeks. It is fine. It is on my credit card.',
  vendor: 'Hi! Have you got five minutes to talk about our AI-powered, cloud-native, zero-trust synergy platform? Free trial!',
};

export function talkHostile(h: StoryHost, a: Actor): DialogueNode {
  const title = h.ticketTitle(a);
  const customer = a.kind === 'customer';
  const hard = (customer || a.kind === 'consultant' ? 15 : 0) + h.floor * 4;
  const five = perk(h.save, 'fivewhys') > 0 ? 20 : 0;
  const opts: DialogueOption[] = [];
  if (a.kind === 'shadowit') {
    opts.push(checkOption(h, 'Let\'s get your server through change control properly. Together.', 'troubleshooting', 'tech', 30 + hard,
      () => { h.resolvePeacefully(a, 'fix'); h.standing('itcrowd', 3); return said(a.name, 'You would... help me? Nobody from IT has ever offered to help. Fine.', 'good'); },
      () => failTalk(h, a, 'Change control is where good ideas go to die.')));
  } else if (a.kind === 'vendor') {
    opts.push(checkOption(h, 'We are in a procurement freeze until Q3. Sorry.', 'soft', 'charm', 25 + hard,
      () => { h.resolvePeacefully(a, 'scared'); return said(a.name, 'Q3. Right. I will... put a reminder in. For Q3.', 'neutral'); },
      () => failTalk(h, a, 'Freezes thaw! Let me just show you one slide.')));
  } else if (a.kind === 'consultant') {
    opts.push(checkOption(h, 'Your deck is wrong, and here is the ticket history that proves it.', 'troubleshooting', 'tech', 35 + hard,
      () => { h.resolvePeacefully(a, 'fix'); h.standing('management', 3); return said(a.name, '...I will revise the deck. Please do not tell the partner.', 'good'); },
      () => failTalk(h, a, 'Data is just an opinion with a spreadsheet. Billing you for this.')));
  } else {
    opts.push(checkOption(h, `Walk them through it: "${h.ticketFix(a)}"`, 'troubleshooting', 'tech', 25 + hard - five,
      () => { h.resolvePeacefully(a, 'fix'); return said(a.name, 'Oh! Oh, that was it. Thank you. I feel slightly stupid.', 'good'); },
      () => failTalk(h, a, 'I ALREADY DID THAT. Twice. Are you even listening?')));
    opts.push(checkOption(h, 'Could you raise a ticket for that, please?', 'soft', 'charm', 20 + hard,
      () => { h.enqueueTicket(a, customer); h.resolvePeacefully(a, 'ticket'); return said(a.name, 'Fine. FINE. I will raise a ticket. Priority: urgent.', 'neutral'); },
      () => failTalk(h, a, 'A TICKET? I have been waiting since MONDAY.')));
  }
  opts.push(checkOption(h, 'Do you know what sudo means? Walk away.', 'hardware', 'grit', 35 + hard,
    () => { h.resolvePeacefully(a, 'scared'); h.standing('staff', -3); h.standing('management', 1); return said(a.name, '...I will come back later. Maybe next year.', 'neutral'); },
    () => { h.standing('staff', -2); return failTalk(h, a, 'Are you THREATENING me? I am telling HR. After I deal with you.'); }));
  if ((h.save.consumables.biscuits ?? 0) > 0) {
    opts.push({ label: 'Offer them a chocolate digestive.', tag: 'Biscuit', pick: () => {
      h.save.consumables.biscuits = (h.save.consumables.biscuits ?? 1) - 1;
      if ((h.save.consumables.biscuits ?? 0) <= 0) delete h.save.consumables.biscuits;
      h.standing('kitchen', 1);
      h.resolvePeacefully(a, 'bribe');
      return said(a.name, 'Oh, the GOOD ones. Do you know, it can wait. Thank you.', 'good');
    } });
  }
  if ((customer || a.kind === 'consultant') && h.save.rep >= 30) {
    opts.push({ label: 'Offer a service credit on the account.', tag: '₡30', pick: () => {
      h.addRep(-30);
      h.resolvePeacefully(a, 'bribe');
      return said(a.name, 'A credit. Well. That is the least you could do. I will allow it.', 'neutral');
    } });
  }
  if (h.save.bac >= 42) {
    opts.push({ label: 'Hey. Hey. I love you, man. Let\'s get a kebab.', tag: 'Drunk 50%', pick: () => {
      if (fx.chance(0.5)) {
        h.resolvePeacefully(a, 'charmed');
        return said(a.name, '...You know what? I could eat. Let us forget the printer.', 'good');
      }
      h.warn(`${a.name} reported you to HR for smelling of Koskenkorva`);
      return failTalk(h, a, 'Are you DRUNK? At WORK? I am reporting this.');
    } });
  }
  opts.push({ label: 'Fine. We do this the hard way.', pick: () => null });
  const opener = OPENERS[a.kind];
  return {
    speaker: a.name,
    subtitle: customer ? 'Gold-tier customer' : a.kind === 'consultant' ? 'Management consultant' : a.kind === 'shadowit' ? 'Shadow IT' : a.kind === 'vendor' ? 'Vendor' : 'End user',
    text: opener ?? `"${title}" - and they want it fixed now, in person, by you.`,
    options: opts,
  };
}

export function talkManager(h: StoryHost, a: Actor): DialogueNode {
  const subjects = ['Alignment on alignment', 'Quick sync re: the sync', 'Stand-up (seated)', 'Lessons learned: lessons', 'KPI deep dive'];
  const subject = fx.pick(subjects);
  const helper = h.recruitedHelper();
  const opts: DialogueOption[] = [
    { label: `Accept the meeting: "${subject}".`, tag: '4s rooted', pick: () => {
      h.rootPlayer(4, `In a meeting: "${subject}"`, false);
      h.standing('management', 3);
      h.resolvePeacefully(a, 'meeting');
      h.maybeStaff(a.name, 0.35);
      return said(a.name, 'Great sync. Really valuable. I will send the notes. Nobody will read them.', 'good');
    } },
    checkOption(h, 'I am on a P1 right now, can we async this?', 'soft', 'charm', 35 + h.floor * 4,
      () => { h.resolvePeacefully(a, 'meeting'); return said(a.name, 'Of course, of course. Drop me a Teams message. Or three.', 'neutral'); },
      () => { a.talked = true; h.rootPlayer(2, 'Cornered'); h.addActionItem(a.name); h.maybeStaff(a.name, 0.25); return said(a.name, 'Everything is a P1 with you people. Here, take an action item.', 'bad'); }),
  ];
  if (helper !== null && !canDelegate(h.save.rung)) {
    opts.push({ label: `Delegate it to ${helper.name}.`, tag: 'Architects only', disabled: true, pick: () => null });
  } else if (helper !== null) {
    opts.push({ label: `Delegate it to ${helper.name}.`, tag: 'Lose your helper', pick: () => {
      h.dismiss(helper);
      h.standing('itcrowd', -3);
      h.resolvePeacefully(a, 'meeting');
      return said(a.name, `Ah, ${helper.name}. Perfect. Walk with me.`, 'neutral');
    } });
  }
  // One pitch per manager, win or lose.
  opts.push(checkOption(h, 'While I have you: about my promotion...', 'soft', 'charm', 45 + h.save.rung * 4,
    () => { a.talked = true; h.standing('management', 5); h.maybeStaff(a.name, 0.5); return said(a.name, 'You know, I have been meaning to put your name forward. Leave it with me.', 'good', 'Fight them anyway'); },
    () => { a.talked = true; h.standing('management', -3); return said(a.name, 'Let us revisit that next quarter. And the one after.', 'bad', 'Brace yourself'); }));
  opts.push({ label: 'No.', pick: () => null });
  return { speaker: a.name, subtitle: 'Management', text: 'Got a sec? I have put fifteen minutes in your calendar. It is now.', options: opts };
}

// ---------------------------------------------------------------- friends

export function talkHealer(h: StoryHost, a: Actor): DialogueNode {
  const s = h.save;
  const k = s.standing.kitchen;
  if (k <= -40) return said(a.name, 'Oh, it is you. No, I will not put the kettle on. Not after the fridge.', 'bad');
  if (s.bac >= 65) {
    if (a.memo.lecture !== true) {
      a.memo.lecture = true;
      h.standing('kitchen', -2);
    }
    return said(a.name, 'Look at the state of you, love. Go and sit in the sauna and drink some water. I am not enabling this.', 'bad');
  }
  const opts: DialogueOption[] = [];
  const deliver = s.quests.find((q) => q.kind === 'deliver' && q.target === a.name && !q.done);
  if (deliver !== undefined && (s.consumables.laptop ?? 0) > 0) {
    opts.push({ label: 'Here is your new laptop.', pick: () => {
      h.deliverLaptop(a);
      return said(a.name, 'Ooh, a new laptop! You are a treasure. Have a biscuit.', 'good');
    } });
  }
  if (s.actionItems > 0) {
    opts.push({ label: `Could you minute my ${s.actionItems} action item${s.actionItems > 1 ? 's' : ''}?`, pick: () => {
      const n = h.clearActionItems(a.name);
      h.standing('kitchen', -1);
      return said(a.name, `Give those here, love. I will minute all ${n}. You owe me one.`, 'good');
    } });
  }
  if (!a.giftGiven) {
    opts.push({ label: 'Is there any cake going?', pick: () => {
      a.giftGiven = true;
      const gift = k >= 25 || fx.chance(0.4) ? 'cake' : 'biscuits';
      h.giveItem(gift, 1, a.name);
      h.healPlayer(20, a.name);
      return said(a.name, gift === 'cake' ? 'There is cake left from Jean\'s do. Take a big slice, you are wasting away.' : 'Here, the good biscuits. Do not tell Maureen.', 'good');
    } });
  }
  opts.push({ label: 'What is the gossip?', pick: () => said(a.name, gossip(h), 'neutral') });
  if (s.dependency >= 45 && a.memo.advice !== true) {
    opts.push({ label: 'Do you think I drink too much?', pick: () => {
      a.memo.advice = true;
      h.standing('kitchen', 2);
      return said(a.name, 'Since you ask, pet: yes. My Keith was the same. Sauna, water, early nights. Come and see me if the shakes start.', 'neutral');
    } });
  }
  if (s.caffeine >= 300 && a.memo.caffeine !== true) {
    opts.push({ label: 'Why is my hand shaking?', pick: () => {
      a.memo.caffeine = true;
      return said(a.name, 'How many of those Battery things have you had? Give it here. Have a cup of camomile and sit down for five minutes.', 'neutral');
    } });
  }
  opts.push({ label: 'Thanks. Back to it.', pick: () => {
    if (a.memo.tea !== true) {
      a.memo.tea = true;
      h.healPlayer(6, a.name);
    }
    return null;
  } });
  return { speaker: a.name, subtitle: 'The Kitchen Cabinet', text: k >= 25 ? 'There you are! Sit down, you look shattered. Tea?' : 'Hello love. Busy day?', options: opts, mood: 'good' };
}

function gossip(h: StoryHost): string {
  const f = h.save.flags;
  const lines: string[] = [];
  if (f.coverup === true) lines.push('Marcus has been ever so cheerful since his backup thing went away. Funny, that.');
  if (f.adminGiven === true) lines.push('Tristan from Sales has installed a "free" screensaver on every machine in his team. I am sure it is fine.');
  if (f.mfaSkipped === true) lines.push('The CFO says he never lost his phone. So who was that on the line?');
  if (h.save.findings > 0) lines.push(`I hear the Auditor has ${h.save.findings} finding${h.save.findings > 1 ? 's' : ''} with your name near them. Tidy up, love.`);
  if (h.save.warnings > 0) lines.push(`HR have you on ${h.save.warnings} warning${h.save.warnings > 1 ? 's' : ''}. Three and it is a hearing.`);
  if (h.evidence() > 0) lines.push('Whatever you are carrying about in that folder, keep it somewhere safe. People are asking about "Phoenix".');
  lines.push('Derek books meetings about meetings. If you accept one, he goes away.');
  lines.push('There is a sauna on most floors if you know where to look. The little man in it knows old magic.');
  lines.push('Never take anything from the fridge in front of anybody. Especially not Jukka\'s lonkero.');
  lines.push('Those consultants cost more a day than I earn a month. Hit the one with the laptop first; the others hide behind him.');
  return fx.pick(lines);
}

export function talkHelper(h: StoryHost, a: Actor): DialogueNode {
  const note = h.teamNote(a);
  const treats = h.treatOptions(a);
  if (a.recruited) {
    // "Carry on" first: a quick 1 should never give away somebody's White Monster.
    return { speaker: a.name, subtitle: note, text: a.morale < 35 ? 'Yeah? ...Sorry. Long day.' : 'Yeah?', options: [
      { label: 'Carry on.', leave: true, pick: () => null },
      ...treats,
      // They stay on the floor: colleagues, not summons.
      { label: 'Wait here. I have got this.', pick: () => { a.recruited = false; return said(a.name, 'Suit yourself. I will be here.', 'neutral'); } },
    ] };
  }
  const it = h.save.standing.itcrowd;
  if (it <= -30) return said(a.name, 'You are the one who keeps raising P1s for password resets. I am on lunch. Forever.', 'bad');
  const tired = h.tooTired(a);
  const text = tired ? 'Honestly? I am running on empty. I cannot face another user right now. Unless... you have not got anything sweet, have you?'
    : a.role === 'intern' ? 'Is there anything I can do? Anything at all? Please?' : 'Need backup?';
  return { speaker: a.name, subtitle: note === '' ? 'The IT Crowd' : `The IT Crowd · ${note}`, text, options: [
    { label: 'Come with me.', ...(tired ? { tag: 'Morale too low', disabled: true } : {}), pick: () => {
      a.recruited = true;
      h.tip('team');
      if (a.memo.joined !== true) {
        a.memo.joined = true;
        h.standing('itcrowd', 1);
      }
      return said(a.name, a.role === 'intern' ? 'Yes! I will follow you everywhere!' : a.role === 'security' ? 'Right behind you. Badges out.' : 'Fine. But I am not doing printers.', 'good');
    } },
    ...treats,
    { label: 'Not now.', leave: true, pick: () => null },
  ] };
}

export function talkTonttu(h: StoryHost, a: Actor): DialogueNode {
  const s = h.save;
  const opts: DialogueOption[] = [];
  const discount = h.runeDiscount();
  for (const sp of SPELLS) {
    if (s.spells.includes(sp.id)) continue;
    const skill = s.skills.runecraft.value;
    const price = Math.round(sp.price * discount);
    const blocked = skill < sp.minSkill || s.rep < price;
    opts.push({
      label: `Teach me ${sp.name} (${sp.english}) - ${sp.desc}`,
      tag: skill < sp.minSkill ? `needs Mökki Magic ${sp.minSkill}` : `₡${price}`,
      disabled: blocked,
      pick: () => {
        h.addRep(-price);
        h.learnSpell(sp.id);
        return talkTonttu(h, a);
      },
    });
  }
  const trainCost = Math.round((20 + s.skills.runecraft.value * 3) * discount);
  const maxed = s.skills.runecraft.value >= 100;
  opts.push({ label: maxed ? 'Train my Mökki Magic (you know all there is).' : 'Train my Mökki Magic.', tag: maxed ? 'Mastered' : `₡${trainCost}`, disabled: maxed || s.rep < trainCost, pick: () => {
    h.addRep(-trainCost);
    h.trainSkill('runecraft');
    return talkTonttu(h, a);
  } });
  opts.push({ label: 'Heippa. (Leave)', leave: true, pick: () => null });
  return {
    speaker: 'Saunatonttu',
    subtitle: 'The sauna elf',
    mood: 'mystic',
    text: 'Löylyä, löylyä! You smell of fluorescent light and printer toner. Sit. The old runes are not free, but they are cheaper than therapy.',
    options: opts,
  };
}

// ---------------------------------------------------------------- the floor's story

export interface StoryNpc {
  readonly id: string;
  readonly name: string;
}

export function storyNpcFor(floor: number): StoryNpc {
  switch (floor % 5) {
    case 0: return floor >= 5 ? { id: 'jukka', name: 'Jukka from Finance' } : { id: 'marcus', name: 'Marcus from Sales' };
    case 1: return { id: 'cfo', name: '"The CFO" (on the phone)' };
    case 2: return { id: 'tristan', name: 'Tristan, Sales Director' };
    case 3: return { id: 'derek', name: 'Derek (Audit Liaison)' };
    default: return floor >= 5 ? { id: 'jukka', name: 'Jukka from Finance' } : { id: 'pa', name: 'Sir Reginald\'s PA' };
  }
}

export function talkStory(h: StoryHost, a: Actor): DialogueNode {
  // The flag that stops a story repeating is set the moment a choice is made,
  // so a save taken straight afterwards already has it.
  const done = (text: string, mood: DialogueNode['mood'] = 'neutral'): DialogueNode => {
    a.talked = true;
    h.flag(`story_${a.npcId ?? ''}_${h.floor}`);
    return said(a.name, text, mood);
  };
  if (a.talked) return said(a.name, 'We have said what needed saying.', 'neutral');
  switch (a.npcId) {
    case 'marcus':
      return {
        speaker: a.name, subtitle: 'A favour', text: 'Look. The backup light went red because I... may have stopped the backup agent. At 09:07. To make my spreadsheet faster. Can we keep this between us? I have a lonkero in my drawer with your name on it.',
        options: [
          { label: 'Your secret is safe with me.', pick: () => { h.standing('staff', 6); h.flag('coverup'); h.finding(1, 'You covered for Marcus stopping the backups.'); h.giveItem('lonkero', 1, a.name); h.journal('I covered for Marcus, who stopped the backups to speed up a spreadsheet. The Auditor will not see it that way.'); return done('Legend. Absolute legend. This never happened.', 'good'); } },
          { label: 'I have to log it properly, Marcus.', pick: () => { h.standing('management', 6); h.standing('staff', -4); h.addRep(30); h.flag('reportedMarcus'); h.journal('I logged Marcus stopping the backup agent. Management were pleased. Marcus was not.'); return done('Wow. OK. Thanks for nothing.', 'bad'); } },
          checkOption(h, 'Let us fix it together - and you write the incident note yourself.', 'soft', 'charm', 30,
            () => { h.standing('staff', 4); h.standing('management', 3); h.addRep(20); h.flag('marcusLearned'); h.journal('Marcus fixed his own backup and wrote his own incident note. Growth.'); return done('...Fine. That is actually fair. Show me the button.', 'good'); },
            () => { h.standing('staff', -2); return done('You sound like my mum. Forget I said anything.', 'bad'); }),
        ],
      };
    case 'cfo':
      return {
        speaker: a.name, subtitle: 'Urgent call', text: 'This is the CFO. I have lost my phone, I am boarding in four minutes, enrol my new authenticator on my account NOW. Do you know who I am?',
        options: [
          { label: 'Of course, sir. Done.', pick: () => { h.addRep(50); h.standing('management', 3); h.flag('mfaSkipped'); h.finding(1, 'You enrolled an authenticator without verifying the caller.'); h.journal('I enrolled a new authenticator for "the CFO" without checking who he was. It went very quiet afterwards.'); return done('Excellent. You will go far. *click*', 'neutral'); } },
          checkOption(h, 'I will call you back on the number in the directory.', 'security', 'tech', 25,
            () => { h.addRep(40); h.standing('itcrowd', 8); h.standing('management', 5); h.flag('caughtPhish'); h.journal('The "CFO" on the phone was a scammer. The real CFO was asleep. I stopped a breach before breakfast.'); return done('...*click*. (The real CFO, woken up, sends you a thank-you email at 3am.)', 'good'); },
            () => { h.standing('management', -5); h.journal('I tried to verify the CFO and got the process wrong. He was real, and furious, but at least nothing was breached.'); return done('That WAS me, you idiot. I will remember this.', 'bad'); }),
          { label: 'Please raise a ticket through the portal.', pick: () => { h.standing('management', -3); return done('A TICKET? From an airport? *click*', 'bad'); } },
        ],
      };
    case 'tristan': {
      const opts: DialogueOption[] = [
        { label: 'Fine. Local admin, just for the demo.', pick: () => { h.addRep(80); h.standing('management', 5); h.flag('adminGiven'); h.finding(1, 'You handed out local admin rights to Sales.'); h.journal('I gave Tristan admin rights "just for the demo". He has already installed three screensavers.'); return done('You are a legend. I will mention you in the all-hands.', 'good'); } },
        checkOption(h, 'I cannot do admin, but I can install the demo software for you.', 'soft', 'charm', 40,
          () => { h.standing('management', 2); h.standing('itcrowd', 5); h.journal('I talked Tristan out of admin rights and installed his demo myself. Everybody won.'); return done('Oh. That works too. Cheers.', 'good'); },
          () => { h.standing('management', -6); return done('I am going over your head. Way over.', 'bad'); }),
        { label: 'No. Company policy.', pick: () => { h.standing('management', -4); h.standing('itcrowd', 6); return done('Policy. Right. We will see about policy.', 'bad'); } },
      ];
      if (h.save.bac >= 42) {
        opts.push({ label: 'Tristan... mate... what if I had admin rights. On everything.', tag: 'Drunk', pick: () => { h.warn('You tried to give yourself domain admin while merry'); return done('Are you... drunk? I am telling Derek. Actually I am telling everyone.', 'bad'); } });
      }
      return { speaker: a.name, subtitle: 'A favour', text: 'I need local admin rights on my laptop. Just for the big demo. Just for today. You would be doing the whole company a favour.', options: opts };
    }
    case 'derek': {
      const opts: DialogueOption[] = [
        checkOption(h, 'Tidy the access logs before the Auditor sees them.', 'security', 'tech', 50,
          () => { h.flag('doctored'); h.clearFindings(); h.journal('I doctored the access logs. The Auditor will find nothing. I will know.'); return done('Clean as a whistle. We never spoke.', 'neutral'); },
          () => { h.finding(2, 'Log tampering, badly done.'); h.warn('Caught tampering with audit logs'); return done('You... left an edit history. On the audit log. We are finished.', 'bad'); }),
        { label: 'We tell the Auditor the truth.', pick: () => { h.standing('staff', 3); h.journal('I will face the Auditor honestly, with whatever findings I have earned.'); return done('Your funeral. Well, both of ours.', 'neutral'); } },
        { label: 'Blame it all on Derek.', pick: () => { h.standing('management', 5); h.standing('staff', -5); h.flag('blamedDerek'); h.journal('I pinned the findings on Derek. He did not take it well.'); a.talked = true; h.flag(`story_derek_${h.floor}`); h.spawnHostile('manager', 1, 'Derek (bitter)'); return said(a.name, 'You WHAT? Right. RIGHT.', 'bad'); } },
      ];
      if (h.save.findings >= 2) {
        opts.push({ label: 'Hand the Auditor everything - including management\'s mess.', tag: 'Whistleblow', pick: () => { h.flag('whistleblower'); h.clearFindings(); h.standing('management', -20); h.standing('staff', 10); h.journal('I gave the Auditor the whole story. Management will never forgive me. The Auditor might even be on my side.'); return done('You would burn it all down? ...Huh. Respect.', 'mystic'); } });
      }
      return { speaker: a.name, subtitle: 'An offer', text: `The Auditor is asking for access logs. Between you and me, there are ${h.save.findings} thing${h.save.findings === 1 ? '' : 's'} in there with your name on. We could... tidy them.`, options: opts };
    }
    case 'pa': {
      const ev = h.evidence();
      const opts: DialogueOption[] = [];
      // Whatever you choose here, the PA is done with you.
      const settle = (): void => {
        a.talked = true;
        h.flag(`story_${a.npcId ?? ''}_${h.floor}`);
      };
      if (ev >= MAIN_ENDING_EVIDENCE) {
        opts.push({ label: 'Tell him I have the Phoenix file. All of it. And I am sending it to the regulator.', tag: `Evidence ${ev}/4`, pick: () => { settle(); h.bossDeal('expose'); return null; } });
        opts.push({ label: 'Tell him I have the Phoenix file, and I have a number in mind.', tag: `Evidence ${ev}/4`, pick: () => { settle(); h.bossDeal('parachute'); return null; } });
      }
      opts.push({ label: 'Sign the NDA.', tag: 'Ends your story', pick: () => { settle(); h.bossDeal('nda'); return null; } });
      opts.push(checkOption(h, 'Make it the mökki money, and he gets his quiet.', 'soft', 'charm', 60 - ev * 5,
        () => { h.bossDeal('mokki'); return done('He... agrees. He is counting it now. He will be distracted when you go in.', 'good'); },
        () => done('He laughed. He is still laughing. You should go in.', 'bad')));
      opts.push({ label: 'I will see him now.', pick: () => done('Your funeral. Mind the carpet.', 'neutral') });
      return {
        speaker: a.name, subtitle: 'The Executive Suite',
        text: ev > 0
          ? 'Sir Reginald would prefer to avoid a scene. He knows you have been asking about Phoenix. He is offering a Principal title, a parking space and a very long NDA.'
          : 'Sir Reginald would prefer to avoid a scene. He is offering a Principal title, a parking space and a very long NDA. Or you can go in there.',
        options: opts,
      };
    }
    default:
      return {
        speaker: a.name, subtitle: 'Perjantaipullo', text: 'It is Friday somewhere. I have a bottle of Koskenkorva in my drawer and nobody to share it with. One shot? For morale?',
        options: [
          { label: 'Kippis! (take the shot)', pick: () => { h.giveItem('kossu', 1, a.name); h.standing('staff', 5); return done('Kippis! Now you are one of us.', 'good'); } },
          { label: 'Not at work, Jukka.', pick: () => { h.standing('management', 2); return done('Your loss. More for me.', 'neutral'); } },
        ],
      };
  }
}

/** The Auditor, when you arrive holding the Phoenix file. */
export function talkAuditor(h: StoryHost, a: Actor): DialogueNode {
  const ev = h.evidence();
  return {
    speaker: a.name, subtitle: 'External, Big Four', mood: 'mystic',
    text: `You are carrying ${ev} documents with "PHOENIX" on them. I have been trying to get those for eleven months. What do you want for them?`,
    options: [
      { label: 'Nothing. Just do your job.', tag: 'Resolve the audit peacefully', pick: () => { h.auditorParley('ally'); return said(a.name, 'In twenty years of audits, nobody has ever said that to me. The findings against you are... immaterial. Go and finish this.', 'good'); } },
      { label: 'Actually, I would rather settle this the old way.', pick: () => { h.auditorParley('fight'); return said(a.name, 'Suit yourself. I bill for this too.', 'bad', 'Brace yourself'); } },
    ],
  };
}

// ---------------------------------------------------------------- HR

export function disciplinary(h: StoryHost): DialogueNode {
  const s = h.save;
  const fine = 120 + s.rung * 45;
  return {
    speaker: 'Jackie from HR', subtitle: 'Disciplinary hearing', mood: 'bad',
    text: `Three warnings. ${s.name}, this is a formal hearing. We can do this the easy way (a step down the ladder), the expensive way, or you can try to explain yourself.`,
    options: [
      { label: s.rung > 0 ? `Accept a demotion to ${titleFor(s.rung - 1, s.domain, s.track, s.arch)}.` : 'Accept the consequences.', pick: () => {
        if (s.rung > 0) {
          h.demote();
          return said('Jackie from HR', 'Noted. Clean slate. Please do not make me do this again.', 'neutral');
        }
        h.fireFromJob();
        return null;
      } },
      { label: 'Pay for the wellbeing course out of my own pocket.', tag: `₡${fine}`, disabled: s.rep < fine, pick: () => {
        h.addRep(-fine);
        s.warnings = 0;
        h.journal('I paid my way out of a disciplinary. The wellbeing course had a lot of breathing in it.');
        return said('Jackie from HR', 'Payment received. Warnings cleared. Breathe in for four.', 'neutral');
      } },
      checkOption(h, 'Explain. At length. With context.', 'soft', 'charm', 45,
        () => { s.warnings = 1; h.journal('I talked my way out of a disciplinary hearing.'); return said('Jackie from HR', 'Fine. One warning stays on file. Out.', 'good'); },
        () => { h.standing('management', -10); if (s.rung > 0) h.demote(); else { h.fireFromJob(); return null; } return said('Jackie from HR', 'That made it worse. Demotion stands, and I am telling your manager about the tone.', 'bad'); }),
    ],
  };
}

export function performanceReview(h: StoryHost): DialogueNode {
  const s = h.save;
  const next = s.rung + 1;
  if (next >= RUNG_COUNT) return said('Derek (on the phone)', 'You are a Senior Architect. There is nowhere left to promote you to. Enjoy the sauna.', 'good', 'Hang up');
  const needs = promotionNeeds(next);
  const lacks: string[] = [];
  if (s.standing.management < needs.management) lacks.push(`Management standing ${Math.round(s.standing.management)}/${needs.management}`);
  if (skillSum(s) < needs.skillSum) lacks.push(`top-4 skills ${skillSum(s)}/${needs.skillSum}`);
  if (s.level < needs.level) lacks.push(`level ${s.level}/${needs.level}`);
  if (lacks.length > 0) {
    return said('Derek (on the phone)', `Friday evening review. Not this time, I am afraid: ${lacks.join(', ')}. Have a lovely weekend. Do not check your email. (Check your email.)`, 'neutral', 'Hang up');
  }
  if (next === BRANCH_RUNG && (s.domain === null || s.track === null)) {
    return {
      speaker: 'Derek (on the phone)', subtitle: 'Performance review', mood: 'good',
      text: 'Good news: we want to move you off the helpdesk. Where do you want to specialise?',
      options: [
        ...DOMAINS.map((d): DialogueOption => ({ label: `${d}: ${DOMAIN_INFO[d].ability} - ${DOMAIN_INFO[d].desc}`, tag: d, pick: () => chooseTrack(h, d) })),
        { label: 'Actually, I am happy where I am.', pick: () => { h.journal('I turned down a move off the helpdesk. Better the devil you know.'); return said('Derek (on the phone)', 'Your call. Offer stands next weekend.', 'neutral', 'Hang up'); } },
      ],
    };
  }
  if (next === ARCH_RUNG && s.arch === null) {
    return {
      speaker: 'Derek (on the phone)', subtitle: 'Performance review', mood: 'good',
      text: 'The Architecture Board want you. They asked me what kind of architect you are. I said I would ask.',
      options: [
        ...(['solutions', 'enterprise', 'domain'] as const).map((p): DialogueOption => ({
          label: `${ARCH_INFO[p].name(s.domain ?? 'Systems')} - ${ARCH_INFO[p].desc}`,
          pick: () => { h.promote(null, null, p); return said('Derek (on the phone)', `Congratulations, ${titleFor(ARCH_RUNG, s.domain, s.track, p)}. I have no idea what you do now.`, 'good', 'Hang up'); },
        })),
        { label: 'Not yet. I still like touching servers.', pick: () => said('Derek (on the phone)', 'Your call. The Board meets every Friday. Unfortunately.', 'neutral', 'Hang up') },
      ],
    };
  }
  const t = titleFor(next, s.domain, s.track, s.arch);
  return {
    speaker: 'Derek (on the phone)', subtitle: 'Performance review', mood: 'good',
    text: `Friday evening, sorry. We are offering you ${t}. More money (₡${salaryFor(next)} a week), more responsibility, and the building will take you more seriously. Much more seriously.`,
    options: [
      { label: `Accept: ${t}.`, tag: 'Harder difficulty', pick: () => { h.promote(null, null, null); return said('Derek (on the phone)', `Congratulations, ${t}. The users have already been told.`, 'good', 'Hang up'); } },
      { label: 'Decline. I like my weekends.', pick: () => { h.journal(`I turned down ${t}. The lake does not care about job titles.`); return said('Derek (on the phone)', 'Your call. Offer stands next weekend.', 'neutral', 'Hang up'); } },
    ],
  };
}

function chooseTrack(h: StoryHost, d: Domain): DialogueNode {
  return {
    speaker: 'Derek (on the phone)', subtitle: `${d}`, mood: 'good',
    text: `${d}. Good choice. And do you want to keep things running, or build new things?`,
    options: (['specialist', 'engineer'] as const).map((t): DialogueOption => ({
      label: `${titleFor(BRANCH_RUNG, d, t)} - ${TRACK_INFO[t].desc}`,
      pick: () => { h.promote(d, t, null); return said('Derek (on the phone)', `Congratulations, ${titleFor(BRANCH_RUNG, d, t)}.`, 'good', 'Hang up'); },
    })),
  };
}

// ---------------------------------------------------------------- level-up

export function levelUpNode(h: StoryHost, first: Attribute | null = null): DialogueNode {
  const s = h.save;
  return {
    speaker: 'You rest and meditate on what you have learned',
    subtitle: `Level ${s.level + 1}`,
    mood: 'mystic',
    text: first === null ? 'Choose the first attribute to improve. (Patience always rises by one on its own.)' : `${ATTRIBUTE_INFO[first].name} it is. Choose a second.`,
    options: ATTRIBUTES.filter((a) => a !== first).map((a): DialogueOption => {
      const gain = attributeMultiplier(s.attrUps[a]) + (a === 'patience' ? PATIENCE_BONUS : 0);
      return {
        label: `${ATTRIBUTE_INFO[a].name} ${s.attrs[a]} → ${Math.min(100, s.attrs[a] + gain)} - ${ATTRIBUTE_INFO[a].desc}`,
        tag: `×${attributeMultiplier(s.attrUps[a])}`,
        pick: () => {
          if (first === null) return levelUpNode(h, a);
          h.applyLevelUp(first, a);
          return said('Level up', `You are now level ${s.level}. A perk point waits in your backpack (Tab).`, 'mystic', 'Wake up');
        },
      };
    }),
  };
}
