/**
 * Where the office sim lives. Helldesk is the front door (`/`, where a tester
 * link lands); the office keeps its own address. A plain file server answers
 * any unknown path with index.html, which is the office too, so this one
 * address works on the Worker and off it.
 */
export const OFFICE = '/office';
