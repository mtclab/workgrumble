import type { DialogueNode, DialogueOption } from './dialogue';
import { said } from './dialogue';
import type { Actor } from './entities';
import { SPELLS } from './magic';
import {
  type Attribute,
  ATTRIBUTE_INFO,
  ATTRIBUTES,
  attributeMultiplier,
  BRANCH_RUNG,
  checkChance,
  type Domain,
  DOMAIN_INFO,
  DOMAINS,
  type Faction,
  promotionNeeds,
  RUNG_COUNT,
  salaryFor,
  type Skill,
  titleFor,
  type Track,
  TRACK_INFO,
} from './rpg';
import { fx } from './rng';
import { type SaveState, skillSum } from './state';

/** What the conversations are allowed to do to the world. Game implements it. */
export interface StoryHost {
  readonly save: SaveState;
  readonly floor: number;
  /** Odds for a check, before rolling. */
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
  warn(why: string): void;
  resolvePeacefully(a: Actor, how: 'fix' | 'ticket' | 'scared' | 'charmed' | 'meeting' | 'bribe'): void;
  enrage(a: Actor): void;
  rootPlayer(seconds: number, reason: string): void;
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
  promote(domain: Domain | null, track: Track | null): void;
  demote(): void;
  fireFromJob(): void;
  spawnHostile(kind: 'user' | 'manager' | 'reply' | 'customer', n: number, name?: string): void;
  deliverLaptop(a: Actor): boolean;
  bossDeal(kind: 'nda' | 'mokki'): void;
  applyLevelUp(first: Attribute, second: Attribute): void;
  bandPersuade(): number;
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
  const skillName = { hardware: 'Hardware', scripting: 'Scripting', troubleshooting: 'Troubleshooting', soft: 'Soft Skills', sisu: 'Sisu', stealth: 'Stealth', security: 'Security', drinking: 'Drinking', runecraft: 'Mökki Magic', athletics: 'Athletics' }[skill];
  const d = difficulty - h.bandPersuade();
  return {
    label,
    tag: `${skillName} ${pct(h.odds(skill, attr, d))}`,
    pick: () => (h.check(skill, attr, d) ? ok() : fail()),
  };
}

// ---------------------------------------------------------------- hostile people

export function talkHostile(h: StoryHost, a: Actor): DialogueNode {
  const title = h.ticketTitle(a);
  const customer = a.kind === 'customer';
  const hard = (customer ? 15 : 0) + h.floor * 4;
  const opts: DialogueOption[] = [
    checkOption(h, `Walk them through it: "${h.ticketFix(a)}"`, 'troubleshooting', 'tech', 25 + hard,
      () => { h.resolvePeacefully(a, 'fix'); return said(a.name, 'Oh! Oh, that was it. Thank you. I feel slightly stupid.', 'good'); },
      () => { h.enrage(a); return said(a.name, 'I ALREADY DID THAT. Twice. Are you even listening?', 'bad', 'Brace yourself'); }),
    checkOption(h, 'Could you raise a ticket for that, please?', 'soft', 'charm', 20 + hard,
      () => { h.enqueueTicket(a, customer); h.resolvePeacefully(a, 'ticket'); return said(a.name, 'Fine. FINE. I will raise a ticket. Priority: urgent.', 'neutral'); },
      () => { h.enrage(a); return said(a.name, 'A TICKET? I have been waiting since MONDAY.', 'bad', 'Brace yourself'); }),
    checkOption(h, 'Do you know what sudo means? Walk away.', 'hardware', 'grit', 35 + hard,
      () => { h.resolvePeacefully(a, 'scared'); h.standing('staff', -3); h.standing('management', 1); return said(a.name, '...I will come back later. Maybe next year.', 'neutral'); },
      () => { h.enrage(a); h.standing('staff', -2); return said(a.name, 'Are you THREATENING me? I am telling HR. After I deal with you.', 'bad', 'Brace yourself'); }),
  ];
  if ((h.save.consumables.biscuits ?? 0) > 0) {
    opts.push({ label: 'Offer them a chocolate digestive.', tag: 'Biscuit', pick: () => {
      h.save.consumables.biscuits = (h.save.consumables.biscuits ?? 1) - 1;
      h.standing('kitchen', 1);
      h.resolvePeacefully(a, 'bribe');
      return said(a.name, 'Oh, the GOOD ones. Do you know, it can wait. Thank you.', 'good');
    } });
  }
  if (customer && h.save.rep >= 30) {
    opts.push({ label: 'Offer a service credit on the account.', tag: '₡30', pick: () => {
      h.addRep(-30);
      h.resolvePeacefully(a, 'bribe');
      return said(a.name, 'A credit. Well. That is the least you could do. I will allow it.', 'neutral');
    } });
  }
  if (h.save.bac >= 42) {
    opts.push({ label: 'Hey. Hey. I love you, man. Let\'s get a kebab.', tag: 'Drunk', pick: () => {
      if (fx.chance(0.5)) {
        h.resolvePeacefully(a, 'charmed');
        return said(a.name, '...You know what? I could eat. Let us forget the printer.', 'good');
      }
      h.warn(`${a.name} reported you to HR for smelling of Koskenkorva`);
      return said(a.name, 'Are you DRUNK? At WORK? I am reporting this.', 'bad');
    } });
  }
  opts.push({ label: 'Fine. We do this the hard way.', pick: () => null });
  return {
    speaker: a.name,
    subtitle: customer ? 'Gold-tier customer' : 'End user',
    text: `"${title}" - and they want it fixed now, in person, by you.`,
    options: opts,
  };
}

export function talkManager(h: StoryHost, a: Actor): DialogueNode {
  const subjects = ['Alignment on alignment', 'Quick sync re: the sync', 'Stand-up (seated)', 'Lessons learned: lessons', 'KPI deep dive'];
  const subject = fx.pick(subjects);
  const helper = h.recruitedHelper();
  const opts: DialogueOption[] = [
    { label: `Accept the meeting: "${subject}".`, tag: '4s rooted', pick: () => {
      h.rootPlayer(4, `In a meeting: "${subject}"`);
      h.standing('management', 3);
      h.resolvePeacefully(a, 'meeting');
      return said(a.name, 'Great sync. Really valuable. I will send the notes. Nobody will read them.', 'good');
    } },
    checkOption(h, 'I am on a P1 right now, can we async this?', 'soft', 'charm', 35 + h.floor * 4,
      () => { h.resolvePeacefully(a, 'meeting'); return said(a.name, 'Of course, of course. Drop me a Teams message. Or three.', 'neutral'); },
      () => { h.rootPlayer(2, 'Cornered'); h.addActionItem(a.name); return said(a.name, 'Everything is a P1 with you people. Here, take an action item.', 'bad'); }),
  ];
  if (helper !== null) {
    opts.push({ label: `Delegate it to ${helper.name}.`, tag: 'Lose your helper', pick: () => {
      h.dismiss(helper);
      h.standing('itcrowd', -3);
      h.resolvePeacefully(a, 'meeting');
      return said(a.name, `Ah, ${helper.name}. Perfect. Walk with me.`, 'neutral');
    } });
  }
  opts.push(checkOption(h, 'While I have you: about my promotion...', 'soft', 'charm', 45 + h.save.rung * 5,
    () => { h.standing('management', 5); return said(a.name, 'You know, I have been meaning to put your name forward. Leave it with me.', 'good', 'Fight them anyway'); },
    () => { h.standing('management', -3); return said(a.name, 'Let us revisit that next quarter. And the one after.', 'bad', 'Brace yourself'); }));
  opts.push({ label: 'No.', pick: () => null });
  return { speaker: a.name, subtitle: 'Management', text: 'Got a sec? I have put fifteen minutes in your calendar. It is now.', options: opts };
}

// ---------------------------------------------------------------- friends

export function talkHealer(h: StoryHost, a: Actor): DialogueNode {
  const s = h.save;
  const k = s.standing.kitchen;
  if (k <= -40) return said(a.name, 'Oh, it is you. No, I will not put the kettle on. Not after the fridge.', 'bad');
  if (s.bac >= 65) {
    h.standing('kitchen', -2);
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
  if (s.dependency >= 45) {
    opts.push({ label: 'Do you think I drink too much?', pick: () => {
      h.standing('kitchen', 2);
      return said(a.name, 'Since you ask, pet: yes. My Keith was the same. Sauna, water, early nights. Come and see me if the shakes start.', 'neutral');
    } });
  }
  opts.push({ label: 'Thanks. Back to it.', pick: () => { h.healPlayer(6, a.name); return null; } });
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
  lines.push('Derek books meetings about meetings. If you accept one, he goes away.');
  lines.push('There is a sauna on most floors if you know where to look. The little man in it knows old magic.');
  lines.push('Never take anything from the fridge in front of anybody. Especially not Jukka\'s lonkero.');
  return fx.pick(lines.slice(0, Math.max(3, lines.length - 1)));
}

export function talkHelper(h: StoryHost, a: Actor): DialogueNode {
  if (a.recruited) {
    return { speaker: a.name, text: 'Yeah?', options: [
      { label: 'Head back. I have got this.', pick: () => { h.dismiss(a); return said(a.name, 'Suit yourself.', 'neutral'); } },
      { label: 'Carry on.', pick: () => null },
    ] };
  }
  const it = h.save.standing.itcrowd;
  if (it <= -30) return said(a.name, 'You are the one who keeps raising P1s for password resets. I am on lunch. Forever.', 'bad');
  return { speaker: a.name, subtitle: 'The IT Crowd', text: a.role === 'intern' ? 'Is there anything I can do? Anything at all? Please?' : 'Need backup?', options: [
    { label: 'Come with me.', pick: () => {
      a.recruited = true;
      h.standing('itcrowd', 1);
      return said(a.name, a.role === 'intern' ? 'Yes! I will follow you everywhere!' : a.role === 'security' ? 'Right behind you. Badges out.' : 'Fine. But I am not doing printers.', 'good');
    } },
    { label: 'Not now.', pick: () => null },
  ] };
}

export function talkTonttu(h: StoryHost, a: Actor): DialogueNode {
  const s = h.save;
  const opts: DialogueOption[] = [];
  for (const sp of SPELLS) {
    if (s.spells.includes(sp.id)) continue;
    const skill = s.skills.runecraft.value;
    const blocked = skill < sp.minSkill || s.rep < sp.price;
    opts.push({
      label: `Teach me ${sp.name} (${sp.english}) - ${sp.desc}`,
      tag: skill < sp.minSkill ? `needs Mökki Magic ${sp.minSkill}` : `₡${sp.price}`,
      disabled: blocked,
      pick: () => {
        h.addRep(-sp.price);
        h.learnSpell(sp.id);
        return talkTonttu(h, a);
      },
    });
  }
  const trainCost = 20 + s.skills.runecraft.value * 3;
  opts.push({ label: 'Train my Mökki Magic.', tag: `₡${trainCost}`, disabled: s.rep < trainCost, pick: () => {
    h.addRep(-trainCost);
    h.trainSkill('runecraft');
    return talkTonttu(h, a);
  } });
  opts.push({ label: 'Heippa. (Leave)', pick: () => null });
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
    case 0: return { id: 'marcus', name: 'Marcus from Sales' };
    case 1: return { id: 'cfo', name: '"The CFO" (on the phone)' };
    case 2: return { id: 'tristan', name: 'Tristan, Sales Director' };
    case 3: return { id: 'derek', name: 'Derek (Audit Liaison)' };
    default: return floor >= 5 ? { id: 'jukka', name: 'Jukka from Finance' } : { id: 'pa', name: 'Sir Reginald\'s PA' };
  }
}

export function talkStory(h: StoryHost, a: Actor): DialogueNode {
  const done = (text: string, mood: DialogueNode['mood'] = 'neutral'): DialogueNode => {
    a.talked = true;
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
          () => { h.flag('doctored'); h.save.findings = 0; h.journal('I doctored the access logs. The Auditor will find nothing. I will know.'); return done('Clean as a whistle. We never spoke.', 'neutral'); },
          () => { h.finding(2, 'Log tampering, badly done.'); h.warn('Caught tampering with audit logs'); return done('You... left an edit history. On the audit log. We are finished.', 'bad'); }),
        { label: 'We tell the Auditor the truth.', pick: () => { h.standing('staff', 3); h.journal('I will face the Auditor honestly, with whatever findings I have earned.'); return done('Your funeral. Well, both of ours.', 'neutral'); } },
        { label: 'Blame it all on Derek.', pick: () => { h.standing('management', 5); h.standing('staff', -5); h.flag('blamedDerek'); h.journal('I pinned the findings on Derek. He did not take it well.'); a.talked = true; h.spawnHostile('manager', 1, 'Derek (bitter)'); return said(a.name, 'You WHAT? Right. RIGHT.', 'bad'); } },
      ];
      if (h.save.findings >= 2) {
        opts.push({ label: 'Hand the Auditor everything - including management\'s mess.', tag: 'Whistleblow', pick: () => { h.flag('whistleblower'); h.save.findings = 0; h.standing('management', -20); h.standing('staff', 10); h.journal('I gave the Auditor the whole story. Management will never forgive me. The Auditor might even be on my side.'); return done('You would burn it all down? ...Huh. Respect.', 'mystic'); } });
      }
      return { speaker: a.name, subtitle: 'An offer', text: `The Auditor is asking for access logs. Between you and me, there are ${h.save.findings} thing${h.save.findings === 1 ? '' : 's'} in there with your name on. We could... tidy them.`, options: opts };
    }
    case 'pa':
      return {
        speaker: a.name, subtitle: 'The Executive Suite', text: 'Sir Reginald would prefer to avoid a scene. He is offering a Principal title, a parking space and a very long NDA. Or you can go in there.',
        options: [
          { label: 'Sign the NDA.', tag: 'Ends your story', pick: () => { h.bossDeal('nda'); return null; } },
          checkOption(h, 'Make it the mökki money, and he gets his quiet.', 'soft', 'charm', 60,
            () => { h.bossDeal('mokki'); return done('He... agrees. He is counting it now. He will be distracted when you go in.', 'good'); },
            () => done('He laughed. He is still laughing. You should go in.', 'bad')),
          { label: 'I will see him now.', pick: () => done('Your funeral. Mind the carpet.', 'neutral') },
        ],
      };
    default:
      return {
        speaker: a.name, subtitle: 'Perjantaipullo', text: 'It is Friday somewhere. I have a bottle of Koskenkorva in my drawer and nobody to share it with. One shot? For morale?',
        options: [
          { label: 'Kippis! (drink)', pick: () => { h.giveItem('kossu', 1, a.name); h.standing('staff', 5); return done('Kippis! Now you are one of us.', 'good'); } },
          { label: 'Not at work, Jukka.', pick: () => { h.standing('management', 2); return done('Your loss. More for me.', 'neutral'); } },
        ],
      };
  }
}

// ---------------------------------------------------------------- HR

export function disciplinary(h: StoryHost): DialogueNode {
  const s = h.save;
  const fine = 120 + s.rung * 60;
  return {
    speaker: 'Jackie from HR', subtitle: 'Disciplinary hearing', mood: 'bad',
    text: `Three warnings. ${s.name}, this is a formal hearing. We can do this the easy way (a step down the ladder), the expensive way, or you can try to explain yourself.`,
    options: [
      { label: s.rung > 0 ? `Accept a demotion to ${titleFor(s.rung - 1, s.domain, s.track)}.` : 'Accept the consequences.', pick: () => {
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
  if (s.standing.management < needs.management) lacks.push(`Management standing ${s.standing.management}/${needs.management}`);
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
        ...DOMAINS.map((d): DialogueOption => ({ label: `${d}: ${DOMAIN_INFO[d].ability}`, tag: d, pick: () => chooseTrack(h, d) })),
        { label: 'Actually, I am happy where I am.', pick: () => { h.journal('I turned down a move off the helpdesk. Better the devil you know.'); return said('Derek (on the phone)', 'Your call. Offer stands next weekend.', 'neutral', 'Hang up'); } },
      ],
    };
  }
  const t = titleFor(next, s.domain, s.track);
  return {
    speaker: 'Derek (on the phone)', subtitle: 'Performance review', mood: 'good',
    text: `Friday evening, sorry. We are offering you ${t}. More money (₡${salaryFor(next)} a week), more responsibility, and the building will take you more seriously. Much more seriously.`,
    options: [
      { label: `Accept: ${t}.`, tag: 'Harder difficulty', pick: () => { h.promote(s.domain, s.track); return said('Derek (on the phone)', `Congratulations, ${t}. The users have already been told.`, 'good', 'Hang up'); } },
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
      pick: () => { h.promote(d, t); return said('Derek (on the phone)', `Congratulations, ${titleFor(BRANCH_RUNG, d, t)}.`, 'good', 'Hang up'); },
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
    text: first === null ? 'Choose the first attribute to improve.' : `${ATTRIBUTE_INFO[first].name} it is. Choose a second.`,
    options: ATTRIBUTES.filter((a) => a !== first).map((a): DialogueOption => ({
      label: `${ATTRIBUTE_INFO[a].name} ${s.attrs[a]} → ${Math.min(100, s.attrs[a] + attributeMultiplier(s.attrUps[a]))} - ${ATTRIBUTE_INFO[a].desc}`,
      tag: `×${attributeMultiplier(s.attrUps[a])}`,
      pick: () => {
        if (first === null) return levelUpNode(h, a);
        h.applyLevelUp(first, a);
        return said('Level up', `You are now level ${s.level}. A perk point waits in your backpack (Tab).`, 'mystic', 'Wake up');
      },
    })),
  };
}

export { checkChance };
