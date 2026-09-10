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

/**
 * What the hash is salted with, and why there is a salt at all.
 *
 * Two boxes deriving one address is not a fault this estate models - there is
 * no arp table, no conflict warning, nothing anywhere that knows what a
 * duplicate address IS - so an estate that had one would simply have a number
 * that names two machines, which is precisely the wrong answer to give a
 * player who has just been taught to test by address. Two hundred and forty
 * numbers and twenty-eight boxes is not a lot of room: the unsalted hash put
 * the dental workstation on the engineer's own desk and Pennington's server on
 * its own second workstation.
 *
 * The salt itself means nothing. It is a number picked because it happens to
 * give every box in every shipped estate a number of its own, and the GATE is
 * what makes that true rather than lucky: `cmd-net.test.ts` walks every
 * employer's estate, and the onboarded customer as well, and fails the build
 * if any two machines land on one address. When a later version adds a box
 * that collides, the build says which two, and the fix is to re-roll this
 * number - every address in the game is derived, printed and never stored, so
 * a re-roll costs nothing but the numbers on the screen.
 */
const ADDRESS_SALT = 'addr47:';

/** The last octet this node's address has always had. */
export function hostOctet(id: string): number {
  return FIRST_HOST
    + (stableHash(`${ADDRESS_SALT}${id}`) % (LAST_HOST - FIRST_HOST + 1));
}

export function addressOf(id: string): string {
  return `${SUBNET}.${String(hostOctet(id))}`;
}

/**
 * Whether this argument is an ADDRESS rather than a name (0.42.0, W-20).
 *
 * Four dotted decimal parts, each of them a real octet. It is deliberately not
 * "does it contain a dot" - `print-01.workgrumble.local` contains three - and
 * deliberately not "is it in our subnet", because a tool asked about an
 * address on somebody else's network should say the network is unreachable
 * rather than that the name does not resolve.
 */
export function isAddressLiteral(value: string): boolean {
  const parts = value.trim().split('.');

  return parts.length === 4 && parts.every(
    (part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255,
  );
}

/**
 * The box AT an address, or null - the read the whole of W-20 turned on.
 *
 * The estate holds no addresses, so this is the derivation run backwards over
 * the machines the graph does hold: the one whose derived address is this one.
 * The uniqueness the gate keeps is what lets it hand back a single box, and
 * the caller is what decides whether an address is a sensible thing to have
 * been asked - `ping` and `curl` and `ssh` take one happily, `dig` does not,
 * because an address is not a name and a resolver asked for one has been asked
 * the wrong question.
 */
export function machineAtAddress<T extends { readonly id: string }>(
  machines: readonly T[],
  query: string,
): T | null {
  const needle = query.trim();

  if (!isAddressLiteral(needle)) {
    return null;
  }

  return machines.find((machine) => addressOf(machine.id) === needle) ?? null;
}

/**
 * The name a reverse lookup asks about: `10.42.0.29` ->
 * `29.0.42.10.in-addr.arpa`. The octets go backwards because the tree does,
 * which is the fact the shape is worth printing for.
 */
export function reverseName(address: string): string {
  return `${address.split('.').reverse().join('.')}.in-addr.arpa`;
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
