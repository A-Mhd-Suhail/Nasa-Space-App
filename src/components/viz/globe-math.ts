/** Pure geometry helpers shared by the globe view (no Three.js import). */

/**
 * Direction given as azimuth/elevation at a lunar site (local ENU) -> planetocentric lat/lon of that
 * direction in the body-fixed frame (e.g. the sub-solar point for the Sun direction).
 */
export function directionLatLon(siteLat: number, siteLon: number, azDeg: number, elDeg: number): { lat: number; lon: number } {
  const d = Math.PI / 180;
  const la = siteLat * d, lo = siteLon * d, az = azDeg * d, el = elDeg * d;
  const E = [-Math.sin(lo), Math.cos(lo), 0];
  const N = [-Math.sin(la) * Math.cos(lo), -Math.sin(la) * Math.sin(lo), Math.cos(la)];
  const U = [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  const v = [0, 1, 2].map((i) => Math.cos(el) * (Math.sin(az) * E[i] + Math.cos(az) * N[i]) + Math.sin(el) * U[i]);
  return { lat: Math.atan2(v[2], Math.hypot(v[0], v[1])) / d, lon: ((Math.atan2(v[1], v[0]) / d) % 360 + 360) % 360 };
}


/** Global LOLA height map (int16 metres above the 1737.4 km sphere; row 0 = 90 N, col 0 = 0 E, cell centres). */
export type HeightMap = { data: Int16Array; width: number; height: number };

/** Bilinear height (m) at planetocentric lat / east lon, wrapping in longitude and clamping at the poles. */
export function heightAt(m: HeightMap, latDeg: number, lonEastDeg: number): number {
  const { width: W, height: H, data } = m;
  const x = ((((lonEastDeg % 360) + 360) % 360) / 360) * W - 0.5;
  const y = ((90 - latDeg) / 180) * H - 0.5;
  const yc = Math.min(Math.max(y, 0), H - 1);
  const x0 = Math.floor(x), y0 = Math.floor(yc);
  const fx = x - x0, fy = yc - y0;
  const y1 = Math.min(y0 + 1, H - 1);
  const c0 = ((x0 % W) + W) % W, c1 = (c0 + 1) % W;
  const v = (r: number, c: number) => data[r * W + c];
  return (1 - fy) * ((1 - fx) * v(y0, c0) + fx * v(y0, c1)) + fy * ((1 - fx) * v(y1, c0) + fx * v(y1, c1));
}

export const MOON_RADIUS_M = 1_737_400;

/**
 * Vertex positions/uvs/indices for a displaced UV sphere with the same parameterisation as
 * THREE.SphereGeometry (so the Moon Trek texture and markers stay aligned). Radius in lunar radii:
 * 1 + exaggeration * h / 1737.4 km. Exaggeration 1 = true scale.
 */
export function reliefSphere(m: HeightMap | null, segW: number, segH: number, exaggeration = 1) {
  const n = (segW + 1) * (segH + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let k = 0;
  for (let iy = 0; iy <= segH; iy++) {
    const v = iy / segH;
    const theta = v * Math.PI;
    const lat = 90 - v * 180;
    for (let ix = 0; ix <= segW; ix++) {
      const u = ix / segW;
      const phi = u * Math.PI * 2;
      const lon = u * 360 - 180;
      const r = m ? 1 + (exaggeration * heightAt(m, lat, lon)) / MOON_RADIUS_M : 1;
      pos[k * 3] = -r * Math.cos(phi) * Math.sin(theta);
      pos[k * 3 + 1] = r * Math.cos(theta);
      pos[k * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      uv[k * 2] = u;
      uv[k * 2 + 1] = 1 - v;
      k++;
    }
  }
  // Preallocated typed index buffer (a plain array of ~3.5 M numbers at the high LOD costs >100 MB of heap).
  const tris = segW * (segH - 1) * 2;
  const indices = n > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);
  let t = 0;
  for (let iy = 0; iy < segH; iy++)
    for (let ix = 0; ix < segW; ix++) {
      const a = iy * (segW + 1) + ix + 1, b = iy * (segW + 1) + ix, c = (iy + 1) * (segW + 1) + ix, d = (iy + 1) * (segW + 1) + ix + 1;
      if (iy !== 0) {
        indices[t++] = a;
        indices[t++] = b;
        indices[t++] = d;
      }
      if (iy !== segH - 1) {
        indices[t++] = b;
        indices[t++] = c;
        indices[t++] = d;
      }
    }
  return { positions: pos, uvs: uv, indices };
}
