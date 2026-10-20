import * as THREE from 'three';
import type { Game, GameSystem } from '../game';
import { PITCH, type PitchInstance } from '../activities/kinds/pitch';
import { el } from '../ui/panel-host';
import './pitch-room.css';

const TOPIC = { market: 'Market', traction: 'Traction', team: 'Team' } as const;
const DEAL = ['', '', '$1.5M seed on a $15M cap', '$3M seed on a $30M cap'];

function activePitch(game: Game): { id: string; inst: PitchInstance } | null {
  const a = game.activities.active;
  return a?.def.kind === 'pitch' ? { id: a.def.id, inst: a.inst as PitchInstance } : null;
}

function buildPad(): { root: THREE.Group; ring: THREE.Mesh; beam: THREE.Mesh } {
  const glow = (opacity: number) => new THREE.MeshBasicMaterial({ color: '#ff6a3d', transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
  const root = new THREE.Group();
  root.name = 'pitch-pad';
  const disc = new THREE.Mesh(new THREE.CircleGeometry(PITCH.padRadius, 40), glow(0.12));
  const ring = new THREE.Mesh(new THREE.RingGeometry(PITCH.padRadius - 0.6, PITCH.padRadius, 48), glow(0.9));
  const inner = new THREE.Mesh(new THREE.RingGeometry(1.7, 2.1, 32), glow(0.7));
  for (const m of [disc, ring, inner]) {
    m.rotation.x = -Math.PI / 2;
    root.add(m);
  }
  disc.position.y = 0.2;
  ring.position.y = 0.25;
  inner.position.y = 0.25;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 120, 12, 1, true), glow(0.3));
  beam.material.blending = THREE.AdditiveBlending;
  beam.position.y = 60;
  root.add(beam);
  root.visible = false;
  return { root, ring, beam };
}

class PitchRoom {
  private pad = buildPad();
  private box: HTMLElement;
  private timer: HTMLElement | null = null;
  private current: PitchInstance | null = null;
  private key = '';

  constructor(private game: Game) {
    this.box = el('section', 'pitch');
    this.box.setAttribute('aria-label', 'Pitch meeting');
    this.box.setAttribute('aria-live', 'polite');
    this.box.hidden = true;
    game.ui.append(this.box);
    game.scene.add(this.pad.root);
    window.addEventListener('keydown', (e) => {
      const n = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
      const target = e.target as HTMLElement | null;
      if (!n || !this.current || this.game.panels.openId || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (this.current.answer(Number(n[1]) - 1)) e.preventDefault();
    });
  }

  update(): void {
    const active = activePitch(this.game);
    this.current = active?.inst ?? null;
    const inst = this.current;
    this.pad.root.visible = !!inst;
    if (!inst) {
      this.box.hidden = true;
      this.key = '';
      return;
    }
    const t = performance.now() / 1000;
    const landing = inst.phase() === 'land';
    this.pad.root.position.set(inst.pad.x, inst.pad.y, inst.pad.z);
    this.pad.ring.scale.setScalar(landing ? 1 + 0.06 * Math.sin(t * 5) : 1);
    this.pad.beam.visible = landing && this.game.flight.pos.y - inst.pad.y > 12;
    const key = `${active!.id}|${inst.phase()}|${inst.round()}|${inst.chosen()}`;
    if (key !== this.key) {
      this.key = key;
      this.render(inst);
    }
    this.box.style.visibility = this.game.panels.openId ? 'hidden' : '';
    if (this.timer) this.timer.style.transform = `scaleX(${inst.timeLeft() / (inst.params.roundTime ?? PITCH.roundTime)})`;
  }

  private render(inst: PitchInstance): void {
    const phase = inst.phase();
    this.box.hidden = phase === 'land';
    this.box.classList.toggle('pitch-done', phase === 'result');
    this.timer = null;
    if (phase === 'land') return;
    const p = inst.params;
    const results = inst.results();
    if (phase === 'result') return void this.box.replaceChildren(this.sheet(inst, results));

    const head = el('header', 'pitch-head');
    const firm = el('div', 'pitch-firm');
    firm.append(el('span', 'pitch-kicker', 'Pitch meeting'), el('strong', '', p.firm));
    const pips = el('ol', 'pitch-pips');
    p.rounds.forEach((r, i) => {
      const state = i < results.length ? (results[i] ? 'ok' : 'bad') : i === inst.round() ? 'now' : 'todo';
      const li = el('li', `pitch-pip ${state}`, TOPIC[r.topic]);
      li.setAttribute('aria-label', `${TOPIC[r.topic]}: ${{ ok: 'nailed it', bad: 'missed', now: 'now', todo: 'up next' }[state]}`);
      pips.append(li);
    });
    head.append(firm, pips);

    const r = p.rounds[inst.round()];
    const who = el('p', 'pitch-who');
    who.append(el('span', 'pitch-avatar'), el('span', '', p.partner));
    const startup = el('p', 'pitch-startup');
    startup.append(el('span', '', 'Your startup'), el('b', '', p.startup));
    const ask = el('h3', 'pitch-ask', r.ask);
    const opts = el('div', 'pitch-options');
    opts.setAttribute('role', 'group');
    opts.setAttribute('aria-label', 'Your answer');
    const picked = inst.chosen();
    r.options.forEach((text, i) => {
      const b = el('button', 'pitch-option');
      b.type = 'button';
      b.dataset.option = String(i);
      b.append(el('kbd', '', String(i + 1)), el('span', '', text));
      if (phase === 'verdict') {
        b.disabled = true;
        b.classList.toggle('right', i === r.best);
        b.classList.toggle('wrong', i === picked && i !== r.best);
      } else b.addEventListener('click', () => inst.answer(i));
      opts.append(b);
    });
    const parts: HTMLElement[] = [head, startup, who, el('span', 'pitch-topic', TOPIC[r.topic]), ask, opts];
    if (phase === 'ask') {
      const bar = el('div', 'pitch-timer');
      this.timer = el('i');
      bar.append(this.timer);
      parts.push(bar);
    } else {
      const right = results[results.length - 1];
      parts.push(el('p', `pitch-reply ${right ? 'ok' : 'bad'}`, picked < 0 ? 'Time is up. The partner checks their phone.' : right ? r.yes : r.no));
    }
    this.box.replaceChildren(...parts);
  }

  private sheet(inst: PitchInstance, results: boolean[]): HTMLElement {
    const p = inst.params;
    const score = results.filter(Boolean).length;
    const doc = el('article', inst.won() ? 'term-sheet' : 'term-sheet pass');
    if (inst.won()) {
      doc.append(el('span', 'term-kicker', 'Summary of terms'), el('h3', '', 'Term Sheet'));
      const dl = el('dl');
      for (const [k, v] of [
        ['Company', p.startup.split(':')[0]],
        ['Investor', p.firm],
        ['Round', DEAL[score]],
        ['Score', `${score} of ${results.length} rounds`],
        ['Board seat', 'None. Go build.'],
      ]) dl.append(el('dt', '', k), el('dd', '', v));
      doc.append(dl, el('span', 'term-stamp', 'Signed'));
    } else {
      doc.append(el('span', 'term-kicker', `From: ${p.firm}`), el('h3', '', 'We are going to pass'));
      doc.append(el('p', '', `Thanks for coming in. You landed ${score} of ${results.length} answers. We'd love to stay in touch as you grow.`), el('p', 'term-hint', 'Fly back and press F to pitch again.'));
    }
    return doc;
  }
}

let room: PitchRoom;

export const system: GameSystem = {
  id: 'pitch-room',
  order: 40,
  init(game) {
    room = new PitchRoom(game);
  },
  update() {
    room.update();
  },
};
