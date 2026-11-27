/** One real ticket from the office sim, flattened for the crawler. */
export interface CrawlerTicket {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly reporter: string;
  readonly reporterTitle: string;
  readonly archetype: string;
  readonly cause: string;
  /** Every advertised fix path's label. Any one of them closes the ticket. */
  readonly fixes: readonly string[];
  readonly urgency: number;
  readonly claimed: number;
  readonly kb: { readonly title: string; readonly resolution: readonly string[] } | null;
}
