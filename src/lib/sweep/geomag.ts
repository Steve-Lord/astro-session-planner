import { WMM2025 } from './wmm2025';

// WMM synthesis per the World Magnetic Model technical report (degree/order 12).
const A_KM = 6378.137; // WGS84 semi-major axis
const F = 1 / 298.257223563; // WGS84 flattening
const E2 = F * (2 - F);
const RE_KM = 6371.2; // geomagnetic reference radius
const DEG = Math.PI / 180;
const MAX_N = 12;
const EPOCH = WMM2025.epoch;
const VALID_END = EPOCH + 5;

/** Decimal year from the UTC position of `date` within its calendar year. */
function decimalYear(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * Magnetic declination in degrees, east positive (true bearing = magnetic + D).
 * Valid for dates in [2025.0, 2030.0); throws RangeError outside that.
 */
export function declination(latDeg: number, lonDeg: number, heightKm: number, date: Date): number {
  const t = decimalYear(date);
  if (!(t >= EPOCH && t < VALID_END)) {
    throw new RangeError(`WMM2025 is valid for ${EPOCH}-${VALID_END}; got ${t.toFixed(3)}`);
  }
  const lat = Math.max(-90 + 1e-6, Math.min(90 - 1e-6, latDeg)) * DEG; // avoid the pole singularity
  const lon = lonDeg * DEG;
  const dt = t - EPOCH;

  // Geodetic -> geocentric spherical.
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const rc = A_KM / Math.sqrt(1 - E2 * sinLat * sinLat);
  const p = (rc + heightKm) * cosLat;
  const z = (rc * (1 - E2) + heightKm) * sinLat;
  const r = Math.hypot(p, z);
  const latGc = Math.asin(z / r);
  const c = Math.sin(latGc); // cos(colatitude)
  const s = Math.cos(latGc); // sin(colatitude)

  // Schmidt semi-normalised associated Legendre functions and their theta derivatives.
  const size = MAX_N + 1;
  const P = Array.from({ length: size }, () => new Float64Array(size));
  const dP = Array.from({ length: size }, () => new Float64Array(size));
  P[0][0] = 1;
  for (let n = 1; n <= MAX_N; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        const k = n === 1 ? 1 : Math.sqrt(1 - 1 / (2 * n));
        P[n][n] = k * s * P[n - 1][n - 1];
        dP[n][n] = k * (s * dP[n - 1][n - 1] + c * P[n - 1][n - 1]);
      } else {
        const k = Math.sqrt((n - 1) * (n - 1) - m * m);
        const d = Math.sqrt(n * n - m * m);
        const p2 = n >= 2 ? P[n - 2][m] : 0;
        const dp2 = n >= 2 ? dP[n - 2][m] : 0;
        P[n][m] = ((2 * n - 1) * c * P[n - 1][m] - k * p2) / d;
        dP[n][m] = ((2 * n - 1) * (c * dP[n - 1][m] - s * P[n - 1][m]) - k * dp2) / d;
      }
    }
  }

  const cosM = Array.from({ length: size }, (_, m) => Math.cos(m * lon));
  const sinM = Array.from({ length: size }, (_, m) => Math.sin(m * lon));
  let xGc = 0; // north, geocentric
  let yGc = 0; // east
  let zGc = 0; // down
  for (const { n, m, g, h, gDot, hDot } of WMM2025.coefficients) {
    const gt = g + dt * gDot;
    const ht = h + dt * hDot;
    const f = Math.pow(RE_KM / r, n + 2);
    const gc = gt * cosM[m] + ht * sinM[m];
    xGc += f * gc * dP[n][m];
    yGc += f * m * (gt * sinM[m] - ht * cosM[m]) * P[n][m] / s;
    zGc -= f * (n + 1) * gc * P[n][m];
  }

  // Rotate back to geodetic.
  const psi = latGc - lat;
  const x = xGc * Math.cos(psi) - zGc * Math.sin(psi);
  return Math.atan2(yGc, x) / DEG;
}
