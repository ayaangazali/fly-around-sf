import { joinRoom, getRelaySockets, selfId, type JsonValue } from 'trystero';
import type { Transport, TransportHandlers } from './transport';

export const APP_ID = 'fly-around-sf';

export function openP2P(room: string, h: TransportHandlers, maxBytes: number): Transport {
  const r = joinRoom({ appId: APP_ID, relayConfig: { warnOnRelayFailure: false } }, room, {
    onJoinError: (d) => h.error?.(d.peerId),
  });
  const action = r.makeAction<JsonValue>('m', { onReceive: ({ byteLength }) => byteLength <= maxBytes });
  action.onMessage = (data, { peerId }) => h.message(data, peerId);
  r.onPeerJoin = (id) => h.join(id);
  r.onPeerLeave = (id) => h.leave(id);
  r.onPeerStream = (stream, id) => h.stream?.(stream, id);
  const quiet = (ps: Promise<void>[]) => ps.forEach((p) => p.catch(() => undefined));
  return {
    selfId,
    kind: 'p2p',
    send: (msg, to) => void action.send(msg as JsonValue, to ? { target: to } : undefined).catch(() => undefined),
    addStream: (stream, to) => quiet(r.addStream(stream, to ? { target: to } : undefined)),
    removeStream: (stream, to) => r.removeStream(stream, to ? { target: to } : undefined),
    relays: () => Object.values((getRelaySockets() ?? {}) as Record<string, WebSocket | undefined>).filter((s) => s?.readyState === 1).length,
    leave: () => void r.leave().catch(() => undefined),
  };
}
