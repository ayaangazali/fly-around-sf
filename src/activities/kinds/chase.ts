import type { ActivityKind, SolverStep } from '../types';
import { PROP_EMOJI, clock, dist3, medalFor, meters, prop, report, rng, spot, validateTimed, type Medals, type MinigameInstance, type PropType } from '../minigame';
import { chaseTarget } from './follow';

interface ChaseParams {
  animal: PropType;
  name: string;
  speed?: number;
  radius?: number;
  catch?: number;
  timeLimit: number;
  medals?: Medals;
}

const SPOOK = 90;
const BREAK = 16;
const TIRED = 0.55;
const TIRE_TIME = 40;
const LOOK = 0.8;
const BODY = 3;

export const kind: ActivityKind = {
  kind: 'chase',
  label: 'Chase',
  icon: '🐦',
  validate(def) {
    const p = def.params as Partial<ChaseParams> | undefined;
    const errors: string[] = [];
    if (typeof p?.animal !== 'string' || !(p.animal in PROP_EMOJI)) errors.push('params.animal must be a known prop');
    if (typeof p?.name !== 'string' || !p.name) errors.push('params.name is required');
    if (p?.speed !== undefined && !(p.speed >= 5 && p.speed <= 55)) errors.push('params.speed must be 5..55 m/s');
    if (p?.radius !== undefined && !(p.radius >= 80 && p.radius <= 900)) errors.push('params.radius must be 80..900');
    if (p?.catch !== undefined && !(p.catch >= 2 && p.catch <= 15)) errors.push('params.catch must be 2..15');
    validateTimed(p, errors);
    return errors;
  },
  start(def, game): MinigameInstance {
    const p = def.params as unknown as ChaseParams;
    const speed = p.speed ?? 26;
    const arena = p.radius ?? 320;
    const reach = p.catch ?? 6;
    const rand = rng(def.id);
    const home = spot(game, def.at, 40);
    const phase = rand() * 10;
    const bird = prop(p.animal, { x: home.x + (rand() - 0.5) * 80, y: home.y + 10, z: home.z - 50 - rand() * 40 });
    const props = [bird];
    const vel = { x: 0, y: 0, z: 0 };
    const goal = { x: home.x, z: home.z };
    const brk = { x: 0, z: 0 };
    const look = { x: 0, y: 0, z: 0 };
    let t = 0;
    let wander = 0;
    let stamina = 1;
    let cool = 0;
    let dodge = 0;
    return {
      update(dt) {
        t += dt;
        const me = game.flight.pos;
        const b = bird.pos;
        const d = dist3(me, b);
        if (d <= reach) {
          report(game, def, { medal: medalFor(p.medals, t), time: t, score: `caught in ${t.toFixed(1)}s` });
          return 'done';
        }
        if (t > p.timeLimit) {
          report(game, def, { medal: 0, time: t, fail: `The ${p.name} got away` });
          return 'failed';
        }
        let dx: number;
        let dz: number;
        let dy = 0;
        let v = speed * 0.45;
        cool -= dt;
        dodge -= dt;
        if (d < SPOOK) {
          stamina = Math.max(TIRED, stamina - dt / TIRE_TIME);
          const h = Math.hypot(b.x - me.x, b.z - me.z) || 1;
          const ax = (b.x - me.x) / h;
          const az = (b.z - me.z) / h;
          const fv = game.flight.vel;
          const closing = fv.x * ax + fv.z * az - vel.x * ax - vel.z * az;
          if (d < BREAK + Math.max(0, closing) * 0.5 && cool <= 0) {
            const side = Math.sign(fv.x * az - fv.z * ax) || 1;
            brk.x = -az * side;
            brk.z = ax * side;
            dodge = 0.7;
            cool = 1.6 + rand();
          }
          if (dodge > 0) {
            dx = brk.x + ax * 0.3;
            dz = brk.z + az * 0.3;
            v = speed * stamina * 1.5;
          } else {
            const jink = Math.sin(t * 2.6 + phase) * 0.9;
            dx = ax - az * jink;
            dz = az + ax * jink;
            v = speed * stamina * (d < 25 ? 1.15 : 1);
          }
          dy = me.y < b.y ? 0.35 : -0.25;
        } else {
          stamina = Math.min(1, stamina + dt / 10);
          wander -= dt;
          if (wander <= 0) {
            const a = rand() * Math.PI * 2;
            goal.x = home.x + Math.cos(a) * arena * 0.6;
            goal.z = home.z + Math.sin(a) * arena * 0.6;
            wander = 3 + rand() * 3;
          }
          dx = goal.x - b.x;
          dz = goal.z - b.z;
        }
        const out = Math.hypot(b.x - home.x, b.z - home.z) / arena;
        if (out > 0.8) {
          const k = Math.min(3, (out - 0.8) * 8);
          const h = Math.hypot(home.x - b.x, home.z - b.z) || 1;
          const n = Math.hypot(dx, dz) || 1;
          dx = dx / n + ((home.x - b.x) / h) * k;
          dz = dz / n + ((home.z - b.z) / h) * k;
        }
        look.x = b.x + vel.x * LOOK;
        look.y = b.y + vel.y * LOOK;
        look.z = b.z + vel.z * LOOK;
        const lx = look.x;
        const ly = look.y;
        const lz = look.z;
        if (game.world.collide(look, BODY * 2)) {
          const n = Math.hypot(dx, dz, dy) || 1;
          const m = Math.hypot(look.x - lx, look.y - ly, look.z - lz) || 1;
          dx = dx / n + ((look.x - lx) / m) * 2;
          dy = dy / n + ((look.y - ly) / m) * 2;
          dz = dz / n + ((look.z - lz) / m) * 2;
        }
        const n = Math.hypot(dx, dz, dy) || 1;
        const k = Math.min(1, dt * (dodge > 0 ? 6 : 2.5));
        vel.x += ((dx / n) * v - vel.x) * k;
        vel.y += ((dy / n) * v - vel.y) * k;
        vel.z += ((dz / n) * v - vel.z) * k;
        b.x += vel.x * dt;
        b.y += vel.y * dt;
        b.z += vel.z * dt;
        b.y = Math.min(b.y, home.y + 120);
        const floor = Math.max(game.world.groundAt(b.x, b.z), game.world.groundAt(b.x + vel.x, b.z + vel.z)) + 12;
        if (b.y < floor) {
          b.y += (floor - b.y) * Math.min(1, dt * 6);
          vel.y = Math.max(vel.y, 0);
        }
        b.y = Math.max(b.y, floor - 4);
        game.world.collide(b, BODY);
        bird.yaw = Math.atan2(-vel.x, -vel.z);
        return 'running';
      },
      progress: () => 0,
      hud: () => `${PROP_EMOJI[p.animal]} ${p.name} · ${meters(dist3(game.flight.pos, bird.pos))} · ${clock(t, p.timeLimit)}`,
      targets: () => [bird.pos],
      elapsed: () => t,
      props: () => props,
    };
  },
  solve() {
    const steps: SolverStep[] = [];
    for (let i = 0; i < 20; i++) steps.push({ call: (g) => chaseTarget(g, 0) }, { wait: 0.05 });
    return steps;
  },
};
