import { describe, expect, it } from 'vitest';
import { toLocal } from '../../src/core/geo';
import { answerOffline, bestQuote, contextFor, entriesFrom, formatDistance, leadFor, nearest, pointsAhead, search, sentences, tokens, whatIsThat } from '../../src/ai/lore';
import type { ActivityDef } from '../../src/activities/types';
import { FIXTURE_CARDS } from './ai-fixtures';
import { loadDefs } from './helpers';

const entries = entriesFrom(FIXTURE_CARDS, []);
const at = (lat: number, lon: number) => toLocal(lat, lon);
const yawToward = (from: { x: number; z: number }, to: { x: number; z: number }) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

describe('Ask the City offline answers', () => {
  it('[R-AI-ASK] tokenizes with stopwords, possessives, plurals and accents removed', () => {
    expect(tokens("What is Coit Tower's history?")).toEqual(['coit', 'tower', 'history']);
    expect(tokens('Café murals')).toEqual(['cafe', 'mural']);
    expect(tokens('the glass of SF')).toEqual(['glass']);
  });

  it('[R-AI-ASK] keyword scoring picks the card that answers the question and quotes it', () => {
    const a = answerOffline('Who paid for the tower on Telegraph Hill?', entries);
    expect(a.entry?.id).toBe('coit-tower');
    expect(a.quote).toContain('Lillie Hitchcock Coit');
    const b = answerOffline('When did the bridge open?', entries);
    expect(b.entry?.id).toBe('golden-gate-bridge');
    expect(b.quote).toMatch(/opened in 1937/);
    const c = answerOffline('why is it orange', entries);
    expect(c.entry?.id).toBe('golden-gate-bridge');
    expect(c.quote).toContain('International Orange');
  });

  it('[R-AI-ASK] quotes the sentence that answers how tall, when and who', () => {
    expect(answerOffline('How tall is the Transamerica Pyramid?', entries).quote).toBe('The Transamerica Pyramid was completed in 1972 and was the tallest building in San Francisco until 2017. It rises 853 feet.');
    expect(answerOffline('Who designed the Transamerica Pyramid?', entries).quote).toBe('Architect William Pereira designed it.');
    expect(answerOffline('How long is the main span of the Golden Gate Bridge?', entries).quote).toBe('The main span is 4,200 feet long.');
    expect(answerOffline('What year were the Coit Tower murals painted?', entries).quote).toMatch(/murals painted in 1934/);
    expect(answerOffline('Who led the Golden Gate Bridge project?', entries).quote).toMatch(/Joseph Strauss/);
  });

  it('[R-AI-ASK] an exact name beats a body mention and related cards are offered', () => {
    const hits = search('Transamerica Pyramid', entries);
    expect(hits[0].entry.id).toBe('transamerica-pyramid');
    const a = answerOffline('tallest building 1972 or the tower murals', entries);
    expect(a.entry).not.toBeNull();
    expect(a.related.length).toBeGreaterThan(0);
    expect(a.related).not.toContain(a.entry);
  });

  it('[R-AI-ASK] proximity resolves deictic questions to the nearest place', () => {
    const coit = at(37.8024, -122.4058);
    expect(answerOffline('what is this place right here?', entries, { x: coit.x + 50, z: coit.z }).entry?.id).toBe('coit-tower');
    const bridge = at(37.8199, -122.4783);
    expect(answerOffline('what is near me?', entries, { x: bridge.x, z: bridge.z + 100 }).entry?.id).toBe('golden-gate-bridge');
    const towerScore = (p: { x: number; z: number }) => search('tower', entries, p).find((m) => m.entry.id === 'coit-tower')!.score;
    expect(towerScore(coit)).toBeGreaterThan(towerScore(bridge));
  });

  it('[R-AI-ASK] unknown questions say so and suggest nearby places, and zero cards never throws', () => {
    const bridge = at(37.8199, -122.4783);
    const a = answerOffline('best ramen recipe', entries, bridge);
    expect(a.entry).toBeNull();
    expect(a.quote).toMatch(/Nothing in the archive/);
    expect(a.related[0].id).toBe('golden-gate-bridge');
    expect(answerOffline('best ramen recipe', entries).related).toEqual([]);
    const empty = answerOffline('Golden Gate Bridge', []);
    expect(empty.entry).toBeNull();
    expect(empty.quote).toMatch(/No cards or places/);
    expect(whatIsThat([], { x: 0, z: 0, yaw: 0 })).toBeNull();
  });

  it('[R-AI-ASK] merges discover activities as places without duplicating cards', () => {
    const defs = loadDefs().filter((d) => d.kind === 'discover');
    const merged = entriesFrom(FIXTURE_CARDS, defs);
    expect(merged.filter((e) => e.name === 'Coit Tower')).toHaveLength(1);
    expect(merged.length).toBeGreaterThan(FIXTURE_CARDS.length);
    const place = merged.find((e) => e.card === null)!;
    expect(place.category).toBe('place');
    expect(bestQuote(place, 'anything')).toBe(place.blurb);
    const hidden: ActivityDef = { ...defs[0], id: 'discover-secret', title: 'Secret', hidden: true };
    expect(entriesFrom([], [hidden])).toEqual([]);
    expect(entriesFrom(FIXTURE_CARDS, [{ ...defs[0], id: 'x', title: 'Other', card: 'coit-tower' }])).toHaveLength(3);
    const alone = answerOffline('golden gate', entriesFrom([], defs));
    expect(alone.entry?.card).toBeNull();
    expect(alone.quote.length).toBeGreaterThan(5);
    expect(alone.lead).toBe('Here is what the map knows:');
    expect(answerOffline('golden gate', entries).lead).not.toBe('Here is what the map knows:');
  });

  it('[R-AI-ASK] splits lore into sentences, keeps leads deterministic and builds bounded live context', () => {
    expect(sentences(entries[0])).toHaveLength(4);
    expect(leadFor('abc')).toBe(leadFor('abc'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(leadFor)).size).toBeGreaterThan(1);
    const ctx = contextFor([{ ...entries[0], lore: 'x'.repeat(5000) }, ...entries], 3);
    expect(ctx).toHaveLength(3);
    expect(ctx[0].text.length).toBe(1500);
    expect(nearest(entries, null, 3)).toEqual([]);
    for (const s of [...entries.map((e) => answerOffline(e.name, entries).lead), formatDistance(10, false)]) expect(s).not.toMatch(/\u2014/);
  });

  it('[R-AI-WHAT] names the place ahead of the camera, preferring the one closest to the view line', () => {
    const from = at(37.8, -122.418);
    const coit = at(37.8024, -122.4058);
    const s = whatIsThat(entries, { ...from, yaw: yawToward(from, coit) })!;
    expect(s.ahead).toBe(true);
    expect(s.entry.id).toBe('coit-tower');
    expect(s.side).toBe('ahead');
    expect(s.dist).toBeGreaterThan(900);
    const ttp = at(37.7952, -122.4028);
    expect(whatIsThat(entries, { ...from, yaw: yawToward(from, ttp) })!.entry.id).toBe('transamerica-pyramid');
  });

  it('[R-AI-WHAT] with nothing ahead it reports the closest place and which side it is on', () => {
    const coit = at(37.8024, -122.4058);
    const from = { x: coit.x - 600, z: coit.z };
    const facingWest = Math.PI / 2;
    const s = whatIsThat(entries, { ...from, yaw: facingWest })!;
    expect(s.ahead).toBe(false);
    expect(s.entry.id).toBe('coit-tower');
    expect(s.side).toBe('behind');
    expect(whatIsThat(entries, { ...from, yaw: 0 })!.side).toBe('right');
    expect(whatIsThat(entries, { ...from, yaw: Math.PI })!.side).toBe('left');
    expect(whatIsThat(entries, { ...coit, yaw: 1 })!.ahead).toBe(true);
    expect(whatIsThat([{ ...entries[0], at: null }], { x: 0, z: 0, yaw: 0 })).toBeNull();
  });

  it('[R-AI-WHAT] typed "what is that" questions defer to the camera unless they name a place', () => {
    for (const q of ['what is that over there', "What's this?", 'whats that', 'What am I looking at?']) expect(pointsAhead(q, entries), q).toBe(true);
    for (const q of ['what is that tower on Telegraph Hill', 'What is Coit Tower?', 'tell me about that', 'how tall is this']) expect(pointsAhead(q, entries), q).toBe(false);
  });

  it('[R-AI-ASK] formats distances in metric and imperial', () => {
    expect(formatDistance(234, false)).toBe('230 m');
    expect(formatDistance(2345, false)).toBe('2.3 km');
    expect(formatDistance(100, true)).toBe('330 ft');
    expect(formatDistance(3218.7, true)).toBe('2.0 mi');
  });
});
