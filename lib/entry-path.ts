import * as THREE from "three";

// The door is centered, while the unchanged checkout is on the right.
// Pass through the open doorway before turning toward the checkout aisle.
export const ENTRY_END = new THREE.Vector3(2.25, 1.65, 2.55);
export const ENTRY_LOOK_END = new THREE.Vector3(2.25, 1.65, -1.8);

export function interiorCameraPosition(width: number, height: number) {
  const coverage = width <= 720 ? 1.28 : 1.45;
  const scale = Math.max(1, coverage / (width / height));
  return new THREE.Vector3(ENTRY_END.x, ENTRY_END.y, -0.73 + (ENTRY_END.z + 0.73) * scale);
}

// The camera remains centered until it has cleared the facade and side glass.
const doorwayAndInterior: [number, number, number][] = [
  [0, 2.35, 5.2],
  [0, 1.65, 4.1],
  [0, 1.65, 2.82],
  [0.5, 1.65, 2.72],
  [1.15, 1.65, 2.63],
  [1.75, 1.65, 2.57],
  [ENTRY_END.x, ENTRY_END.y, ENTRY_END.z],
];

export function createEntryPath(start: THREE.Vector3, end: THREE.Vector3 = ENTRY_END) {
  const points = [start.clone()];
  const angle = Math.atan2(start.x, start.z);
  const radius = Math.hypot(start.x, start.z);

  // A rotated exterior view first travels around the shop, outside its base.
  // A direct chord from a side/back view to the door would cut through it.
  if (Math.abs(angle) > 0.35) {
    const safeRadius = Math.max(radius, 16);
    const safeY = Math.max(start.y, 6.5);
    const steps = Math.ceil(Math.abs(angle) / 0.24);
    for (let i = 1; i <= steps; i++) {
      const theta = angle * (1 - i / steps);
      points.push(new THREE.Vector3(Math.sin(theta) * safeRadius, safeY, Math.cos(theta) * safeRadius));
    }
  }

  const frontZ = points.at(-1)!.z;
  const approachY = points.at(-1)!.y;
  // The reset view is level at y=2.7. Keep its initial tangent straight
  // forward; the old y=6.8 waypoint lifted the camera immediately at launch.
  if (frontZ > 18.5) points.push(new THREE.Vector3(0, approachY, 18));
  if (frontZ > 12.5) points.push(new THREE.Vector3(0, approachY, 12));
  if (frontZ > 9.5) points.push(new THREE.Vector3(0, Math.min(approachY, 4.0), 9));
  points.push(...doorwayAndInterior.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  // Fit the portrait destination into the route itself. Scaling its forward
  // travel preserves direction and avoids reaching the desktop pose first.
  if (!end.equals(ENTRY_END)) {
    const depthScale = (start.z - end.z) / (start.z - ENTRY_END.z);
    for (const point of points) point.z = start.z + (point.z - start.z) * depthScale;
    points[points.length - 1].copy(end);
  }
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  // The right-hand turn occupies a short part of the whole route. A denser
  // arc-length table prevents uneven per-frame travel near that bend.
  curve.arcLengthDivisions = 8192;
  curve.updateArcLengths();
  return curve;
}

export function smoothRange(start: number, end: number, value: number) {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

export const ENTRY_CRUISE_SPEED = 9;
// Cruise from the first moving frame, then ease to rest over the final 8%.
const BRAKE_START = 0.92;

// Long render stalls must not be converted into a visible catch-up jump.
// Normal frame intervals preserve cruise speed, with no launch acceleration.
export function advanceEntryTime(elapsed: number, frameDelta: number, duration: number) {
  return Math.min(duration, elapsed + THREE.MathUtils.clamp(frameDelta, 0, 0.05));
}

export function makeEntryTiming(curve: THREE.CatmullRomCurve3) {
  const length = curve.getLength();
  const cruiseDuration = length * BRAKE_START / ENTRY_CRUISE_SPEED;
  // The braking curve has an average speed of half the cruise speed.
  const brakeDuration = 2 * length * (1 - BRAKE_START) / ENTRY_CRUISE_SPEED;
  return { length, cruiseDuration, brakeDuration, duration: cruiseDuration + brakeDuration };
}

export function entryDistanceAtTime(timing: ReturnType<typeof makeEntryTiming>, elapsed: number) {
  if (elapsed <= 0) return 0;
  if (elapsed >= timing.duration) return 1;
  if (elapsed <= timing.cruiseDuration) return elapsed * ENTRY_CRUISE_SPEED / timing.length;
  const t = (elapsed - timing.cruiseDuration) / timing.brakeDuration;
  // q(0)=0, q'(0)=2, q''(0)=0; q(1)=1, q'(1)=q''(1)=0.
  // Position, velocity and acceleration join smoothly at both ends.
  const q = 2 * t - 2 * t ** 3 + t ** 4;
  return BRAKE_START + (1 - BRAKE_START) * q;
}

export function entrySpeedFactorAtTime(timing: ReturnType<typeof makeEntryTiming>, elapsed: number) {
  if (elapsed <= timing.cruiseDuration) return 1;
  if (elapsed >= timing.duration) return 0;
  const t = (elapsed - timing.cruiseDuration) / timing.brakeDuration;
  return 1 - 3 * t ** 2 + 2 * t ** 3;
}
