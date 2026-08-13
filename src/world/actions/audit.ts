/**
 * The audit queue's verbs (E9, 0.36.0 - the SD-senior rung).
 *
 * FOUR here, and the fifth is deliberately somewhere else: CORRECTING a
 * junior's triage is `ticket.classify`, the queue's own triage form, unchanged.
 * A second classify verb for other people's tickets would be a second matrix
 * free to disagree with the one the game teaches - so the correction goes
 * through the shipped form and this module holds only what that form has no
 * opinion about (`AUDIT_CORRECTION_TAX`, hung on the end of it there).
 *
 *  - `auditDeal` is how somebody else's filing gets onto a ticket. The day loop
 *    spawns the ticket the ordinary way and then deals the filing onto it, so
 *    an audit item is an ordinary ticket in every respect the engine cares
 *    about and the ONE thing that is different about it - a triage nobody at
 *    this desk filed - is a dispatched verb a replay reproduces. It re-cuts the
 *    deadline through `deadlineOps`, the same arithmetic the player's own
 *    triage uses, because the whole mechanic is that a wrong filing buys the
 *    wrong clock and a second copy of that sum is the one place the two could
 *    disagree.
 *  - `auditConfirm` is the player's second answer: this filing is fine, leave
 *    it. It costs nothing this minute, which is exactly why it is the tempting
 *    one, and what it costs instead is that the ticket keeps the clock the
 *    junior bought it.
 *  - `auditFallout` is the bill, dispatched by the day loop off the pure read
 *    `auditFalloutDue`, in the same shape as the queue-jump's and the
 *    enrolment's. It charges standing and suspicion together, because a breach
 *    somebody else caused and you signed off is both a deadline the floor
 *    watched go and a decision with your name on it.
 *  - `kbWriteUp` is the rung's own duty made mechanical: the second time the
 *    same class comes past, write the article. It charges the attention tax now
 *    and what it buys is that the next instance of the class arrives right.
 *
 * THE TAX. Correcting and writing up both apply `refocus_until`, the shipped
 * attention window every interruption in this game already uses. It is the
 * honest cost of the rung as the research states it - a senior's day is spent
 * being pulled out of their own work - and it is the half that makes confirming
 * a wrong filing a real temptation rather than an obviously bad button. Take
 * the tax off and the second queue is free, which is the mechanic gone.
 */

import type { ActionData, NodeRefData, OpData } from '../../engine-api';
import { AUDIT_CLASS, AUDIT_VERDICTS } from '../audit';
import { FIELDS } from '../fields';
import { METER_CEILING, METER_FLOOR, REFOCUS_TICKS } from '../meters';
import { LEVELS, PRIORITIES } from '../priority';
import { deadlineOps } from './deadline';
import { fieldIs, HELPDESK_TIER, not, TARGET, targetGuards } from './helpers';
import { AUDIT_ACTIONS } from './ids';

const ACTOR: NodeRefData = { ref: 'actor' };

/** The parameters the deal carries: whose filing, and what it says. */
export const JUNIOR_PARAM = 'junior';
export const FAULT_PARAM = 'fault';
export const CLASS_PARAM = 'audit_class';
export const BENEFICIARY_PARAM = 'beneficiary';
export const ARTICLE_PARAM = 'article';

/**
 * What a breach you signed off costs, in the two currencies the world has.
 *
 * OVERSEER TUNING KNOBS, and deliberately the same shape as the queue-jump's
 * pair: the floor watched a deadline go while the ticket sat on a priority
 * anybody could have checked (reputation), and somebody senior now knows a QA
 * signature has your name on it (suspicion). Both are charged, on top of the
 * plain breach the missed deadline already carries, because the whole content
 * of a QA sign-off is that you are answerable for a decision you did not make.
 *
 * The reputation figure is the queue-jump's, unchanged: it is the same kind of
 * event - a deadline missed for a reason a person chose - and a second number
 * for it would be two answers to one question. The suspicion is lower than the
 * audit finding's twelve, because a wrong priority is a judgement call badly
 * made and not a privileged grant nobody sanctioned.
 */
export const AUDIT_FALLOUT_REPUTATION = 5;
export const AUDIT_FALLOUT_SUSPICION = 6;

/** The attention window a piece of somebody else's work costs you. */
function startRefocus(): readonly OpData[] {
  return [
    {
      op: 'set_field',
      node: ACTOR,
      field: FIELDS.refocusUntil,
      value: { now: true },
    },
    {
      op: 'set_field',
      node: ACTOR,
      field: FIELDS.refocusUntil,
      value: {
        add: {
          node: ACTOR,
          field: FIELDS.refocusUntil,
          by: { const: REFOCUS_TICKS },
          clamp: { min: METER_FLOOR, max: Number.MAX_SAFE_INTEGER },
        },
      },
    },
  ];
}

/**
 * The guards the two player verbs share: it has to BE an audit item, and it has
 * to be one nobody has ruled on yet.
 *
 * The second one is what stops the confirm button being a way to un-correct a
 * filing you have already put right - a verdict is a signature, and a signature
 * is not something you take back by pressing the other button.
 */
const RULEABLE = [
  ...targetGuards('ticket'),
  {
    // "Has a name on it", said the only way the guard language can: the field
    // is not missing. There is no string predicate and there does not need to
    // be - the deal writes a name or nothing has been dealt.
    when: { pred: 'field_missing' as const, node: TARGET, field: FIELDS.auditOf },
    reason: 'That is one of yours. The audit queue is other people\'s filings '
      + '- there is nobody else\'s signature on this one to agree with.',
  },
  {
    when: not({
      pred: 'field_missing' as const,
      node: TARGET,
      field: FIELDS.auditVerdict,
    }),
    reason: 'You have already ruled on that one, and a QA signature is not '
      + 'something you take back by pressing the other button.',
  },
];

export const AUDIT_ACTION_LIST: readonly ActionData[] = [
  {
    /**
     * Somebody else's filing, put onto a ticket that has just arrived.
     *
     * Not a player verb: the day loop dispatches it in the minute it spawns the
     * ticket, off `AUDIT_ITEMS`. The parameters are guarded the way any content
     * parameter is - a cell outside the nine and a priority outside the four
     * are refused - and the one thing NOT guarded is that the pair agrees with
     * the number, because a filing whose number does not follow from its cell
     * is the `matrix` fault and is the whole point of one of the five items.
     */
    id: AUDIT_ACTIONS.auditDeal,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      {
        when: not({
          pred: 'field_missing',
          node: TARGET,
          field: FIELDS.auditOf,
        }),
        reason: 'That ticket already carries somebody\'s filing. Dealing it '
          + 'twice would overwrite a triage the player may already have ruled '
          + 'on.',
      },
      {
        when: { pred: 'param_string_missing', param: JUNIOR_PARAM },
        reason: 'An audit item is somebody\'s filing, and this one arrived '
          + 'with nobody\'s name on it.',
      },
      {
        when: not({
          pred: 'param_int_in',
          param: 'impact',
          values: [...LEVELS],
        }),
        reason: 'Impact is low, medium or high, and that filing is none of '
          + 'them.',
      },
      {
        when: not({
          pred: 'param_int_in',
          param: 'urgency',
          values: [...LEVELS],
        }),
        reason: 'Urgency is low, medium or high, and that filing is none of '
          + 'them.',
      },
      {
        when: not({
          pred: 'param_int_in',
          param: 'priority',
          values: [...PRIORITIES],
        }),
        reason: 'A priority is P1 to P4. Whatever that filing says, no queue '
          + 'in the building has a column for it.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.auditOf,
        value: { param_trim: JUNIOR_PARAM },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.impact,
        value: { param: 'impact' },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.urgency,
        value: { param: 'urgency' },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.priority,
        value: { param: 'priority' },
      },
      // The minute the filing was made, so the scorecard reads it the way it
      // reads any other triage: as a thing that happened on a day.
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.classifiedAt,
        value: { now: true },
      },
      // The three optional halves. Each one writes only when the deal carried
      // it, so a correctly-filed item has no fault on it, an item outside the
      // class has no class on it, and only the shadow-VIP item names somebody
      // it is for.
      ...[
        [FAULT_PARAM, FIELDS.auditFault],
        [CLASS_PARAM, FIELDS.auditClass],
        [BENEFICIARY_PARAM, FIELDS.beneficiary],
        [ARTICLE_PARAM, FIELDS.kbRef],
      ].map(([param, field]) => ({
        op: 'when' as const,
        cond: not({ pred: 'param_string_missing' as const, param: param ?? '' }),
        ops: [
          {
            op: 'set_field' as const,
            node: TARGET,
            field: field ?? '',
            value: { param_trim: param ?? '' },
          },
        ],
      })),
      // And the clock the filing bought, through the arithmetic the player's
      // own triage uses. This is the line the whole mechanic hangs off: an
      // under-called ticket now has the loose deadline its priority says, and
      // the settler is what happens when that deadline runs out.
      ...deadlineOps(),
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.worknotes,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.worknotes,
            value: { const: 'Triaged at first line. Flagged for QA.' },
          },
        },
      },
    ],
  },
  {
    id: AUDIT_ACTIONS.auditConfirm,
    tier: HELPDESK_TIER,
    validate: RULEABLE,
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.auditVerdict,
        value: { const: AUDIT_VERDICTS.confirmed },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.auditVerdictAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.worknotes,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.worknotes,
            value: { const: 'QA: triage reviewed and left as filed.' },
          },
        },
      },
    ],
  },
  {
    id: AUDIT_ACTIONS.auditFallout,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      {
        when: not(fieldIs(TARGET, FIELDS.auditVerdict, AUDIT_VERDICTS.confirmed)),
        reason: 'Nothing was signed off on that one, so there is no signature '
          + 'to hold anybody to.',
      },
      {
        when: { pred: 'field_missing', node: TARGET, field: FIELDS.auditFault },
        reason: 'That filing was right. A correct triage that breached is a '
          + 'breach, and it is not an audit finding.',
      },
      {
        when: not(fieldIs(TARGET, FIELDS.breached, true)),
        reason: 'The clock on that one has not run out. A wrong priority '
          + 'nothing ever tested cost nobody anything.',
      },
      {
        when: {
          pred: 'field_is_number',
          node: TARGET,
          field: FIELDS.auditFalloutAt,
        },
        reason: 'That one has already come back on you. Once is the '
          + 'arrangement.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.auditFalloutAt,
        value: { now: true },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.reputation,
        value: {
          sub: {
            node: ACTOR,
            field: FIELDS.reputation,
            by: { const: AUDIT_FALLOUT_REPUTATION },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.suspicion,
        value: {
          add: {
            node: ACTOR,
            field: FIELDS.suspicion,
            by: { const: AUDIT_FALLOUT_SUSPICION },
            clamp: { min: METER_FLOOR, max: METER_CEILING },
          },
        },
      },
    ],
  },
  {
    /**
     * Second line, answering at last - and the ticket finally leaving the board
     * it never left when it was escalated.
     *
     * It sets the SAME field the ordinary handoff sets (`escalated`), so the
     * ticket's own resolution rule closes it exactly as it would have done for
     * a junior. The difference retained ownership makes is not what happens in
     * the end; it is the ninety minutes of clock in between, which were yours.
     */
    id: AUDIT_ACTIONS.vendorReply,
    tier: HELPDESK_TIER,
    validate: [
      ...targetGuards('ticket'),
      {
        when: {
          pred: 'field_missing',
          node: TARGET,
          field: FIELDS.retainedAt,
        },
        reason: 'Nothing was kept on that one. A ticket handed over in the '
          + 'ordinary way is already somebody else\'s.',
      },
      {
        when: fieldIs(TARGET, FIELDS.escalated, true),
        reason: 'Second line have already come back on that one.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.escalated,
        value: { const: true },
      },
      {
        op: 'set_field',
        node: TARGET,
        field: FIELDS.worknotes,
        value: {
          append_line: {
            node: TARGET,
            field: FIELDS.worknotes,
            value: {
              const: 'Second line have come back. Ownership ends here.',
            },
          },
        },
      },
    ],
  },
  {
    /**
     * The article, written on the desk it came off.
     *
     * Aimed at nothing - it is about a CLASS rather than about a ticket, and
     * pointing it at whichever instance happened to be open would make the
     * article a property of one ticket. The guard is KCS's own rule: you write
     * it the second time, so a first sighting cannot produce one, and nobody
     * writes the same article twice.
     */
    id: AUDIT_ACTIONS.kbWriteUp,
    tier: HELPDESK_TIER,
    validate: [
      {
        when: not({
          pred: 'field_missing',
          node: ACTOR,
          field: FIELDS.kbAuthored,
        }),
        reason: 'You have written that one up. Writing it again is how a '
          + 'knowledge base ends up with four articles about a stopped '
          + 'service and no way to tell which is current.',
      },
    ],
    apply: [
      {
        op: 'set_field',
        node: ACTOR,
        field: FIELDS.kbAuthored,
        value: { const: AUDIT_CLASS },
      },
      ...startRefocus(),
    ],
  },
];

/** The correction's own cost, exported so the classify verb can charge it. */
export const AUDIT_CORRECTION_TAX: readonly OpData[] = startRefocus();
