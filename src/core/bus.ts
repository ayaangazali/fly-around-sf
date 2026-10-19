export interface GameEvents {
  'activity:start': { id: string };
  'activity:complete': { id: string; time?: number };
  'activity:fail': { id: string; reason: string };
  'card:unlock': { id: string };
  'player:crash': { speed: number };
  'player:splash': Record<string, never>;
  'panel:open': { id: string };
  'panel:close': { id: string };
  'toast': { text: string; kind?: 'info' | 'reward' | 'warn' };
  'save:changed': Record<string, never>;
  'interact': Record<string, never>;
  'photo': { x: number; y: number; z: number; yaw: number; pitch: number };
}

type Handler<T> = (payload: T) => void;

export class Bus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    for (const fn of this.handlers.get(type) ?? []) (fn as Handler<GameEvents[K]>)(payload);
  }
}
