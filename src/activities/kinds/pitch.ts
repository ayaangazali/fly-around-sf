import type { ActivityDef, ActivityInstance, ActivityKind } from '../types';
import type { Vec3 } from '../../player/flight';
import type { Game } from '../../game';

declare module '../../core/bus' {
  interface GameEvents {
    'pitch:answer': { id: string; round: number; correct: boolean };
    'pitch:result': { id: string; won: boolean; score: number };
  }
}

export const TOPICS = ['market', 'traction', 'team'] as const;
export type PitchTopic = (typeof TOPICS)[number];

export interface PitchRound {
  topic: PitchTopic;
  ask: string;
  options: string[];
  best: number;
  yes: string;
  no: string;
}

export interface PitchParams {
  firm: string;
  partner: string;
  startup: string;
  rounds: PitchRound[];
  roundTime?: number;
}

export type PitchPhase = 'land' | 'ask' | 'verdict' | 'result';

export interface PitchInstance extends ActivityInstance {
  readonly params: PitchParams;
  readonly pad: Vec3;
  phase(): PitchPhase;
  round(): number;
  results(): boolean[];
  chosen(): number;
  timeLeft(): number;
  answer(option: number): boolean;
  won(): boolean;
}

export const PITCH = { padRadius: 7, landHeight: 6, landSpeed: 4, landHold: 0.6, leave: 260, roundTime: 20, verdict: 1.8, result: 3.2, toWin: 2 };

export function padPoint(def: ActivityDef, game: Game): Vec3 {
  return game.world.point({ lat: def.at.lat, lon: def.at.lon, alt: 0 });
}

const text = (v: unknown) => typeof v === 'string' && v.trim().length > 2;

export const kind: ActivityKind = {
  kind: 'pitch',
  label: 'Pitch Meeting',
  icon: '💼',
  validate(def) {
    const p = def.params as Partial<PitchParams> | undefined;
    const errors: string[] = [];
    if (!p || !text(p.firm) || !text(p.partner) || !text(p.startup)) errors.push('params need firm, partner and startup');
    if (!Array.isArray(p?.rounds) || p.rounds.length !== TOPICS.length) return [...errors, 'params.rounds needs exactly 3 rounds'];
    p.rounds.forEach((r, i) => {
      if (r.topic !== TOPICS[i]) errors.push(`round ${i + 1} must be about ${TOPICS[i]}`);
      if (!text(r.ask) || !text(r.yes) || !text(r.no)) errors.push(`round ${i + 1} needs ask, yes and no lines`);
      if (!Array.isArray(r.options) || r.options.length < 3 || r.options.length > 4 || !r.options.every(text)) errors.push(`round ${i + 1} needs 3 or 4 options`);
      else if (!Number.isInteger(r.best) || r.best < 0 || r.best >= r.options.length) errors.push(`round ${i + 1} best must index an option`);
    });
    if (p.roundTime !== undefined && !(p.roundTime >= 5)) errors.push('params.roundTime must be at least 5');
    return errors;
  },
  start(def, game) {
    const params = def.params as unknown as PitchParams;
    const pad = padPoint(def, game);
    const roundTime = params.roundTime ?? PITCH.roundTime;
    const results: boolean[] = [];
    let phase: PitchPhase = 'land';
    let hold = 0;
    let clock = 0;
    let picked = -1;
    let total = 0;
    let parked: Vec3 = pad;
    const won = () => results.filter(Boolean).length >= PITCH.toWin;
    const record = (option: number) => {
      const r = params.rounds[results.length];
      picked = option;
      results.push(option === r.best);
      phase = 'verdict';
      clock = PITCH.verdict;
      game.bus.emit('pitch:answer', { id: def.id, round: results.length - 1, correct: option === r.best });
    };
    const park = () => {
      game.flight.pos = { ...parked };
      game.flight.vel = { x: 0, y: 0, z: 0 };
    };
    const inst: PitchInstance = {
      params,
      pad,
      update(dt) {
        total += dt;
        const f = game.flight;
        if (phase === 'land') {
          const d = Math.hypot(f.pos.x - pad.x, f.pos.z - pad.z);
          if (d > PITCH.leave) return 'failed';
          const settled = d <= PITCH.padRadius && f.pos.y - pad.y <= PITCH.landHeight && Math.hypot(f.vel.x, f.vel.y, f.vel.z) <= PITCH.landSpeed;
          hold = settled ? hold + dt : 0;
          if (hold >= PITCH.landHold) {
            parked = { ...f.pos };
            phase = 'ask';
            clock = roundTime;
          }
          return 'running';
        }
        park();
        clock -= dt;
        if (phase === 'ask' && clock <= 0) record(-1);
        else if (phase === 'verdict' && clock <= 0) {
          if (results.length < params.rounds.length) {
            phase = 'ask';
            clock = roundTime;
          } else {
            phase = 'result';
            clock = PITCH.result;
            game.bus.emit('pitch:result', { id: def.id, won: won(), score: results.filter(Boolean).length });
          }
        } else if (phase === 'result' && clock <= 0) return won() ? 'done' : 'failed';
        return 'running';
      },
      progress: () => results.length / params.rounds.length,
      hud() {
        if (phase === 'land') return `${params.firm}: land on the glowing rooftop pad`;
        const score = `${results.filter(Boolean).length}/${params.rounds.length}`;
        if (phase === 'result') return `${params.firm}: ${won() ? 'term sheet!' : 'they passed'} (${score})`;
        return `${params.firm}  round ${Math.min(results.length + (phase === 'ask' ? 1 : 0), 3)}/3  ${score}`;
      },
      targets: () => (phase === 'land' ? [pad] : []),
      elapsed: () => total,
      phase: () => phase,
      round: () => (phase === 'verdict' || phase === 'result' ? results.length - 1 : results.length),
      results: () => [...results],
      chosen: () => picked,
      timeLeft: () => Math.max(0, clock),
      answer(option) {
        if (phase !== 'ask' || !Number.isInteger(option) || option < 0 || option >= params.rounds[results.length].options.length) return false;
        record(option);
        return true;
      },
      won,
    };
    return inst;
  },
  solve(def, game) {
    const params = def.params as unknown as PitchParams;
    const pad = padPoint(def, game);
    const answer = (best: number) => (g: Game) => void (g.activities.active?.inst as PitchInstance | undefined)?.answer(best);
    return [
      { teleport: { x: pad.x, y: pad.y + 2, z: pad.z } },
      { wait: PITCH.landHold + 0.3 },
      ...params.rounds.flatMap((r) => [{ call: answer(r.best) }, { wait: PITCH.verdict + 0.2 }]),
      { wait: PITCH.result + 0.4 },
    ];
  },
};
