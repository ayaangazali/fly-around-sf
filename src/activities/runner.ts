import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import type { ActivityDef, ActivityInstance, ActivityKind } from './types';
import { pilotLevel } from '../ui/stats-model';

export const START_RADIUS = 45;
export const MAX_NEARBY = 8;

export class ActivityRunner {
  readonly defs = new Map<string, ActivityDef>();
  readonly kinds = new Map<string, ActivityKind>();
  active: { def: ActivityDef; inst: ActivityInstance; t: number } | null = null;
  private passive = new Map<string, ActivityInstance>();
  nearby: ActivityDef | null = null;
  nearbyList: ActivityDef[] = [];
  private pickedId: string | null = null;
  private lead: string | null = null;
  private trailCards = new Set<string>();

  constructor(private game: Game) {}

  register(kinds: ActivityKind[], defs: ActivityDef[]): string[] {
    const errors: string[] = [];
    for (const k of kinds) this.kinds.set(k.kind, k);
    for (const d of defs) {
      if (this.defs.has(d.id)) errors.push(`${d.id}: duplicate id`);
      const kind = this.kinds.get(d.kind);
      if (!kind) errors.push(`${d.id}: unknown kind ${d.kind}`);
      else errors.push(...kind.validate(d).map((e) => `${d.id}: ${e}`));
      this.defs.set(d.id, d);
      if (d.kind === 'trail' && d.card) this.trailCards.add(d.card);
    }
    return errors;
  }

  list(): ActivityDef[] {
    return [...this.defs.values()];
  }

  kindOf(def: ActivityDef): ActivityKind {
    const k = this.kinds.get(def.kind);
    if (!k) throw new Error(`unknown kind ${def.kind}`);
    return k;
  }

  shown(def: ActivityDef): boolean {
    return def.kind === 'trail' || this.game.save.data.settings.sideActivities === true;
  }

  locked(def: ActivityDef): boolean {
    return (def.requires ?? []).some((r) => !this.game.save.isDone(r));
  }

  private positions = new Map<string, Vec3>();

  position(def: ActivityDef): Vec3 {
    let p = this.positions.get(def.id);
    if (!p) this.positions.set(def.id, (p = this.kinds.get(def.kind)?.position?.(def, this.game) ?? this.game.world.point(def.at)));
    return p;
  }

  start(id: string): boolean {
    const def = this.defs.get(id);
    if (!def || this.locked(def)) return false;
    const kind = this.kindOf(def);
    if (kind.passive) return false;
    const why = kind.blocked?.(def, this.game);
    if (why) {
      this.game.bus.emit('toast', { text: why, kind: 'warn' });
      return false;
    }
    this.stop();
    this.active = { def, inst: kind.start(def, this.game), t: 0 };
    this.game.bus.emit('activity:start', { id });
    return true;
  }

  cycleNearby(dir = 1): void {
    const n = this.nearbyList.length;
    if (n < 2) return;
    const i = Math.max(0, this.nearbyList.findIndex((d) => d.id === this.pickedId));
    this.nearby = this.nearbyList[(((i + dir) % n) + n) % n];
    this.pickedId = this.nearby.id;
  }

  stop(): void {
    this.active?.inst.dispose?.();
    this.active = null;
  }

  update(dt: number): void {
    const save = this.game.save;
    const p = this.game.flight.pos;
    const w = this.game.waypoint;
    const near: { def: ActivityDef; d: number; done: boolean; led: boolean }[] = [];
    for (const def of this.defs.values()) {
      const kind = this.kinds.get(def.kind);
      if (!kind) continue;
      if (kind.passive) {
        if (save.isDone(def.id) || this.locked(def)) continue;
        let inst = this.passive.get(def.id);
        if (!inst) this.passive.set(def.id, (inst = kind.start(def, this.game)));
        if (inst.update(dt) === 'done') {
          this.passive.delete(def.id);
          this.finish(def, undefined);
        }
        continue;
      }
      if (this.active || !this.shown(def) || this.locked(def)) continue;
      const pos = this.position(def);
      const d = Math.hypot(pos.x - p.x, pos.z - p.z);
      if (d < START_RADIUS && Math.abs(pos.y - p.y) < 120) near.push({ def, d, done: save.isDone(def.id), led: !!w && Math.hypot(pos.x - w.x, pos.z - w.z) < 1 });
    }
    near.sort((a, b) => Number(b.led) - Number(a.led) || Number(a.done) - Number(b.done) || a.d - b.d);
    this.nearbyList = near.slice(0, MAX_NEARBY).map((n) => n.def);
    const lead = near[0]?.led ? near[0].def.id : null;
    if (lead && lead !== this.lead) this.pickedId = lead;
    this.lead = lead;
    this.nearby = this.nearbyList.find((d) => d.id === this.pickedId) ?? this.nearbyList[0] ?? null;
    this.pickedId = this.nearby?.id ?? null;
    if (this.active && !this.game.panels.openId) {
      this.active.t += dt;
      const status = this.active.inst.update(dt);
      if (status === 'done') {
        const { def, inst, t } = this.active;
        this.stop();
        this.finish(def, inst.elapsed?.() ?? t);
      } else if (status === 'failed') {
        const { def } = this.active;
        this.stop();
        this.game.bus.emit('activity:fail', { id: def.id, reason: 'failed' });
        this.game.bus.emit('toast', { text: `${def.title}: try again`, kind: 'warn' });
      }
    }
  }

  private finish(def: ActivityDef, time: number | undefined): void {
    const save = this.game.save;
    const xp = def.xp ?? 10;
    const level = pilotLevel(save.data.xp).level;
    const loud = this.shown(def);
    const first = save.complete(def.id, xp);
    if (time !== undefined && !this.kindOf(def).passive) save.recordBest(def.id, Math.round(time * 100) / 100);
    if (def.card && (def.kind === 'trail' || !this.trailCards.has(def.card)) && save.addCard(def.card) && loud) this.game.bus.emit('card:unlock', { id: def.card });
    this.game.bus.emit('activity:complete', { id: def.id, time });
    if (!loud) return;
    this.game.bus.emit('toast', { text: first ? `${this.kindOf(def).icon} ${def.title} +${xp} XP` : `${def.title} again: ${time?.toFixed(1)}s`, kind: 'reward' });
    const now = pilotLevel(save.data.xp).level;
    if (now > level) this.game.bus.emit('toast', { text: `⭐ Level ${now} pilot`, kind: 'reward' });
  }
}
