import type { Vec3, FlightInput } from '../player/flight';
import type { Game } from '../game';

export interface GeoPoint {
  lat: number;
  lon: number;
  alt?: number;
}

export interface ActivityDef {
  id: string;
  kind: string;
  title: string;
  blurb: string;
  neighborhood: string;
  at: GeoPoint;
  xp?: number;
  card?: string;
  requires?: string[];
  tags?: string[];
  hidden?: boolean;
  params?: Record<string, unknown>;
}

export type ActivityStatus = 'running' | 'done' | 'failed';

export interface ActivityInstance {
  update(dt: number): ActivityStatus;
  progress(): number;
  hud(): string;
  targets?(): Vec3[];
  elapsed?(): number;
  dispose?(): void;
}

export type SolverStep =
  | { teleport: Vec3; yaw?: number }
  | { wait: number }
  | { action: 'interact' | 'photo' | 'ping' }
  | { fly: Partial<FlightInput>; seconds: number }
  | { call: (game: Game) => void };

export interface ActivityKind {
  kind: string;
  label: string;
  icon: string;
  passive?: boolean;
  validate(def: ActivityDef): string[];
  blocked?(def: ActivityDef, game: Game): string | null;
  start(def: ActivityDef, game: Game): ActivityInstance;
  solve(def: ActivityDef, game: Game): SolverStep[];
}
