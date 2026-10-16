// Minimal column-major 4x4 matrix helpers.
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  const o = new Float32Array(16);
  o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  return o;
}
export function ortho(l, r, b, t, n, f) {
  const o = new Float32Array(16);
  o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
  return o;
}
export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
export function identity() { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; }
export function translate(m, x, y, z) {
  const t = identity(); t[12] = x; t[13] = y; t[14] = z; return mul(m, t);
}
export function rotX(m, a) { const c = Math.cos(a), s = Math.sin(a); const t = identity(); t[5] = c; t[6] = s; t[9] = -s; t[10] = c; return mul(m, t); }
export function rotY(m, a) { const c = Math.cos(a), s = Math.sin(a); const t = identity(); t[0] = c; t[2] = -s; t[8] = s; t[10] = c; return mul(m, t); }
export function rotZ(m, a) { const c = Math.cos(a), s = Math.sin(a); const t = identity(); t[0] = c; t[1] = s; t[4] = -s; t[5] = c; return mul(m, t); }
export function scale(m, x, y, z) { const t = identity(); t[0] = x; t[5] = y; t[10] = z; return mul(m, t); }
// view matrix from position + yaw/pitch (yaw 0 looks toward -z, increasing yaw turns right)
export function viewMatrix(x, y, z, yaw, pitch) {
  let m = identity();
  m = rotX(m, pitch);
  m = rotY(m, yaw);
  return translate(m, -x, -y, -z);
}
// extract 6 frustum planes from a clip matrix
export function frustum(m) {
  const p = [];
  const row = (i) => [m[i], m[4 + i], m[8 + i], m[12 + i]];
  const r0 = row(0), r1 = row(1), r2 = row(2), r3 = row(3);
  const add = (a, b, s) => { const v = [a[0] + s * b[0], a[1] + s * b[1], a[2] + s * b[2], a[3] + s * b[3]]; const l = Math.hypot(v[0], v[1], v[2]); return v.map((q) => q / l); };
  p.push(add(r3, r0, 1), add(r3, r0, -1), add(r3, r1, 1), add(r3, r1, -1), add(r3, r2, 1), add(r3, r2, -1));
  return p;
}
export function boxInFrustum(planes, x0, y0, z0, x1, y1, z1) {
  for (const p of planes) {
    const x = p[0] > 0 ? x1 : x0, y = p[1] > 0 ? y1 : y0, z = p[2] > 0 ? z1 : z0;
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
  }
  return true;
}
