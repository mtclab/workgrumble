import type { EmployerId } from '../employers';

/**
 * Mail is read-only content: a thread of messages that already landed. There
 * is no compose window, because nothing the player could type would change
 * the world - the world changes through actions, and mail is flavor, the
 * maintenance-announcement seam, and the boss's preferred delivery mechanism.
 */
export interface MailMessage {
  readonly id: string;
  /** Person node who sent it; the app reads their name from the graph. */
  readonly from: string;
  /** Simulation tick it arrived at, rendered as shift time. */
  readonly tick: number;
  readonly body: readonly string[];
}

/**
 * A thread that has not happened yet.
 *
 * Most mail was in the inbox when the shift started. Some of it is a
 * consequence - second line sending a thin handoff back - and a consequence
 * cannot be stamped at a fixed hour by a content file, because nobody knows
 * when the player will earn it. So the thread names a FIELD that holds the
 * tick it arrived on: no field, no thread; a tick in the field, and every
 * message in it is stamped from there.
 */
export interface MailArrival {
  readonly node: string;
  readonly field: string;
}

/**
 * A thread as a surface RENDERS one: a subject, some messages, and possibly a
 * moment it landed on.
 *
 * The inbox draws two kinds of thing. Most of it is authored world mail
 * (`MailThread` below), and the rest is DERIVED - the invoice ladder builds a
 * customer's thread out of the sheet every time it is asked for, in the world
 * it is being asked in, so it cannot belong to the wrong one. This is what the
 * two have in common and all the stamping functions ask for.
 */
export interface MailContent {
  readonly id: string;
  readonly subject: string;
  readonly messages: readonly MailMessage[];
  /**
   * When present, the thread only exists once the world says so, and every
   * message's `tick` is read as an offset from that moment rather than as an
   * absolute time.
   */
  readonly arrival?: MailArrival;
}

/**
 * One authored thread, and the world it was written for.
 *
 * `employer` is not decoration and it is not optional: a thread is a piece of
 * one shop's fiction, sent by somebody on that shop's floor, and the inbox is
 * per-world the same way the week and the rooms are (0.6.0 de-globaled the
 * employer's content; this is the corner it missed). Before this field existed
 * an ungated thread was visible EVERYWHERE - Desmond's onboarding and his
 * queue nag were in the MSP's inbox, sent by a man who is not in that building,
 * which the morning brief printed as `person:desmond` because the name lookup
 * had nothing to find.
 *
 * So every thread names its world, and `visibleMail` is asked which world it is
 * reading for. One answer, in the content, next to the words it governs.
 */
export interface MailThread extends MailContent {
  readonly employer: EmployerId;
}
