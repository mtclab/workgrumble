import type { GraphMutation } from './graph';

type EventListener<Payload> = (payload: Payload) => void;

export interface TicketEventPayload {
  id: string;
}

export interface EngineEventMap {
  'graph:mutated': GraphMutation;
  'ticket:spawned': TicketEventPayload;
  'ticket:resolved': TicketEventPayload;
  'ticket:breached': TicketEventPayload;
}

export class EventBus<Events extends object> {
  private readonly listeners: Partial<{
    [Type in keyof Events]: Set<EventListener<Events[Type]>>;
  }> = {};

  public on<Type extends keyof Events>(
    type: Type,
    listener: EventListener<Events[Type]>,
  ): () => void {
    const existing = this.listeners[type];
    const listeners = existing ?? new Set<EventListener<Events[Type]>>();

    if (existing === undefined) {
      this.listeners[type] = listeners;
    }

    listeners.add(listener);
    let subscribed = true;

    return () => {
      if (!subscribed) {
        return;
      }

      subscribed = false;
      listeners.delete(listener);
    };
  }

  public emit<Type extends keyof Events>(
    type: Type,
    payload: Events[Type],
  ): void {
    const listeners = this.listeners[type];

    if (listeners === undefined) {
      return;
    }

    for (const listener of [...listeners]) {
      listener(payload);
    }
  }
}

export type EngineEventBus = EventBus<EngineEventMap>;

export function createEngineEventBus(): EngineEventBus {
  return new EventBus<EngineEventMap>();
}

