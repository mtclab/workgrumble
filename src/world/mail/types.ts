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

export interface MailThread {
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
