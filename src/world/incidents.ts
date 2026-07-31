/**
 * The things that happen TO the week, on their own timetable.
 *
 * Two of them, and both are the same idea: a fault that is only interesting
 * because of the minute it happened at. A cleaner's trolley wants the socket the
 * warehouse print box is in, on the evenings her round covers that corridor. A
 * maintenance window opens at nine on a Wednesday and takes the file sharing
 * service down exactly as the mail nobody read said it would.
 *
 * They are content, not machinery: an id, a minute in a day script, the actions
 * they come down to, and the line the player sees if they happen to be looking.
 * Nothing offers them on a button, and the verbs they use are the world's own -
 * a first-line tech does not unplug a printer in another building.
 *
 * Every fault an incident causes is ALSO written into the setup of the ticket
 * that reports it. That is deliberate and it is the difference between a clue
 * and a coin toss: the ticket is broken whether or not the clock happened to
 * pass through the right minute with somebody watching, and the incident is
 * what puts the honest timestamp in the machine's own log.
 */

import { WORLD_ACTIONS } from './actions/ids';
import { companySetup, COMPANY_IDS } from './company';
import { seededNodeIds } from './tickets/solvable';
import type { TicketActionStep } from './tickets/types';

export const INCIDENTS = {
  /** Four minutes to five, Tuesday and Thursday, the warehouse corridor. */
  cleanerNeedsTheSocket: 'incident/cleaner-needs-the-socket',
  /** Nine o'clock Wednesday, announced in March, deleted by everybody. */
  maintenanceWindow: 'incident/maintenance-window',
} as const;

export interface WorldIncident {
  readonly id: string;
  /**
   * What the player is told, if anything. A printer losing power in another
   * building is not something a workstation notices, so most of these are
   * silent and the machine's own log is the only witness - which is the whole
   * reason the Event Viewer exists.
   */
  readonly notice: { readonly title: string; readonly body: string } | null;
  readonly steps: readonly TicketActionStep[];
}

export const WORLD_INCIDENTS: readonly WorldIncident[] = Object.freeze([
  {
    id: INCIDENTS.cleanerNeedsTheSocket,
    // Silent. Nobody in this building is in that corridor at four minutes to
    // five, which is exactly why it has been happening for a month.
    notice: null,
    steps: [
      {
        action: WORLD_ACTIONS.powerCut,
        target: COMPANY_IDS.warehousePrinter,
      },
    ],
  },
  {
    id: INCIDENTS.maintenanceWindow,
    notice: {
      title: 'Maintenance window',
      body: 'The file sharing service on FILES-01 has gone down for the window '
        + 'announced in your own inbox. It is due back at eleven. Somebody has '
        + 'to start it again at eleven, and the mail does not say who.',
    },
    steps: [
      {
        action: WORLD_ACTIONS.serviceStopped,
        target: COMPANY_IDS.fileShare,
      },
    ],
  },
]);

/**
 * Load-time gate, and the same one the ticket paths get: an incident aimed at
 * a node nobody built is a fault that silently does not happen, on an evening
 * nobody is watching, which surfaces two days later as a ticket about a
 * printer that is working perfectly.
 */
for (const incident of WORLD_INCIDENTS) {
  for (const step of incident.steps) {
    if (!seededNodeIds(companySetup()).has(step.target)) {
      throw new Error(
        `Incident "${incident.id}" aims "${step.action}" at `
        + `"${step.target}", which is not in the estate.`,
      );
    }
  }
}

export function findIncident(id: string): WorldIncident | undefined {
  return WORLD_INCIDENTS.find((incident) => incident.id === id);
}
