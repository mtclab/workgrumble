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

export interface MailThread {
  readonly id: string;
  readonly subject: string;
  readonly messages: readonly MailMessage[];
}
