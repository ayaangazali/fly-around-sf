import * as THREE from 'three';
import { toGeo, toLocal } from '../core/geo';
import type { Vec3 } from '../player/flight';
import type { GeoPoint } from '../activities/types';
import type { Game } from '../game';
import { Terrain } from './terrain';
import { CityData, type Exclusion } from './city-data';

export type Collider = (p: Vec3, r: number) => boolean;

export interface Landmark {
  id: string;
  exclusions?: Exclusion[];
  build(game: Game): void;
}

export class World {
  readonly colliders: Collider[] = [];
  readonly root = new THREE.Group();

  constructor(
    readonly terrain: Terrain,
    readonly city: CityData,
  ) {
    this.root.name = 'world';
  }

  toLocal(lat: number, lon: number): { x: number; z: number } {
    return toLocal(lat, lon);
  }

  toGeo(x: number, z: number): { lat: number; lon: number } {
    return toGeo(x, z);
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  surfaceAt(x: number, z: number): number {
    return Math.max(this.terrain.heightAt(x, z), 0);
  }

  groundAt(x: number, z: number): number {
    return Math.max(this.surfaceAt(x, z), this.city.roofAt(x, z));
  }

  point(g: GeoPoint, defaultAlt = 30): Vec3 {
    const { x, z } = toLocal(g.lat, g.lon);
    return { x, y: this.groundAt(x, z) + (g.alt ?? defaultAlt), z };
  }

  collide(p: Vec3, r: number): boolean {
    let hit = this.city.collide(p, r);
    for (const c of this.colliders) hit = c(p, r) || hit;
    return hit;
  }

  isWater(x: number, z: number): boolean {
    return this.terrain.heightAt(x, z) < 0 && this.city.roofAt(x, z) === -Infinity;
  }
}
