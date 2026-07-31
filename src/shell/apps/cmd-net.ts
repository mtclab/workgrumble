/**
 * The network, as the terminal prints it.
 *
 * The estate has no IP addresses in it: it is a graph of boxes and the wires
 * between them, which is the only part a helpdesk ticket is ever actually
 * about. Rather than seed a second, parallel truth into the world - addresses
 * nothing reads, a DHCP scope nobody can break - the address of a machine is
 * DERIVED from the machine, here, by a pure function of its id.
 *
 * That keeps three promises at once. It is deterministic, so the same box has
 * the same address in every session and after every reload. It is honest, in
 * that nothing here can disagree with the graph - if a machine is gone, so is
 * its address. And it is free of world state, so `ipconfig` cannot become a
 * thing the player has to fix.
 *
 * Nothing in this file touches the DOM, dispatches, or reads the clock.
 */

/** The one subnet this building has ever had. */
export const SUBNET = '10.42.0';

/** The router, the DNS server, and the thing the cleaner unplugs. */
export const GATEWAY = `${SUBNET}.1`;

export const DNS_SUFFIX = 'workgrumble.local';

/** What the gateway calls itself when it answers a name query. */
export const NAME_SERVER = `gw.${DNS_SUFFIX}`;

/** Addresses the DHCP scope hands out: .11 to .250, gateway well clear. */
const FIRST_HOST = 11;
const LAST_HOST = 250;

/**
 * A stable number from a string, in the small range this building needs.
 *
 * FNV-1a, 32-bit, written out rather than imported: it is four lines, it has
 * to agree with itself across every session, and a hash that changed with a
 * dependency bump would silently renumber the whole estate.
 */
export function stableHash(value: string): number {
  let hash = 0x811c_9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  }

  return hash;
}

/** The last octet this node's address has always had. */
export function hostOctet(id: string): number {
  return FIRST_HOST + (stableHash(id) % (LAST_HOST - FIRST_HOST + 1));
}

export function addressOf(id: string): string {
  return `${SUBNET}.${String(hostOctet(id))}`;
}

/**
 * The card's own number, in the shape a support call reads it out in. Derived
 * from the same hash, with the first three octets fixed: they are the ones a
 * vendor prefix would be, and inventing three random ones would be the kind of
 * detail that looks right to nobody who knows.
 */
export function macOf(id: string): string {
  const hash = stableHash(id);
  const octet = (shift: number): string => ((hash >>> shift) & 0xff)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

  return ['00', '1B', '44', octet(0), octet(8), octet(16)].join('-');
}

/** `PRINT-01` -> `print-01.workgrumble.local`. */
export function fqdn(hostname: string): string {
  return `${hostname.toLowerCase()}.${DNS_SUFFIX}`;
}

/**
 * How long one hop takes, in whole milliseconds.
 *
 * A function of the hop and the host so the numbers are stable, plausible and
 * slightly worse further away - which is what a trace looks like when the wire
 * is fine, and the joke is that the wire in this building is fine.
 */
export function hopMs(hop: number, id: string, sample: number): number {
  return 1 + hop * 2 + ((stableHash(id) + sample * 7) % 4);
}

/** `  1     3 ms     4 ms     3 ms  print-01.workgrumble.local [10.42.0.99]` */
export function traceLine(
  hop: number,
  hostname: string,
  id: string,
): string {
  const times = [0, 1, 2]
    .map((sample) => `${String(hopMs(hop, id, sample)).padStart(3, ' ')} ms`)
    .join('  ');

  return `${String(hop).padStart(3, ' ')}   ${times}  ${
    fqdn(hostname)
  } [${addressOf(id)}]`;
}
