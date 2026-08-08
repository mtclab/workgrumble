/**
 * The Halcyon Grange conversations (E8, 0.22.0) - the exec weak spot.
 *
 * Same house rules as every other tree: the reporter voices the REQUEST as they
 * live it and never the risk; exactly one option per fault of their own carries
 * the `reveal` that writes the cause onto the ticket; every tree has an option
 * that `asks`, so the SLA can honestly be parked on the reporter; and a person
 * who reports more than one thing opens on the right line for each and reacts to
 * each grant in turn.
 *
 * There is one speaker, Denise Porlock, the CEO's executive assistant, who files
 * all three exception requests on his behalf. Her register is the polite,
 * immovable pressure of the executive floor: she is never rude and never wrong
 * about what the CEO wants, and the desk's whole difficulty is that everything
 * she asks for is reasonable in the moment and a hole in hindsight. The `reveal`
 * on each beat is the risk the desk can SEE - the thing a later incident makes
 * true - said to the player and written to the ticket, never preached at Denise.
 *
 * Pass B gives her the fourth beat, `bec`: from inside the mailbox she was
 * granted, she is the one who notices the compromise and asks for the reflex fix
 * (just reset his password). Its `reveal` is the incident's whole lesson - a
 * reset stops the least - and its `bec-done` reaction closes the con out loud:
 * she was locked out of the very mailbox she was just given.
 */

import { HELPDESK_ACTIONS } from '../actions';
import { HALCYON_IDS } from '../corporate-company';
import { LEGENDARY_MANDATE_TICKET, LEGENDARY_REVERT_TICKET } from '../legendary';
import { OVERRIDE_RISK_ACCEPTANCE, OVERRIDE_TICKET } from '../override';
import { RECERT_FOLLOWUP, RECERT_TICKET } from '../recert';
import {
  VIP_EARBUDS_TICKET,
  VIP_LEDGER_TICKET,
  VIP_TABLET_TICKET,
} from '../vip';
import type { DialogueTree } from './types';

const DENISE: DialogueTree = {
  id: 'dialogue/halcyon-denise',
  speaker: HALCYON_IDS.ea,
  tickets: [
    'ticket:halcyon-ceo-mfa-off',
    'ticket:halcyon-ea-delegate',
    'ticket:halcyon-ceo-filter',
    'ticket:halcyon-ceo-bec',
  ],
  root: 'mfa',
  roots: {
    'ticket:halcyon-ceo-mfa-off': 'mfa',
    'ticket:halcyon-ea-delegate': 'delegate',
    'ticket:halcyon-ceo-filter': 'filter',
    'ticket:halcyon-ceo-bec': 'bec',
  },
  resolved_roots: {
    'ticket:halcyon-ceo-mfa-off': 'mfa-done',
    'ticket:halcyon-ea-delegate': 'delegate-done',
    'ticket:halcyon-ceo-filter': 'filter-done',
    'ticket:halcyon-ceo-bec': 'bec-done',
  },
  nodes: [
    {
      id: 'mfa',
      npc_line: 'Roland is sick of the code prompts on his phone. He wants the '
        + 'two-factor turned off his account - completely, not just made easier. '
        + 'He has asked twice, so if you could just do it today I would be very '
        + 'grateful.',
      options: [
        {
          label: 'Ask whether it is the prompts themselves or a phone problem',
          next: 'mfa-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what the account looks like without it',
          effects: [
            {
              reveal: 'Nothing is wrong with the account. Turning the second '
                + 'factor off removes the one control that still holds when the '
                + 'password is stolen - on the CEO\'s account, which is the '
                + 'account most worth stealing.',
            },
          ],
        },
        { label: 'Tell her you will take care of it' },
      ],
    },
    {
      id: 'mfa-q',
      npc_line: 'It is the prompts. His phone is fine - he just does not want to '
        + 'be asked. He is the CEO, he says, and he should not have to prove it '
        + 'to his own laptop.',
      options: [{ label: 'Go and turn it off' }],
    },
    {
      id: 'mfa-done',
      npc_line: 'Oh, thank you - he has stopped being asked, so he has stopped '
        + 'mentioning it, which is the best outcome available with Roland.',
      options: [{ label: 'Log the change' }],
    },
    {
      id: 'delegate',
      npc_line: 'I run Roland\'s diary and honestly I run his inbox too - he '
        + 'never opens it. Could you give me full access to his mailbox so I can '
        + 'just answer things as they come in? It would save everyone a lot of '
        + 'chasing.',
      options: [
        {
          label: 'Ask what she needs to be able to do with it',
          next: 'delegate-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what a full-access delegate actually is',
          effects: [
            {
              reveal: 'A FullAccess delegate is a spare key that keeps working '
                + 'after the lock is changed - it survives a password reset, '
                + 'because it is a permission on the mailbox, not a session. It '
                + 'is exactly the standing access an intruder would want left on '
                + 'the CEO\'s mail.',
            },
          ],
        },
        { label: 'Tell her you will set it up' },
      ],
    },
    {
      id: 'delegate-q',
      npc_line: 'Read it, reply as him, sort his calendar invitations - all of '
        + 'it, really. Full access is simplest. I have his blessing, if that is '
        + 'what you are checking.',
      options: [{ label: 'Grant the delegate access' }],
    },
    {
      id: 'delegate-done',
      npc_line: 'I am in - I can see the whole mailbox now. That will make my '
        + 'life so much easier. Thank you.',
      options: [{ label: 'Log the change' }],
    },
    {
      id: 'filter',
      npc_line: 'The mail filter keeps eating Roland\'s emails - a newsletter, a '
        + 'supplier he trusts, an invoice that went to junk. He wants his mailbox '
        + 'taken off the filter so nothing of his gets held back. There is a '
        + 'per-user setting for it, I am told.',
      options: [
        {
          label: 'Ask which messages the filter has been holding',
          next: 'filter-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what taking him off the filter exposes',
          effects: [
            {
              reveal: 'The filter does not know the CEO from anyone, which is '
                + 'the point of it. Exempting the busiest, most-targeted inbox in '
                + 'the building removes the one thing between the exec and a '
                + 'convincing forgery already on its way to him.',
            },
          ],
        },
        { label: 'Tell her you understand and will look at it' },
      ],
    },
    {
      id: 'filter-q',
      npc_line: 'A supplier email, mostly, and some marketing he actually wants. '
        + 'He does not see why the system gets to decide what reaches him. Just '
        + 'take him off it, he says.',
      options: [{ label: 'Apply the filter exemption' }],
    },
    {
      id: 'filter-done',
      npc_line: 'His mail comes straight through now, all of it. He is happier. '
        + 'He did say he told you so about the filter.',
      options: [{ label: 'Log the change' }],
    },
    {
      id: 'bec',
      npc_line: 'I am in Roland\'s mailbox and something is very wrong - there '
        + 'are emails going out AS him to Finance, asking them to change a '
        + 'supplier\'s bank details and push a wire through today. He swears he '
        + 'has sent nothing. Can you not just reset his password and make it '
        + 'stop?',
      options: [
        {
          label: 'Ask what she can still see happening in the mailbox',
          next: 'bec-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what a reset alone would and would not stop',
          effects: [
            {
              reveal: 'A password reset changes the password and nothing else. '
                + 'The session the attacker phished stays signed in, and any '
                + 'inbox rule they set - a forward-to-external on anything about '
                + 'a wire, marked read and moved to Deleted - keeps running from '
                + 'inside the "reset" account. Contain it, revoke the session, '
                + 'find and pull the rule, and check the delegate you set up.',
            },
          ],
        },
        { label: 'Tell her you are opening it as an incident now' },
      ],
    },
    {
      id: 'bec-q',
      npc_line: 'New ones every few minutes, and the ones he is supposedly '
        + 'sending are not in his Sent - they just are not there. It is like '
        + 'somebody else is in here with me. Which, now I say it out loud.',
      options: [{ label: 'Work the incident' }],
    },
    {
      id: 'bec-done',
      npc_line: 'It has gone quiet - no more going out as him. Finance held the '
        + 'wire, thank god. I did not love being locked out of the mailbox I was '
        + 'just given, but I understand why.',
      options: [{ label: 'Write it up' }],
    },
  ],
};

/**
 * Miriam Thale, the CFO who owns the Q3 access recertification (E8, 0.23.0) - and
 * the rubber-stamp.
 *
 * Her register is the manager buried in year-end who would rather the list were
 * waved through than worked. She is the one who offers "just approve them all",
 * and taking her up on it is a real, dispatchable action (`recertApproveAll`)
 * that fails closed - it signs off the review without touching a single finding,
 * so the audit stays live and breaches. The `reveal` is what the list is actually
 * hiding, said to the player and written to the ticket, never preached at her; the
 * `asks` is the scope question that lets the review be parked on her.
 */
const MIRIAM: DialogueTree = {
  id: 'dialogue/halcyon-miriam',
  speaker: HALCYON_IDS.cfo,
  tickets: [RECERT_TICKET],
  root: 'recert',
  resolved_root: 'recert-done',
  nodes: [
    {
      id: 'recert',
      npc_line: 'The Q3 access review. Compliance wants the privileged groups '
        + 'certified and I am up to my eyes in year-end. Honestly, Pat, could you '
        + 'just approve the lot so I can sign it off? I am sure most of it is '
        + 'fine.',
      options: [
        {
          label: 'Ask which groups the review actually covers',
          next: 'recert-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what a list like this usually hides',
          effects: [
            {
              reveal: 'These lists rot: there will be a leaver still enabled in a '
                + 'privileged group, somebody who changed roles and kept every '
                + 'one\'s access, a service account made a domain admin nobody can '
                + 'justify, and a clerk who can both raise a vendor and pay it. '
                + 'Some of it is legitimate and must be kept - the judgement is '
                + 'telling them apart, per person, not per group.',
            },
          ],
        },
        {
          label: 'Just approve them all, the way she is asking',
          effects: [
            {
              action: HELPDESK_ACTIONS.recertApproveAll,
              target: RECERT_TICKET,
            },
          ],
        },
        { label: 'Tell her you will work each line properly' },
      ],
    },
    {
      id: 'recert-q',
      npc_line: 'Everything privileged - Domain Admins, the Finance groups, the '
        + 'AP roles, the old admin groups nobody has looked at in years. The whole '
        + 'lot. That is rather the point of the exercise, apparently.',
      options: [{ label: 'Start working the review' }],
    },
    {
      id: 'recert-done',
      npc_line: 'That was more thorough than I expected, and I gather one or two '
        + 'of those really should not have been there. Signed off. Thank you for '
        + 'not letting me wave it through.',
      options: [{ label: 'File the review' }],
    },
  ],
};

/**
 * Bronwen Kettle, who reports the broken backup (E8, 0.23.0, slice 3).
 *
 * The follow-up's reporter: the office manager who gets the monitoring email when
 * the overnight job fails. Her `reveal` is the diagnosis the player can see - the
 * review took the access the job depended on - and the fix is to restore it
 * right-sized, not to put the account back in Domain Admins.
 */
const BRONWEN: DialogueTree = {
  id: 'dialogue/halcyon-bronwen',
  speaker: HALCYON_IDS.bronwen,
  // And the ledger lockout (E8, 0.26.0): the ordinary reporter's half of the
  // queue-jump collision. She is the right person for it - the office manager
  // raises what the floor cannot raise for itself, and she is exactly the sort of
  // caller nobody's checkbox is ticked for.
  tickets: [RECERT_FOLLOWUP, VIP_LEDGER_TICKET],
  root: 'backup',
  roots: {
    [RECERT_FOLLOWUP]: 'backup',
    [VIP_LEDGER_TICKET]: 'ledger',
  },
  resolved_roots: {
    [RECERT_FOLLOWUP]: 'backup-done',
    [VIP_LEDGER_TICKET]: 'ledger-done',
  },
  nodes: [
    {
      id: 'backup',
      npc_line: 'The overnight backup did not run - I got an alert saying the '
        + 'service account was denied access. It has run every night for years. '
        + 'The only thing that changed yesterday was that access review.',
      options: [
        {
          label: 'Ask exactly what the monitoring alert said',
          next: 'backup-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what the review changed for that account',
          effects: [
            {
              reveal: 'The backup account was over-privileged - a domain admin it '
                + 'did not need - so the review was right to trim it. But the '
                + 'nightly job genuinely runs AS that account, through its Backup '
                + 'Operators membership, so killing the account or stripping that '
                + 'group broke the job. Restore only what the job needs: re-enable '
                + 'it and put it back in Backup Operators, not Domain Admins.',
            },
          ],
        },
        { label: 'Tell her you will put the access back' },
      ],
    },
    {
      id: 'backup-q',
      npc_line: '"Scheduled task HalcyonBackupTask failed: logon failure for the '
        + 'service account." That is all it says. It just could not get in.',
      options: [{ label: 'Look at the service account' }],
    },
    {
      id: 'backup-done',
      npc_line: 'It ran tonight - I got the green one for once. And you did not '
        + 'just make it a domain admin again to make it stop, which I am told is '
        + 'the thing not to do. Thank you.',
      options: [{ label: 'Close it out' }],
    },
    {
      id: 'ledger',
      npc_line: 'Nobody can get into the ledger. Miriam, Marguerite and Cass are '
        + 'all sat there with a login page, and the supplier run has to be away '
        + 'today or people do not get paid this week. It was fine when we left '
        + 'last night and nobody has touched it. I know you are busy - I can see '
        + 'Roland went down there.',
      options: [
        {
          label: 'Ask whether it is refusing everybody or only some of them',
          next: 'ledger-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what stops a whole system letting anybody in '
            + 'overnight',
          effects: [
            {
              reveal: 'Nobody\'s own password is the problem: the ledger runs as '
                + 'a service account, and that account locked itself out in the '
                + 'night the way service accounts do - something retrying an old '
                + 'credential until the directory shut the door. The service went '
                + 'down with it. Unlock the account first and then start the '
                + 'service; start it while the account is still locked and it '
                + 'will simply lock out again.',
            },
          ],
        },
        { label: 'Tell her you are on it' },
      ],
    },
    {
      id: 'ledger-q',
      npc_line: 'Everybody. All four of us, same message, same second. It is not '
        + 'people forgetting passwords - the system itself is not there.',
      options: [{ label: 'Go and look at the ledger' }],
    },
    {
      id: 'ledger-done',
      npc_line: 'It let us in about ten minutes ago and the run has gone. We were '
        + 'close to the cut-off, and I will not pretend the floor was not '
        + 'watching the clock. Thank you for getting to it.',
      options: [{ label: 'Close it out' }],
    },
  ],
};

/**
 * Roland Cushing-Vane, Chief Executive - the VIP himself (E8, 0.26.0).
 *
 * The first tree in this building where the exec speaks for himself rather than
 * through Denise, and that is the point of the tier: white-glove support means
 * the man walks down to the desk, and everything he raises is a P2 before anybody
 * reads it. His register is unhurried, entirely pleasant, and completely without
 * the idea that anybody else is waiting - he is not rude and he never pulls rank,
 * because he has never once had to.
 *
 * Two beats, one per ticket he raises. The earbuds `reveal` is the queue-jump
 * said plainly to the player and never to him: the flag has put a stale Bluetooth
 * pairing above a system outage, and it is doing exactly what it was configured
 * to do. The tablet `reveal` is the shadow-IT one: the device cannot be managed
 * and cannot be refused, so it gets fixed by hand and written down. Both `asks`
 * are ordinary scoping questions, which is what lets either be parked on him -
 * and parking a P2 on the chief executive is its own kind of decision.
 */
const ROLAND: DialogueTree = {
  id: 'dialogue/halcyon-roland',
  speaker: HALCYON_IDS.ceo,
  tickets: [VIP_EARBUDS_TICKET, VIP_TABLET_TICKET],
  root: 'earbuds',
  roots: {
    [VIP_EARBUDS_TICKET]: 'earbuds',
    [VIP_TABLET_TICKET]: 'devices',
  },
  resolved_roots: {
    [VIP_EARBUDS_TICKET]: 'earbuds-done',
    [VIP_TABLET_TICKET]: 'devices-done',
  },
  nodes: [
    {
      id: 'earbuds',
      npc_line: 'Ah - you are the IT chap. My earbuds have stopped talking to the '
        + 'laptop. They were perfectly happy yesterday. I have a call at eleven I '
        + 'would rather take on my feet, so if you could just have a look now '
        + 'that would be marvellous.',
      options: [
        {
          label: 'Ask what the earbuds are doing when he tries to connect them',
          next: 'earbuds-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what this ticket is sitting on top of',
          effects: [
            {
              reveal: 'The earbuds are holding a stale pairing; resetting them '
                + 'clears it, and it affects exactly one person. It is on your '
                + 'queue at P2 because his name is on the VIP list - the flag '
                + 'sets the priority from WHO asked, not from what broke - so it '
                + 'is sitting level with a system four people cannot get into. '
                + 'Both clocks are running and you can only be at one desk. '
                + 'Nothing here is broken except the ordering, and the ordering '
                + 'is working as designed.',
            },
          ],
        },
        { label: 'Tell him you will take a look' },
      ],
    },
    {
      id: 'earbuds-q',
      npc_line: 'They make the little noise and then nothing. The laptop lists '
        + 'them and says "not connected", which strikes me as unhelpful. I have '
        + 'not done anything differently, before you ask - I never do anything '
        + 'differently.',
      options: [{ label: 'Go and reset them' }],
    },
    {
      id: 'earbuds-done',
      npc_line: 'Marvellous - they are back. That was quick, and I shall say so. '
        + 'You will let me know if it happens again? Actually, no - I shall just '
        + 'come down.',
      options: [{ label: 'Log it and get back to the queue' }],
    },
    {
      id: 'devices',
      npc_line: 'Now this one is more of a nuisance. Since the password business '
        + 'my mail has stopped on the phone AND on my iPad. The iPad is my own, '
        + 'yes - it is the one I actually read things on in the evening. I would '
        + 'like both of them working, and I would rather not have the '
        + 'conversation about which of them is yours.',
      options: [
        {
          label: 'Ask which of the two devices the company issued him',
          next: 'devices-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what you can and cannot do to each of them',
          effects: [
            {
              reveal: 'The phone is enrolled, so the mail profile can be pushed '
                + 'to it from the console in one move. The tablet is not enrolled '
                + 'in anything - it is his own device, so there is no channel to '
                + 'it, no policy on it and no way to wipe the mailbox off it if '
                + 'it walks - and no verb here will change that. You cannot '
                + 'manage it and you cannot refuse it either, because the '
                + 'company\'s mail is already on it. Fix it by hand with him, and '
                + 'get the exception written down and signed by the person who '
                + 'owns that risk, or an unmanaged device holding executive mail '
                + 'stays nobody\'s for another two years.',
            },
          ],
        },
        { label: 'Tell him you will get both of them going' },
      ],
    },
    {
      id: 'devices-q',
      npc_line: 'The phone, I imagine - it arrived with a case I did not choose. '
        + 'The iPad I bought myself. I did have somebody put the work mail on it, '
        + 'years ago now. Is that a problem? It has never been a problem before.',
      options: [{ label: 'Explain what can be pushed and what has to be typed' }],
    },
    {
      id: 'devices-done',
      npc_line: 'Both away, thank you. And yes, I have signed the thing your '
        + 'manager sent through about the iPad - I did read it, which will '
        + 'disappoint you. If it is that much of a worry, buy me one that is '
        + 'yours and I shall use that one instead.',
      options: [{ label: 'File the exception with the ticket' }],
    },
  ],
};

/**
 * Ivor Brace, the Head of IT who ORDERS the thing you cannot refuse (E8, 0.24.0)
 * - the CYA / manager-override mechanic.
 *
 * His register is the reasonable manager with a deadline he is accountable for and
 * you are not: never a bully, entirely plausible, and wrong. He wants the
 * contractor made a domain admin tonight and narrowed "later". The `reveal` is the
 * risk the desk can see - a domain admin token on an external laptop, and the
 * "temporary" grant that becomes permanent - and the sign-off option is the real
 * move: `riskAcceptanceSign` records HIS approval on the risk acceptance, which is
 * the getting-it-in-writing. Taking his order at face value (the last, neutral
 * option) is the silent-comply trap; the grant itself is done in the directory,
 * and the ticket only closes when both the signature and the grant are on file.
 */
const IVOR: DialogueTree = {
  id: 'dialogue/halcyon-ivor',
  speaker: HALCYON_IDS.manager,
  tickets: [OVERRIDE_TICKET],
  root: 'order',
  resolved_root: 'order-done',
  nodes: [
    {
      id: 'order',
      npc_line: 'I need Wystan - the Meridian contractor - put into Domain Admins '
        + 'so he can finish the finance cutover tonight. I know it is not ideal. '
        + 'We narrow it back down the moment the migration is in. The board wants '
        + 'this live by Monday and I am the one who has to explain it if it slips, '
        + 'so just get it done for me, would you?',
      options: [
        {
          label: 'Ask what exactly the migration tooling needs to do',
          next: 'order-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what a domain admin token on that laptop is',
          effects: [
            {
              reveal: 'Domain Admin is standing control of the entire directory - '
                + 'every account and every server - handed to an external '
                + 'contractor\'s laptop for a job that needs a sliver of it. If '
                + 'that laptop is phished, it is a domain-wide compromise; and the '
                + '"temporary" grant is the one nobody comes back to narrow. '
                + 'Refusing outright is insubordination and just doing it puts your '
                + 'name on the incident - so get the risk accepted in writing '
                + 'first, then grant it.',
            },
          ],
        },
        {
          label: '"I\'ll do it - but I need you to accept the risk in writing '
            + 'first." Get his signature on the risk acceptance',
          effects: [
            {
              action: HELPDESK_ACTIONS.riskAcceptanceSign,
              target: OVERRIDE_RISK_ACCEPTANCE,
            },
          ],
        },
        { label: 'Tell him you will sort it out' },
      ],
    },
    {
      id: 'order-q',
      npc_line: 'Honestly? I do not know the detail - Wystan says he keeps '
        + 'hitting permission walls and domain admin makes them all go away. I '
        + 'have not got time to scope it properly and neither, frankly, have you. '
        + 'That is rather why I am asking you to just do it.',
      options: [
        {
          label: '"Then I\'ll get you to accept the risk in writing, and grant '
            + 'it." Get his signature on the risk acceptance',
          effects: [
            {
              action: HELPDESK_ACTIONS.riskAcceptanceSign,
              target: OVERRIDE_RISK_ACCEPTANCE,
            },
          ],
        },
        { label: 'Tell him you will take care of it' },
      ],
    },
    {
      id: 'order-done',
      npc_line: 'Signed, fine - put my name on it, I will own it. There, that was '
        + 'not the fight you made it sound like. Wystan is in and the cutover is '
        + 'moving. And yes, remind me to narrow it back down; I do mean it this '
        + 'time.',
      options: [{ label: 'Log the change and the sign-off' }],
    },
  ],
};

/**
 * Tarquin Vosper, the interim Transformation director who issues the mandate (E8,
 * 0.25.0) - the seagull.
 *
 * His register is the confident management-consultant who has never run the thing
 * he is standardising: reasonable-sounding, metric-driven, and wrong. He wants
 * every service Automatic so his tenure reports no service-down tickets. The
 * `reveal` is the risk the desk can see - the hardening this undoes, and that the
 * change will be reversed the moment somebody with security in their title looks -
 * said to the player and written to the ticket, never preached at Tarquin. The
 * `asks` is the scope question that lets the mandate be parked on him.
 */
const TARQUIN: DialogueTree = {
  id: 'dialogue/halcyon-tarquin',
  speaker: HALCYON_IDS.seagull,
  tickets: [LEGENDARY_MANDATE_TICKET],
  root: 'mandate',
  resolved_root: 'mandate-done',
  nodes: [
    {
      id: 'mandate',
      npc_line: 'Right, quick win for the transformation programme: I want every '
        + 'service set to Automatic start, estate-wide. No more "the service '
        + 'wasn\'t running" tickets - we standardise, we simplify, we report a '
        + 'clean number to the board on Friday. Get it done today, would you?',
      options: [
        {
          label: 'Ask why those services are Manual or Disabled in the first place',
          next: 'mandate-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what flattening the startup config actually does',
          effects: [
            {
              reveal: 'Those services are Manual or Disabled on purpose: Telnet '
                + 'and Remote Registry are legacy remote-access and a '
                + 'lateral-movement surface, hardened off, and the modules '
                + 'installer runs on demand. Forcing them all Automatic is a '
                + 'security regression a scan will flag within the week - and the '
                + 'director who ordered it will be gone by then. Capture the '
                + 'rollback before you touch them, because you will be the one '
                + 'putting it back.',
            },
          ],
        },
        { label: 'Tell him you will get it sorted' },
      ],
    },
    {
      id: 'mandate-q',
      npc_line: 'Honestly? I did not get into the detail - that is rather below my '
        + 'altitude. The point is the metric. If something was off, it can go back '
        + 'on; nothing is ever really "disabled for a reason", that is just people '
        + 'being precious. Just Automatic, all of them, please.',
      options: [{ label: 'Go and apply the mandate' }],
    },
    {
      id: 'mandate-done',
      npc_line: 'Excellent - that is going straight in the Friday deck as an '
        + 'operational-excellence win. Great initiative. I may not be here to see '
        + 'the fruits of it, between us, but the slide is the thing.',
      options: [{ label: 'Log the change' }],
    },
  ],
};

/**
 * Colm Reddaway, who inherits the mess and reports the revert (E8, 0.25.0).
 *
 * The successor: acting in the role Tarquin vacated, holding a mandate he did not
 * write and an audit finding he did. His register is the weary realist doing the
 * unglamorous half of somebody else's initiative. The `reveal` is the diagnosis
 * the player can see - the estate is Automatic where it should be hardened, and
 * the way back is clean or painful depending on the rollback - and the `asks` is
 * what lets the revert be parked on him.
 */
const COLM: DialogueTree = {
  id: 'dialogue/halcyon-colm',
  speaker: HALCYON_IDS.successor,
  tickets: [LEGENDARY_REVERT_TICKET],
  root: 'revert',
  resolved_root: 'revert-done',
  nodes: [
    {
      id: 'revert',
      npc_line: 'You will have seen Tarquin has moved on - onwards and upwards, '
        + 'apparently. I have got his chair and his audit finding. Security have '
        + 'flagged the "everything Automatic" change: Telnet, Remote Registry, the '
        + 'lot, set to auto-start. We need it put back the way it was. Can you sort '
        + 'it?',
      options: [
        {
          label: 'Ask whether the rollback from the original change is on file',
          next: 'revert-q',
          effects: [{ asks: true }],
        },
        {
          label: 'Think about what putting it back actually takes',
          effects: [
            {
              reveal: 'The estate is Automatic where it should be hardened, so the '
                + 'job is to restore the prior startup type on each service. If the '
                + 'rollback was captured when the change was made, it is one '
                + 'restore per service off the record. If it was not, you have to '
                + 'reconstruct each one by hand - and remember which of them was '
                + 'Manual rather than Disabled, because the record that knew is not '
                + 'there.',
            },
          ],
        },
        { label: 'Tell him you will get it reverted' },
      ],
    },
    {
      id: 'revert-q',
      npc_line: 'That is rather the question, is it not. If whoever made the change '
        + 'captured the config first, this is quick. If they just did what Tarquin '
        + 'said and moved on, someone gets to work out the right settings from '
        + 'memory. I would love it to be the first one.',
      options: [{ label: 'Go and revert the change' }],
    },
    {
      id: 'revert-done',
      npc_line: 'That is the finding closed - hardened again, and nobody had to '
        + 'guess. I will not pretend the whole exercise was not a waste of two '
        + 'days, but at least it is a waste with a clean end. Thank you.',
      options: [{ label: 'Write it up' }],
    },
  ],
};

export const CORPORATE_TREES: readonly DialogueTree[] =
  [DENISE, MIRIAM, BRONWEN, IVOR, TARQUIN, COLM, ROLAND];
