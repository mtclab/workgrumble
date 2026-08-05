/**
 * The MSP customers' conversations (0.8.0, Pass A).
 *
 * Same house rules as every other tree: the reporter voices the PROBLEM as they
 * live it and never the cause; exactly one option per fault of their own carries
 * the `reveal` that writes that cause onto the ticket; every option that puts a
 * QUESTION carries `asks`; and a tree with a ticket has a `resolved_root`, so the
 * person reacts to the fix. These are the three customer contacts - a law-firm
 * practice manager, a SaaS operations lead, a clinic office manager - and the
 * comedy is the same: each is right about their own morning and the MSP's job is
 * the scope none of them can see.
 */

import { MSP_IDS } from '../msp-company';
import type { DialogueTree } from './types';

const NADIA: DialogueTree = {
  id: 'dialogue/msp-nadia',
  speaker: MSP_IDS.fontaineContact,
  tickets: ['ticket:fontaine-lockout'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'It will not let me in. It has never not let me in, and I have '
        + 'a filing at ten, so whatever this is, it needs to be quick.',
      options: [
        {
          label: 'Ask whether the password has been mistyped a few times',
          next: 'typed',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the account in the directory',
          next: 'checked',
          effects: [
            {
              reveal: 'The account is locked out after a run of failed sign-ins '
                + 'this morning. A workstation user at a helpdesk customer - the '
                + 'desk unlocks it.',
            },
          ],
        },
        { label: 'Tell her you are on it' },
      ],
    },
    {
      id: 'typed',
      npc_line: 'I may have had a few goes, yes. The new starter set my password '
        + 'and I do not think I have it quite right. Is that what did it?',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Go and unlock it' },
      ],
    },
    {
      id: 'checked',
      npc_line: 'Locked, then. That would explain why nothing I typed worked. I '
        + 'assume you can un-lock it, being the people we pay to.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Unlock it and tell her it was a lockout' },
      ],
    },
    {
      id: 'after',
      npc_line: 'In. Thank you. And I have written the password down this time, '
        + 'which I know you are not supposed to say to IT.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const THEO: DialogueTree = {
  id: 'dialogue/msp-theo',
  speaker: MSP_IDS.meridianContact,
  tickets: ['ticket:meridian-lockout'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'Locked myself out of the new laptop. The app servers are fine, '
        + 'before you ask - this is just me and a password field, no drama.',
      options: [
        {
          label: 'Ask how many times he tried before it locked',
          next: 'tries',
          effects: [{ asks: true }],
        },
        {
          label: 'Check the account',
          next: 'checked',
          effects: [
            {
              reveal: 'A mistyped password locked the account. The user is in '
                + 'scope; the Linux product fleet he keeps mentioning is not, on '
                + 'OS and contract both.',
            },
          ],
        },
        { label: 'Tell him you will sort the laptop' },
      ],
    },
    {
      id: 'tries',
      npc_line: 'Enough times that it stopped arguing and just locked. I know, I '
        + 'know. I do this for a living and I still cannot type on a Monday.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Unlock it' },
      ],
    },
    {
      id: 'checked',
      npc_line: 'Yeah, locked. Nothing to do with prod - which you could not '
        + 'touch anyway, I looked up what "helpdesk" covers when we signed.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Unlock the laptop account' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Back in. Cheers. See - workstation stuff, quick as anything. '
        + 'The servers we handle ourselves, which suits everyone.',
      options: [
        { label: 'Log the fix' },
      ],
    },
  ],
};

const IVY: DialogueTree = {
  id: 'dialogue/msp-ivy',
  speaker: MSP_IDS.northwindContact,
  tickets: ['ticket:northwind-backup-alert'],
  root: 'complaint',
  resolved_root: 'after',
  nodes: [
    {
      id: 'complaint',
      npc_line: 'Your monitoring flagged something on our server - a backup '
        + 'alert? I do not really know what that means, only that your screen '
        + 'went red and mine did not.',
      options: [
        {
          label: 'Ask whether their own IT handles fixes on that box',
          next: 'whose',
          effects: [{ asks: true }],
        },
        {
          label: 'Read the alert and check what the contract covers',
          next: 'contract',
          effects: [
            {
              reveal: 'The backup service has wedged. Northwind is monitoring-'
                + 'only - remediation is out of contract - so the job is to '
                + 'acknowledge and escalate, not to reach in and restart it.',
            },
          ],
        },
        { label: 'Tell her you have seen it' },
      ],
    },
    {
      id: 'whose',
      npc_line: 'We have a chap who comes in for the actual fixing. You just '
        + 'watch it, don\'t you - that was the cheap option, I remember picking '
        + 'it.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Escalate it to whoever does their fixes' },
      ],
    },
    {
      id: 'contract',
      npc_line: 'Monitoring-only, right. So you tell us and we get someone. I '
        + 'would honestly rather you just fixed it, but I do see that is not '
        + 'what we pay for.',
      options: [
        { label: 'Back to the top', next: 'complaint' },
        { label: 'Raise it and hand it on' },
      ],
    },
    {
      id: 'after',
      npc_line: 'Raised, then. Their engineer will pick it up. Thank you for '
        + 'spotting it - that part, at least, clearly works.',
      options: [
        { label: 'Log the escalation' },
      ],
    },
  ],
};

export const MSP_TREES: readonly DialogueTree[] = [NADIA, THEO, IVY];
