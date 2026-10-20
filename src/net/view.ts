import * as THREE from 'three';
import type { Game } from '../game';
import type { Vec3 } from '../player/flight';
import { createDroneModel, animateDrone, type DroneModel } from '../player/drone-model';
import { el } from '../ui/panel-host';
import { PING_SECONDS, type Net, type RemotePeer } from './session';

interface Remote {
  model: DroneModel;
  color: string;
  tag: HTMLElement;
  name: HTMLElement;
  meta: HTMLElement;
}

interface PingView {
  group: THREE.Group;
  ring: THREE.Mesh;
  mats: THREE.MeshBasicMaterial[];
  label: HTMLElement;
  at: Vec3;
}

const EDGE = 28;
const BOTTOM_EDGE = 110;

export class NetView {
  readonly group = new THREE.Group();
  readonly remotes = new Map<string, Remote>();
  private pings = new Map<string, PingView>();
  private layer: HTMLElement;
  private rings: THREE.Mesh[] = [];
  private ringKey = '';
  private aura: THREE.Mesh;
  private v = new THREE.Vector3();
  private boxes: { x: number; top: number; w: number; h: number }[] = [];
  private beamGeo = new THREE.CylinderGeometry(0.9, 0.9, 420, 10, 1, true);
  private ringGeo = new THREE.RingGeometry(5, 7.5, 40);
  private raceGeo = new THREE.TorusGeometry(12, 0.7, 10, 48);

  constructor(
    private game: Game,
    private net: Net,
  ) {
    this.group.name = 'net';
    game.scene.add(this.group);
    this.layer = el('div', 'net-tags');
    this.layer.setAttribute('aria-hidden', 'true');
    game.ui.prepend(this.layer);
    this.aura = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 8, 40), new THREE.MeshBasicMaterial({ color: '#ff3d5a', transparent: true, opacity: 0.85, fog: false }));
    this.aura.rotation.x = Math.PI / 2;
    this.aura.visible = false;
    this.group.add(this.aura);
    const frame = () => {
      this.project();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private hiddenFromMe(p: RemotePeer): boolean {
    const m = this.net.match;
    return !!m && m.phase === 'live' && m.spec.mode === 'hide' && m.role === this.net.selfId && m.spec.roster.includes(p.id);
  }

  update(): void {
    const t = performance.now() / 1000;
    const visible = new Set<string>();
    for (const p of this.net.visiblePeers()) {
      visible.add(p.id);
      let r = this.remotes.get(p.id);
      if (r && r.color !== p.color) {
        this.drop(p.id, r);
        r = undefined;
      }
      if (!r) r = this.add(p);
      r.model.root.position.set(p.pos.x, p.pos.y, p.pos.z);
      r.model.root.rotation.y = p.yaw;
      const speed = Math.hypot(p.vel.x, p.vel.z);
      animateDrone(r.model, t + p.id.length, Math.min(1, speed / 30), -Math.min(0.3, speed / 120), 0);
      r.name.textContent = p.name;
    }
    for (const [id, r] of this.remotes) {
      if (!visible.has(id)) this.drop(id, r);
    }
    this.syncPings();
    this.syncRace();
    this.syncAura(t);
  }

  private add(p: RemotePeer): Remote {
    const model = createDroneModel(p.color, '#ffc15e');
    model.root.name = `peer-${p.id}`;
    this.group.add(model.root);
    const tag = el('div', 'net-tag');
    const dot = el('i', 'net-tag-dot');
    dot.style.background = p.color;
    const name = el('b');
    const meta = el('small');
    tag.append(dot, name, meta);
    this.layer.append(tag);
    const r = { model, color: p.color, tag, name, meta };
    this.remotes.set(p.id, r);
    return r;
  }

  private drop(id: string, r: Remote): void {
    this.group.remove(r.model.root);
    r.model.root.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh) return;
      (o as THREE.Mesh).geometry.dispose();
      ((o as THREE.Mesh).material as THREE.Material).dispose();
    });
    r.tag.remove();
    this.remotes.delete(id);
  }

  private syncPings(): void {
    for (const [id, mark] of this.net.pings) {
      let v = this.pings.get(id);
      if (v && (v.at.x !== mark.p.x || v.at.z !== mark.p.z)) {
        this.dropPing(id);
        v = undefined;
      }
      if (!v) v = this.addPing(id, mark.color, mark.p, mark.name);
      const life = mark.t / PING_SECONDS;
      const fade = life > 0.8 ? (1 - life) / 0.2 : 1;
      v.mats[0].opacity = 0.42 * fade;
      v.mats[1].opacity = 0.9 * fade;
      const pulse = 1 + ((mark.t * 1.4) % 1) * 1.6;
      v.ring.scale.set(pulse, pulse, pulse);
      v.mats[1].opacity *= 1 - ((mark.t * 1.4) % 1) * 0.7;
      v.label.style.opacity = String(fade);
    }
    for (const id of [...this.pings.keys()]) if (!this.net.pings.has(id)) this.dropPing(id);
  }

  private addPing(id: string, color: string, p: Vec3, who: string): PingView {
    const group = new THREE.Group();
    group.position.set(p.x, p.y, p.z);
    const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const beam = new THREE.Mesh(this.beamGeo, beamMat);
    beam.position.y = 210;
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.6;
    group.add(beam, ring);
    group.name = `ping-${id}`;
    this.group.add(group);
    const label = el('div', 'net-ping');
    const dot = el('i', 'net-tag-dot');
    dot.style.background = color;
    label.append(dot, el('b', '', who), el('small'));
    this.layer.append(label);
    const v = { group, ring, mats: [beamMat, ringMat], label, at: { ...p } };
    this.pings.set(id, v);
    return v;
  }

  private dropPing(id: string): void {
    const v = this.pings.get(id);
    if (!v) return;
    this.group.remove(v.group);
    v.mats.forEach((m) => m.dispose());
    v.label.remove();
    this.pings.delete(id);
  }

  private syncRace(): void {
    const targets = this.net.match?.phase === 'live' ? this.net.match.targets() : [];
    const key = targets.map((p) => `${p.x.toFixed(0)},${p.z.toFixed(0)}`).join('|');
    if (key === this.ringKey) return;
    this.ringKey = key;
    for (const r of this.rings) {
      this.group.remove(r);
      (r.material as THREE.Material).dispose();
    }
    this.rings = targets.map((p, i) => {
      const next = targets[i + 1] ?? p;
      const mat = new THREE.MeshBasicMaterial({ color: i === 0 ? '#ff6a3d' : '#ffc15e', transparent: true, opacity: i === 0 ? 0.95 : 0.4, fog: false });
      const ring = new THREE.Mesh(this.raceGeo, mat);
      ring.position.set(p.x, p.y, p.z);
      if (next !== p) ring.lookAt(next.x, next.y, next.z);
      else ring.rotation.y = Math.atan2(p.x - this.game.flight.pos.x, p.z - this.game.flight.pos.z);
      ring.name = 'race-ring';
      this.group.add(ring);
      return ring;
    });
  }

  private syncAura(t: number): void {
    const m = this.net.match;
    const mode = m?.spec.mode;
    const show = !!m && m.phase === 'live' && (mode === 'tag' || mode === 'formation');
    this.aura.visible = show;
    if (!show || !m) return;
    const p = m.role === this.net.selfId ? this.game.flight.pos : this.net.peers.get(m.role)?.pos;
    if (!p) {
      this.aura.visible = false;
      return;
    }
    (this.aura.material as THREE.MeshBasicMaterial).color.set(mode === 'tag' ? '#ff3d5a' : '#ffc15e');
    this.aura.position.set(p.x, p.y - 0.4, p.z);
    this.aura.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
  }

  private place(node: HTMLElement, p: Vec3, lift: number, label: string): void {
    const cam = this.game.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const d = cam.position.distanceTo(this.v.set(p.x, p.y, p.z));
    this.v.set(p.x, p.y + lift, p.z).project(cam);
    let x = this.v.x;
    let y = this.v.y;
    const behind = this.v.z > 1;
    if (behind) {
      x = -x;
      y = -y;
    }
    const off = behind || Math.abs(x) > 1 || Math.abs(y) > 1;
    node.hidden = false;
    const nw = node.offsetWidth;
    const nh = node.offsetHeight;
    let px = ((x + 1) / 2) * w;
    let py = ((1 - y) / 2) * h;
    if (off) {
      const m = Math.max(Math.abs(x), Math.abs(y)) || 1;
      px = ((x / m + 1) / 2) * w;
      py = ((1 - y / m) / 2) * h;
      const hw = nw / 2 + EDGE;
      px = Math.min(w - hw, Math.max(hw, px));
      py = Math.min(h - BOTTOM_EDGE, Math.max(nh + EDGE + 48, py));
      node.style.setProperty('--dir', `${Math.atan2(-y, x).toFixed(3)}rad`);
    }
    const base = off ? py - nh / 2 : py - nh - 12;
    let top = base;
    let hit: (typeof this.boxes)[number] | undefined;
    while ((hit = this.boxes.find((b) => Math.abs(b.x - px) < (b.w + nw) / 2 && top < b.top + b.h && b.top < top + nh))) top = hit.top - nh - 2;
    this.boxes.push({ x: px, top, w: nw, h: nh });
    py += top - base;
    node.classList.toggle('edge', off);
    node.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, ${off ? '-50%' : 'calc(-100% - 12px)'})`;
    node.style.setProperty('--fade', String(Math.max(0.35, 1 - Math.max(0, d - 800) / 2200)));
    const meta = node.lastElementChild as HTMLElement;
    if (meta.textContent !== label) meta.textContent = label;
  }

  private project(): void {
    this.layer.hidden = !!this.game.panels.openId;
    if (this.layer.hidden || (!this.remotes.size && !this.pings.size)) return;
    const me = this.game.flight.pos;
    const m = this.net.match;
    this.boxes = [];
    const imperial = this.game.save.data.settings.units === 'imperial';
    for (const [id, r] of this.remotes) {
      const p = this.net.peers.get(id);
      if (!p) continue;
      if (this.hiddenFromMe(p)) {
        r.tag.hidden = true;
        r.model.root.visible = true;
        continue;
      }
      const dist = Math.hypot(p.pos.x - me.x, p.pos.y - me.y, p.pos.z - me.z);
      const role = m?.phase === 'live' && m.role === id ? (m.spec.mode === 'tag' ? 'IT · ' : m.spec.mode === 'hide' ? 'SEEKER · ' : m.spec.mode === 'formation' ? 'LEADER · ' : '') : '';
      r.tag.classList.toggle('talking', p.mic === 2);
      r.tag.classList.toggle('muted', p.muted);
      this.place(r.tag, p.pos, 1.6, `${role}${fmt(dist, imperial)}${p.mic === 2 ? ' · talking' : ''}`);
    }
    for (const [id, v] of this.pings) {
      const mark = this.net.pings.get(id);
      if (!mark) continue;
      this.place(v.label, mark.p, 10, fmt(Math.hypot(mark.p.x - me.x, mark.p.y - me.y, mark.p.z - me.z), imperial));
    }
  }
}

export function fmt(m: number, imperial = false): string {
  if (imperial) {
    const ft = m * 3.281;
    return ft < 1000 ? `${Math.round(ft)} ft` : `${(m / 1609.34).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
