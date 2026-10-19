import { buildChunks, type CityArrays } from './city-mesh';

self.onmessage = (e: MessageEvent<CityArrays & { focusX: number; focusZ: number }>) => {
  const { focusX, focusZ } = e.data;
  const chunks = buildChunks(e.data).sort((a, b) => Math.hypot(a.cx - focusX, a.cz - focusZ) - Math.hypot(b.cx - focusX, b.cz - focusZ));
  for (const c of chunks) {
    (self as unknown as Worker).postMessage(c, [c.position.buffer, c.color.buffer, c.index.buffer]);
  }
  (self as unknown as Worker).postMessage({ done: true, chunks: chunks.length });
};
