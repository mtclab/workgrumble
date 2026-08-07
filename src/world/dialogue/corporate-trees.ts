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

import { HALCYON_IDS } from '../corporate-company';
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

export const CORPORATE_TREES: readonly DialogueTree[] = [DENISE];
