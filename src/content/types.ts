import type { GeoPoint } from '../activities/types';

export type CardCategory = 'landmark' | 'company' | 'food' | 'wildlife' | 'park' | 'history' | 'culture' | 'hidden' | 'event' | 'tech' | 'transit';

export interface CardDef {
  id: string;
  name: string;
  category: CardCategory;
  rarity: 'common' | 'rare' | 'legendary';
  neighborhood: string;
  at?: GeoPoint;
  year?: number;
  art?: string;
  blurb: string;
  lore: string;
  facts: string[];
  sources: string[];
}

export function loadCards(): CardDef[] {
  return Object.values(import.meta.glob<CardDef[]>('./cards/**/*.json', { eager: true, import: 'default' })).flat();
}
