// The dance, as numbers. One salsa basic: two bars, eight counts at 120 BPM = 4.0 s, and
// counts land every 0.5 s. No Three import and no DOM: this is the module to tune, and the
// one the Node tests can hold still.
//
// SIGN CONVENTIONS (dancer-figure.js applies exactly these)
//   All values are degrees, Euler order XYZ.
//   Spine chain (hips, spine, chest, neck, head) points UP from its joint:
//     x > 0  tips the top toward the camera (+Z)      -> a forward lean
//     y > 0  turns the front (+Z) toward +X           -> turns to screen right
//     z > 0  leans the top toward -X (screen left)
//   Limbs (armL/R, foreL/R, handL/R, thighL/R, shinL/R) hang DOWN from the joint:
//     x > 0  swings the free end toward the camera    -> a forward step / arm lift
//     y      twists the limb about its own length
//     z > 0  swings the free end toward +X (screen right)
//   Feet point forward (+Z): x > 0 points the toe down.
//
// HER LEFT / RIGHT: she faces the camera, so her L is at +X = screen right.
// The salsa basic breaks forward on the left (count 1) and back on the right (count 5).
// Her right arm is overhead through counts 1-3, her left through 5-7; the swap happens on
// the 4 and 8.

export const BPM = 120;
export const COUNT = 60 / BPM; // 0.5 s
export const LOOP = COUNT * 8; // 4.0 s

export const JOINT_NAMES = [
  'hips', 'spine', 'chest', 'neck', 'head',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
  'armL', 'foreL', 'handL', 'armR', 'foreR', 'handR',
];

// root = [x, y, z] offset of the hips from the standing position, in figure units.
// joints[name] = [x, y, z] degrees. Every key lists every joint, so a human can read one
// column (a joint down the counts) straight out of the file.
export const KEYS = [
  { t: 0.0, // count 1 — break forward on the left, right arm overhead
    root: [0.0, -0.005, 0.055],
    hips: [5, -12, -3], spine: [1, 5, 2], chest: [0, 12, 5], neck: [0, -5, -3], head: [-4, -9, -4],
    thighL: [26, 0, -3], shinL: [-8, 0, 0], footL: [18, 0, 0],
    thighR: [-20, 0, 4], shinR: [-26, 0, 0], footR: [50, 0, 0],
    armL: [25, 0, 25], foreL: [0, 0, 245], handL: [0, 0, 0],
    armR: [10, 0, -142], foreR: [0, 0, -38], handR: [0, 0, 0] },

  { t: 0.5, // count 2 — weight settles onto the left, hip pops
    root: [0.02, -0.018, 0.03],
    hips: [4, -4, 6], spine: [1, 2, -2], chest: [0, 5, -5], neck: [0, -2, 3], head: [-3, -3, 5],
    thighL: [14, 0, -5], shinL: [-4, 0, 0], footL: [10, 0, 0],
    thighR: [-6, 0, 5], shinR: [-16, 0, 0], footR: [22, 0, 0],
    armL: [23, 0, 23], foreL: [0, 0, 248], handL: [0, 0, 0],
    armR: [8, 0, -146], foreR: [0, 0, -34], handR: [0, 0, 0] },

  { t: 1.0, // count 3 — left foot returns, weight to the right, arms start to travel
    root: [0.01, -0.008, 0.0],
    hips: [4, 8, 5], spine: [1, -4, -1], chest: [0, -8, -3], neck: [0, 3, 2], head: [-2, 5, 3],
    thighL: [-6, 0, -4], shinL: [-10, 0, 0], footL: [16, 0, 0],
    thighR: [4, 0, 4], shinR: [-6, 0, 0], footR: [2, 0, 0],
    armL: [27, 0, 27], foreL: [0, 0, 243], handL: [0, 0, 0],
    armR: [12, 0, -139], foreR: [0, 0, -41], handR: [0, 0, 0] },

  { t: 1.5, // count 4 — the held beat: hands crossing in front of the torso
    root: [0.0, -0.015, -0.01],
    hips: [4, 12, 0], spine: [1, -6, 0], chest: [0, -12, 0], neck: [0, 4, 0], head: [0, 7, 0],
    thighL: [-12, 0, -4], shinL: [-14, 0, 0], footL: [26, 0, 0],
    thighR: [10, 0, 4], shinR: [-4, 0, 0], footR: [0, 0, 0],
    armL: [16, 0, 55], foreL: [0, 0, 150], handL: [0, 0, 0],
    armR: [20, 0, -25], foreR: [0, 0, -245], handR: [0, 0, 0] },

  { t: 2.0, // count 5 — break back on the right, left arm starts up
    root: [-0.01, -0.005, -0.055],
    hips: [4, 14, 3], spine: [1, -5, -2], chest: [0, -13, -5], neck: [0, 5, 3], head: [-4, 8, 4],
    thighL: [-18, 0, -4], shinL: [-26, 0, 0], footL: [48, 0, 0],
    thighR: [24, 0, 4], shinR: [-8, 0, 0], footR: [-12, 0, 0],
    armL: [8, 0, 142], foreL: [0, 0, 38], handL: [0, 0, 0],
    armR: [22, 0, -22], foreR: [0, 0, -248], handR: [0, 0, 0] },

  { t: 2.5, // count 6 — settle back, left arm at the top of its sweep
    root: [-0.02, -0.018, -0.03],
    hips: [4, 5, -6], spine: [1, -2, 2], chest: [0, -6, 5], neck: [0, 2, -3], head: [-3, 3, -5],
    thighL: [-8, 0, -5], shinL: [-16, 0, 0], footL: [24, 0, 0],
    thighR: [14, 0, 5], shinR: [-4, 0, 0], footR: [-10, 0, 0],
    armL: [6, 0, 146], foreL: [0, 0, 34], handL: [0, 0, 0],
    armR: [26, 0, -27], foreR: [0, 0, -243], handR: [0, 0, 0] },

  { t: 3.0, // count 7 — right foot under, hips swing the other way
    root: [-0.01, -0.008, 0.0],
    hips: [4, -8, -5], spine: [1, 4, 1], chest: [0, 9, 3], neck: [0, -3, -2], head: [-2, -6, -3],
    thighL: [-2, 0, -4], shinL: [-8, 0, 0], footL: [10, 0, 0],
    thighR: [0, 0, 4], shinR: [-10, 0, 0], footR: [6, 0, 0],
    armL: [10, 0, 139], foreL: [0, 0, 41], handL: [0, 0, 0],
    armR: [22, 0, -24], foreR: [0, 0, -246], handR: [0, 0, 0] },

  { t: 3.5, // count 8 — the "and": arms passing in front of the torso, trading again
    root: [0.0, -0.014, 0.02],
    hips: [4, -12, 0], spine: [1, 6, 0], chest: [0, 12, 0], neck: [0, -4, 0], head: [0, -7, 0],
    thighL: [6, 0, -4], shinL: [-6, 0, 0], footL: [2, 0, 0],
    thighR: [-10, 0, 4], shinR: [-14, 0, 0], footR: [24, 0, 0],
    armL: [14, 0, 40], foreL: [0, 0, 200], handL: [0, 0, 0],
    armR: [18, 0, -95], foreR: [0, 0, -145], handR: [0, 0, 0] },
];

// --- sampler -------------------------------------------------------------

const N = KEYS.length;
const DEG = Math.PI / 180;

// Flatten to [joint][channel][key]; the table above stays the source of truth.
const DATA = {};
for (const name of JOINT_NAMES) {
  DATA[name] = [0, 1, 2].map((c) => Float64Array.from(KEYS, (k) => k[name][c]));
}
const ROOT = [0, 1, 2].map((c) => Float64Array.from(KEYS, (k) => k.root[c]));
const TIMES = Float64Array.from(KEYS, (k) => k.t);

function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

function sampleChannel(arr, t) {
  const time = ((t % LOOP) + LOOP) % LOOP;
  let i = N - 1;
  for (let k = 0; k < N; k++) if (TIMES[k] <= time) i = k;
  const t0 = TIMES[i];
  const t1 = i === N - 1 ? LOOP : TIMES[i + 1];
  const u = t1 === t0 ? 0 : (time - t0) / (t1 - t0);
  const a = arr[(i - 1 + N) % N];
  const b = arr[i];
  const c = arr[(i + 1) % N];
  const d = arr[(i + 2) % N];
  return catmull(a, b, c, d, u);
}

// Degrees, for a human comparing a readout to the table above.
export function sampleDegrees(t) {
  const root = ROOT.map((arr) => sampleChannel(arr, t));
  const joints = {};
  for (const name of JOINT_NAMES) joints[name] = DATA[name].map((arr) => sampleChannel(arr, t));
  return { root, joints };
}

// Radians, ready for Object3D.rotation.
export function sample(t) {
  const { root, joints } = sampleDegrees(t);
  const out = { root, joints: {} };
  for (const name of JOINT_NAMES) out.joints[name] = joints[name].map((v) => v * DEG);
  return out;
}

// Which count (1-8) the time sits on. Kept for the tests and for anyone reading the dance.
export function countAt(t) {
  return Math.floor(((((t % LOOP) + LOOP) % LOOP) / COUNT)) + 1;
}
