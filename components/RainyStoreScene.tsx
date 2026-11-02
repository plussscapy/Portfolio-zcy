"use client";

import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import giftLayout from "../lib/gift-box-layout.json";
import { advanceEntryTime, createEntryPath, entryDistanceAtTime, ENTRY_END, ENTRY_LOOK_END, interiorCameraPosition, makeEntryTiming, smoothRange } from "../lib/entry-path";

type Mode = "outside" | "entering" | "inside";
type Season = "spring" | "summer" | "autumn" | "winter";
type Project = { id: string; number: string; color: string; ink: string; title: string; subtitle: string; intro: string; role: string; challenge: string; process: string[]; results: string[] };
type Props = { mode: Mode; season: Season; resetViewKey: number; preloadStage: 0 | 1 | 2; onEnter: () => void; onViewReset: () => boolean; onEntered: () => void; onLightningFlash: () => void; onSelect: (project: Project) => void; onCheckout: () => void; onProfile: () => void; projects: Project[] };

const navy = "#152b38";
const blue = "#4d93bd";
const cream = "#fff0cb";
const trim = "#293b48";

function Box({ position = [0, 0, 0], size, color, emissive, intensity = 0, roughness = 0.7, metalness = 0, opacity = 1, rotation, outline = false, children }: {
  position?: [number, number, number]; size: [number, number, number]; color: string; emissive?: string; intensity?: number; roughness?: number; metalness?: number; opacity?: number; rotation?: [number, number, number]; outline?: boolean; children?: ReactNode;
}) {
  return <mesh position={position} rotation={rotation} castShadow receiveShadow>
    <boxGeometry args={size} />
    <meshStandardMaterial color={color} emissive={emissive || color} emissiveIntensity={intensity} roughness={roughness} metalness={metalness} transparent={opacity < 1} opacity={opacity} onUpdate={(material) => { material.needsUpdate = true; }} />
    {outline && <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(...size)]} /><lineBasicMaterial color="#142936" transparent opacity={0.65} /></lineSegments>}
    {children}
  </mesh>;
}

function Label({ text, position, width = 1.5, height = 0.4, color = "#173047", background, fontSize = 52, rotation, sharp = false, printed = false }: {
  text: string; position: [number, number, number]; width?: number; height?: number; color?: string; background?: string; fontSize?: number; rotation?: [number, number, number]; sharp?: boolean; printed?: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    const scale = sharp ? 2 : 1;
    canvas.width = 1024 * scale; canvas.height = 256 * scale;
    const ctx = canvas.getContext("2d")!;
    if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.fillStyle = color; ctx.font = `${printed ? 700 : 900} ${fontSize * scale}px Arial, sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4 * scale, 970 * scale);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = sharp ? 8 : 2;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    return map;
  }, [text, color, background, fontSize, sharp, printed]);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={position} rotation={rotation}><planeGeometry args={[width, height]} />{printed
    ? <meshStandardMaterial map={texture} transparent={!background} roughness={0.88} metalness={0} toneMapped={false} depthWrite={false} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
    : <meshBasicMaterial map={texture} transparent={!background} side={THREE.DoubleSide} toneMapped={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />}</mesh>;
}

function Glow({ position, color, size, opacity = 0.35 }: { position: [number, number, number]; color: string; size: [number, number]; opacity?: number }) {
  const map = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,.9)");
    gradient.addColorStop(0.25, "rgba(255,255,255,.35)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return <sprite position={position} scale={[size[0], size[1], 1]}>
    <spriteMaterial map={map} color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
  </sprite>;
}

function Tube({ from, to, radius = 0.025, color = trim, emissive, intensity = 0 }: {
  from: [number, number, number]; to: [number, number, number]; radius?: number; color?: string; emissive?: string; intensity?: number;
}) {
  const a = useMemo(() => new THREE.Vector3(...from), [from[0], from[1], from[2]]);
  const b = useMemo(() => new THREE.Vector3(...to), [to[0], to[1], to[2]]);
  const center = useMemo(() => a.clone().add(b).multiplyScalar(0.5), [a, b]);
  const direction = useMemo(() => b.clone().sub(a), [a, b]);
  const rotation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()), [direction]);
  return <mesh position={center} quaternion={rotation}><cylinderGeometry args={[radius, radius, direction.length(), 8]} /><meshStandardMaterial color={color} emissive={emissive || color} emissiveIntensity={intensity} /></mesh>;
}

function CameraController({ mode, resetViewKey, onViewReset, onEntered, entryProgress }: { mode: Mode; resetViewKey: number; onViewReset: () => boolean; onEntered: () => void; entryProgress: { current: number } }) {
  const { camera, gl, size } = useThree();
  const portrait = size.width / size.height < 1.45;
  const mobile = size.width <= 720;
  // Keep the original lens; narrow screens fit the counter by moving back.
  const insideFov = 58;
  const responsiveInside = useMemo(() => interiorCameraPosition(size.width, size.height), [size.width, size.height]);
  // Fit the 18-unit street base, whose front edge is closer than the shop.
  const outsideFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(58 / 2)) * Math.max(1, 1.25 / (size.width / size.height))));
  const entryFov = useRef(58);
  const controls = useRef<OrbitControls | null>(null);
  const entryCurve = useRef<THREE.CatmullRomCurve3 | null>(null);
  const entryTiming = useRef<ReturnType<typeof makeEntryTiming> | null>(null);
  const entryRotation = useRef(new THREE.Quaternion());
  const elapsed = useRef(0);
  const entryFirstFrame = useRef(true);
  const completed = useRef(false);
  const lastResetKey = useRef(0);
  const resetStartedAt = useRef(-1);
  const resetDuration = useRef(900);
  const resetFromPosition = useMemo(() => new THREE.Vector3(), []);
  const resetFromTarget = useMemo(() => new THREE.Vector3(), []);
  const resetLookTarget = useMemo(() => new THREE.Vector3(), []);
  const lookMatrix = useMemo(() => new THREE.Matrix4(), []);
  const lookQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const outside = useMemo(() => new THREE.Vector3(0, 2.7, 23), []);
  const outsideTarget = useMemo(() => new THREE.Vector3(0, 2.7, 0), []);
  const inside = ENTRY_END;
  const insideTarget = ENTRY_LOOK_END;
  const insideRotation = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(inside, insideTarget, new THREE.Vector3(0, 1, 0)),
  ), [inside, insideTarget]);

  useEffect(() => {
    camera.position.copy(outside); camera.lookAt(outsideTarget);
    const orbit = new OrbitControls(camera, gl.domElement);
    orbit.target.copy(outsideTarget);
    orbit.enableDamping = true; orbit.dampingFactor = 0.07;
    orbit.enablePan = false; orbit.minDistance = 14; orbit.maxDistance = 40;
    orbit.minPolarAngle = 0.5; orbit.maxPolarAngle = Math.PI / 2;
    orbit.minAzimuthAngle = -Math.PI * 0.68; orbit.maxAzimuthAngle = Math.PI * 0.68;
    controls.current = orbit;
    return () => { orbit.dispose(); controls.current = null; };
  }, [camera, gl, outside, outsideTarget]);

  useEffect(() => {
    if (mode === "entering") {
      entryFov.current = camera instanceof THREE.PerspectiveCamera ? camera.fov : 58;
      resetStartedAt.current = -1;
      entryCurve.current = createEntryPath(camera.position, responsiveInside);
      entryTiming.current = makeEntryTiming(entryCurve.current);
      entryRotation.current.copy(camera.quaternion);
      entryFirstFrame.current = true;
      elapsed.current = 0; completed.current = false;
      if (controls.current) controls.current.enabled = false;
    }
    if (mode === "outside" && controls.current) {
      resetStartedAt.current = -1;
      entryCurve.current = null; entryTiming.current = null; completed.current = false;
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== outsideFov) { camera.fov = outsideFov; camera.updateProjectionMatrix(); }
      // Consume any orbit inertia before placing the camera. Updating after
      // the snap alone would apply that stale rotation to the new view.
      controls.current.enableDamping = false;
      controls.current.update();
      camera.position.copy(outside);
      controls.current.target.copy(outsideTarget);
      controls.current.update();
      controls.current.enableDamping = true;
      controls.current.enabled = true;
    }
  }, [mode, camera, outside, outsideTarget]);

  useEffect(() => {
    if (mode !== "outside" || resetViewKey === lastResetKey.current || !controls.current) return;
    lastResetKey.current = resetViewKey;
    resetFromPosition.copy(camera.position);
    resetFromTarget.copy(controls.current.target);
    resetDuration.current = camera.position.distanceToSquared(outside) < 0.0004 && controls.current.target.distanceToSquared(outsideTarget) < 0.0004 ? 0 : 900;
    resetStartedAt.current = performance.now();
    controls.current.enabled = false;
  }, [resetViewKey, mode, camera, outside, outsideTarget, resetFromPosition, resetFromTarget]);

  useFrame((_, frameDelta) => {
    if (mode === "outside") {
      entryProgress.current = 0;
      gl.domElement.closest<HTMLElement>(".scene-viewport")?.style.setProperty("--room-edge-opacity", "1");
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== outsideFov) { camera.fov = outsideFov; camera.updateProjectionMatrix(); }
      if (resetStartedAt.current >= 0 && controls.current) {
        const progress = resetDuration.current === 0 ? 1 : Math.min(1, (performance.now() - resetStartedAt.current) / resetDuration.current);
        const eased = 1 - Math.pow(1 - progress, 3);
        camera.position.lerpVectors(resetFromPosition, outside, eased);
        resetLookTarget.lerpVectors(resetFromTarget, outsideTarget, eased);
        camera.lookAt(resetLookTarget);
        if (progress === 1) {
          // Flush the pending orbit delta first, then make the final pose
          // exact so entry starts without a one-frame camera jump.
          controls.current.enableDamping = false;
          controls.current.update();
          camera.position.copy(outside);
          controls.current.target.copy(outsideTarget);
          controls.current.update();
          controls.current.enableDamping = true;
          resetStartedAt.current = -1;
          // Keep input locked when entry is queued; OrbitControls must not
          // regain camera ownership during React's next mode commit.
          controls.current.enabled = !onViewReset();
        }
      } else if (controls.current?.enabled) controls.current.update();
      return;
    }
    if (mode === "entering" && entryCurve.current && entryTiming.current) {
      // Start at the exact reset pose on the first rendered frame. React's
      // mode handoff and scene preparation do not count as travelled time.
      if (entryFirstFrame.current) {
        entryFirstFrame.current = false;
      } else {
        elapsed.current = advanceEntryTime(elapsed.current, frameDelta, entryTiming.current.duration);
      }
      const distance = entryDistanceAtTime(entryTiming.current, elapsed.current);
      entryProgress.current = distance;
      gl.domElement.closest<HTMLElement>(".scene-viewport")?.style.setProperty("--room-edge-opacity", String(mobile ? 1 - 0.65 * smoothRange(0.55, 0.9, distance) : 1));
      entryCurve.current.getPointAt(distance, camera.position);
      lookTarget.set(
        // Look toward the right-side counter at the doorway; as the body
        // follows the aisle, the same target naturally becomes straight ahead.
        insideTarget.x * smoothRange(portrait ? 0.25 : 0.89, portrait ? 0.7 : 0.955, distance),
        // Keep the gaze level while camera height settles toward eye level;
        // a fixed lower target would introduce a separate launch nod.
        camera.position.y,
        insideTarget.z,
      );
      lookQuaternion.setFromRotationMatrix(lookMatrix.lookAt(camera.position, lookTarget, up));
      camera.quaternion.slerpQuaternions(entryRotation.current, lookQuaternion, smoothRange(0, 0.11, distance));
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = THREE.MathUtils.lerp(entryFov.current, insideFov, smoothRange(0, 0.65, distance));
        camera.updateProjectionMatrix();
      }
      if (elapsed.current >= entryTiming.current.duration && !completed.current) {
        camera.position.copy(responsiveInside); camera.quaternion.copy(insideRotation);
        completed.current = true; onEntered();
      }
    } else if (mode === "inside") {
      entryProgress.current = 1;
      gl.domElement.closest<HTMLElement>(".scene-viewport")?.style.setProperty("--room-edge-opacity", mobile ? "0.35" : "1");
      camera.position.copy(responsiveInside); camera.quaternion.copy(insideRotation);
      if (camera instanceof THREE.PerspectiveCamera && camera.fov !== insideFov) { camera.fov = insideFov; camera.updateProjectionMatrix(); }
    }
  });
  return null;
}

function EntryExterior({ mode, entryProgress, children }: { mode: Mode; entryProgress: { current: number }; children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const { size } = useThree();
  const originals = useRef(new WeakMap<THREE.Material, { opacity: number; transparent: boolean; depthWrite: boolean }>());
  const lastAlpha = useRef(1);
  useFrame(() => {
    const alpha = mode === "entering" && size.width / size.height < 1.45 ? 1 - smoothRange(0.45, 0.8, entryProgress.current) : 1;
    if (!group.current || alpha === lastAlpha.current) return;
    group.current.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite || object instanceof THREE.Line)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!originals.current.has(material)) originals.current.set(material, { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite });
        const original = originals.current.get(material)!;
        const transparent = alpha < 1 || original.transparent;
        const depthWrite = alpha < 1 ? false : original.depthWrite;
        const recompile = material.transparent !== transparent || material.depthWrite !== depthWrite;
        material.opacity = original.opacity * alpha;
        material.transparent = transparent;
        material.depthWrite = depthWrite;
        if (recompile) material.needsUpdate = true;
      }
    });
    lastAlpha.current = alpha;
  });
  return <group ref={group} visible={mode !== "inside"}>{children}</group>;
}

const rainDrops = Array.from({ length: 180 }, (_, i) => ({
  x: (((i * 73) % 179) / 179 - 0.5) * 16.8,
  z: (((i * 113) % 181) / 181 - 0.5) * 16.8,
  y: ((i * 37) % 101) / 101 * 8.5,
  speed: 4.8 + (i % 7) * 0.45,
}));

function Rain({ active, count }: { active: boolean; count: number }) {
  const drops = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!active || !drops.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const drop = rainDrops[i];
      dummy.position.set(drop.x, ((drop.y - t * drop.speed) % 8.5 + 8.5) % 8.5 + 0.1, drop.z);
      dummy.rotation.z = -0.19;
      dummy.updateMatrix(); drops.current!.setMatrixAt(i, dummy.matrix);
    }
    drops.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={drops} args={[undefined, undefined, count]} visible={active} frustumCulled={false}>
    <boxGeometry args={[0.008, 0.2, 0.008]} /><meshBasicMaterial color="#9ebed0" transparent opacity={0.43} depthWrite={false} />
  </instancedMesh>;
}

function RainImpacts({ active, count }: { active: boolean; count: number }) {
  const rings = useRef<THREE.InstancedMesh>(null);
  const splashes = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!active || !rings.current || !splashes.current) return;
    for (let i = 0; i < count; i++) {
      const drop = rainDrops[i];
      const distance = ((clock.elapsedTime * drop.speed - drop.y) % 8.5 + 8.5) % 8.5;
      const elapsed = distance / drop.speed;
      const onGround = !(Math.abs(drop.x) < 4.8 && drop.z > -4.2 && drop.z < 3.55);
      const visible = onGround && elapsed < 0.45;
      dummy.position.set(drop.x, 0.036, drop.z);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      const radius = visible ? 0.25 + elapsed * 2.1 : 0.0001;
      dummy.scale.set(radius, radius, radius);
      dummy.updateMatrix(); rings.current.setMatrixAt(i, dummy.matrix);
      for (let j = 0; j < 2; j++) {
        const splashVisible = onGround && elapsed < 0.2;
        dummy.position.set(drop.x + (j ? 0.07 : -0.07), 0.07 + Math.sin(Math.min(1, elapsed / 0.2) * Math.PI) * 0.14, drop.z);
        dummy.rotation.set(0, 0, 0);
        const scale = splashVisible ? 0.8 - elapsed * 3 : 0.0001;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix(); splashes.current.setMatrixAt(i * 2 + j, dummy.matrix);
      }
    }
    rings.current.instanceMatrix.needsUpdate = true;
    splashes.current.instanceMatrix.needsUpdate = true;
  });
  return <group visible={active}>
    <instancedMesh ref={rings} args={[undefined, undefined, count]} frustumCulled={false}>
      <ringGeometry args={[0.08, 0.11, 20]} /><meshBasicMaterial color="#c3e5eb" transparent opacity={0.65} side={THREE.DoubleSide} depthWrite={false} />
    </instancedMesh>
    <instancedMesh ref={splashes} args={[undefined, undefined, count * 2]} frustumCulled={false}>
      <sphereGeometry args={[0.025, 5, 4]} /><meshBasicMaterial color="#d2e8e8" transparent opacity={0.68} depthWrite={false} />
    </instancedMesh>
  </group>;
}

function GlassRain({ active }: { active: boolean }) {
  const streaks = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    if (!active || !streaks.current) return;
    for (let i = 0; i < 28; i++) {
      const x = i < 14 ? -4.42 + i * 0.125 : 2.82 + (i - 14) * 0.125;
      const y = 0.36 + ((i * 0.41 - clock.elapsedTime * (0.36 + (i % 4) * 0.08)) % 3.04 + 3.04) % 3.04;
      dummy.position.set(x, y, 3.492);
      dummy.scale.set(1, 0.6 + (i % 4) * 0.22, 1);
      dummy.updateMatrix(); streaks.current.setMatrixAt(i, dummy.matrix);
    }
    streaks.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={streaks} args={[undefined, undefined, 28]} visible={active} frustumCulled={false}>
    <boxGeometry args={[0.008, 0.3, 0.007]} /><meshBasicMaterial color="#b8d5dc" transparent opacity={0.32} depthWrite={false} />
  </instancedMesh>;
}

function WetReflection({ x, z, width, length, color, phase = 0, active }: { x: number; z: number; width: number; length: number; color: string; phase?: number; active: boolean }) {
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 3, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,.7)");
    gradient.addColorStop(0.4, "rgba(255,255,255,.32)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  useFrame(({ clock }) => {
    if (active && material.current) material.current.opacity = 0.25 + (Math.sin(clock.elapsedTime * 2.1 + phase) + Math.sin(clock.elapsedTime * 3.3 + phase * 2)) * 0.025;
  });
  return <mesh position={[x, 0.027, z]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[width, length]} />
    <meshBasicMaterial ref={material} map={texture} color={color} transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
  </mesh>;
}

const SPRING_BEAM_START: [number, number, number] = [-7.2, 8.8, 5.45];
const SPRING_BEAM_END: [number, number, number] = [1.1, 0.06, 5.55];
const springBeamVector = SPRING_BEAM_END.map((value, index) => value - SPRING_BEAM_START[index]) as [number, number, number];
const springBeamLengthSquared = springBeamVector.reduce((sum, value) => sum + value * value, 0);

function springBeamStrength(x: number, y: number, z: number) {
  const fromStart = [x - SPRING_BEAM_START[0], y - SPRING_BEAM_START[1], z - SPRING_BEAM_START[2]];
  const along = Math.max(0, Math.min(1, fromStart.reduce((sum, value, index) => sum + value * springBeamVector[index], 0) / springBeamLengthSquared));
  const radius = 0.24 + along * 2.15;
  const dx = fromStart[0] - springBeamVector[0] * along;
  const dy = fromStart[1] - springBeamVector[1] * along;
  const dz = fromStart[2] - springBeamVector[2] * along;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Math.max(0, Math.min(1, (radius - distance) / Math.max(0.4, radius * 0.6)));
}

function SpringSunbeam({ active, autumn = false }: { active: boolean; autumn?: boolean }) {
  const beam = useMemo(() => {
    const start = new THREE.Vector3(...SPRING_BEAM_START);
    const end = new THREE.Vector3(...SPRING_BEAM_END);
    const direction = start.clone().sub(end);
    return {
      position: start.add(end).multiplyScalar(0.5),
      rotation: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      height: direction.length(),
    };
  }, []);
  return <group position={beam.position} quaternion={beam.rotation} visible={active}>
    {[0, Math.PI / 3, -Math.PI / 3].map((angle) => <mesh key={angle} rotation={[0, angle, 0]} raycast={() => {}}>
      <planeGeometry args={[8.2, beam.height]} />
      <shaderMaterial key={autumn ? "autumn-beam" : "spring-beam"}
        vertexShader={`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`varying vec2 vUv;
          void main() {
            float down = 1.0 - vUv.y;
            float width = mix(0.025, 1.0, down);
            float across = abs(vUv.x - 0.5) * 2.0 / width;
            float feather = 1.0 - smoothstep(0.0, 1.0, across);
            float ends = smoothstep(0.0, 0.28, down) * (1.0 - smoothstep(0.72, 1.0, down));
            gl_FragColor = ${autumn ? "vec4(1.0, 0.68, 0.39, feather * ends * 0.044)" : "vec4(1.0, 0.87, 0.62, feather * ends * 0.028)"};
          }`}
        transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false}
      />
    </mesh>)}
  </group>;
}

function SpringPetals({ active, compact }: { active: boolean; compact: boolean }) {
  const count = compact ? 60 : 118;
  const settledCount = compact ? 64 : 120;
  const falling = useRef<THREE.InstancedMesh>(null);
  const settled = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const baseColor = useMemo(() => new THREE.Color("#e9a9b9"), []);
  const litColor = useMemo(() => new THREE.Color("#fff8df"), []);
  const petalColor = useMemo(() => new THREE.Color(), []);
  const petal = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.1);
    shape.bezierCurveTo(-0.12, -0.035, -0.1, 0.09, 0, 0.1);
    shape.bezierCurveTo(0.1, 0.09, 0.12, -0.035, 0, -0.1);
    return new THREE.ShapeGeometry(shape, 6);
  }, []);
  useEffect(() => () => petal.dispose(), [petal]);

  useEffect(() => {
    if (!settled.current) return;
    for (let i = 0; i < settledCount; i++) {
      const x = (((i * 67) % 127) / 127 - 0.5) * 12.5;
      const z = i % 5 < 2 ? 3.55 + (i % 4) * 0.19 : 4.48 + ((i * 47) % 131) / 131 * 3.05;
      dummy.position.set(x, z < 4.2 ? 0.142 : 0.035, z);
      dummy.rotation.set(-Math.PI / 2, 0, (i * 1.71) % Math.PI);
      dummy.scale.setScalar(0.72 + (i % 4) * 0.11);
      dummy.updateMatrix(); settled.current.setMatrixAt(i, dummy.matrix);
      const strength = springBeamStrength(x, dummy.position.y, z);
      petalColor.copy(baseColor).lerp(litColor, strength * 0.88);
      settled.current.setColorAt(i, petalColor);
    }
    settled.current.instanceMatrix.needsUpdate = true;
    if (settled.current.instanceColor) settled.current.instanceColor.needsUpdate = true;
  }, [baseColor, dummy, litColor, petalColor, settledCount]);

  useFrame(({ clock }) => {
    if (!active || !falling.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = ((i * 73) % 127) / 127;
      const speed = 0.35 + (i % 5) * 0.07;
      const y = ((seed * 6.2 - t * speed) % 6.2 + 6.2) % 6.2 + 0.16;
      const x = (((i * 53) % 131) / 131 - 0.5) * 12.8 + Math.sin(t * 0.55 + i * 2.1) * 0.38;
      const z = 3.7 + ((i * 37) % 137) / 137 * 3.85;
      dummy.position.set(x, y, z);
      dummy.rotation.set(t * 0.28 + i, t * 0.37 + i * 0.8, Math.sin(t + i) * 0.34);
      dummy.scale.setScalar(0.72 + (i % 3) * 0.13);
      dummy.updateMatrix(); falling.current.setMatrixAt(i, dummy.matrix);
      const strength = springBeamStrength(x, y, z);
      petalColor.copy(baseColor).lerp(litColor, strength);
      falling.current.setColorAt(i, petalColor);
    }
    falling.current.instanceMatrix.needsUpdate = true;
    if (falling.current.instanceColor) falling.current.instanceColor.needsUpdate = true;
  });

  return <group visible={active}>
    <instancedMesh ref={falling} args={[petal, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.96} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={settled} args={[petal, undefined, settledCount]} frustumCulled={false}>
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.94} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function AutumnLeaves({ active, compact }: { active: boolean; compact: boolean }) {
  const count = compact ? 60 : 118;
  const settledCount = compact ? 64 : 120;
  const falling = useRef<THREE.InstancedMesh>(null);
  const settled = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const sunlight = useMemo(() => new THREE.Color("#ffd889"), []);
  const leafColors = useMemo(() => ["#bd5937", "#d8793e", "#e6a34f", "#a94c34"].map((value) => new THREE.Color(value)), []);
  const leaf = useMemo(() => {
    const shape = new THREE.Shape();
    // Iroha-momiji: seven narrow palmate lobes with deep clefts and toothed edges.
    // Keep the silhouette as geometry so it stays sharp without adding textures.
    const lobes = [
      { angle: 194, length: 0.16 }, { angle: 160, length: 0.21 },
      { angle: 125, length: 0.24 }, { angle: 90, length: 0.27 },
      { angle: 55, length: 0.24 }, { angle: 20, length: 0.21 },
      { angle: -14, length: 0.16 },
    ];
    const outline: [number, number][] = [[0, -0.18], [-0.007, -0.18], [-0.012, -0.025]];
    const polar = (angle: number, radius: number): [number, number] => {
      const radians = angle * Math.PI / 180;
      return [Math.cos(radians) * radius, Math.sin(radians) * radius];
    };
    for (let i = 0; i < lobes.length; i++) {
      const { angle, length } = lobes[i];
      const edge: [number, number][] = [
        [0.36, 15], [0.5, 13], [0.56, 17], [0.61, 9],
        [0.72, 12], [0.77, 5], [0.88, 6], [1, 0],
        [0.88, -6], [0.77, -5], [0.72, -12], [0.61, -9],
        [0.56, -17], [0.5, -13], [0.36, -15],
      ];
      edge.forEach(([distance, spread]) => outline.push(polar(angle + spread, length * distance)));
      if (i < lobes.length - 1) outline.push(polar((angle + lobes[i + 1].angle) / 2, 0.065));
    }
    outline.push([0.012, -0.025], [0.007, -0.18]);
    shape.moveTo(...outline[0]);
    outline.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);
  useEffect(() => () => leaf.dispose(), [leaf]);

  useEffect(() => {
    if (!settled.current) return;
    for (let i = 0; i < settledCount; i++) {
      const x = (((i * 67) % 127) / 127 - 0.5) * 12.5;
      const z = i % 5 < 2 ? 3.55 + (i % 4) * 0.19 : 4.48 + ((i * 47) % 131) / 131 * 3.05;
      dummy.position.set(x, z < 4.2 ? 0.145 : 0.038, z);
      dummy.rotation.set(-Math.PI / 2, 0, (i * 1.71) % Math.PI);
      dummy.scale.setScalar(0.78 + (i % 4) * 0.1);
      dummy.updateMatrix(); settled.current.setMatrixAt(i, dummy.matrix);
      color.copy(leafColors[i % leafColors.length]).lerp(sunlight, springBeamStrength(x, dummy.position.y, z) * 0.45);
      settled.current.setColorAt(i, color);
    }
    settled.current.instanceMatrix.needsUpdate = true;
    if (settled.current.instanceColor) settled.current.instanceColor.needsUpdate = true;
  }, [color, dummy, leafColors, settledCount, sunlight]);

  useFrame(({ clock }) => {
    if (!active || !falling.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = ((i * 73) % 127) / 127;
      const speed = 0.34 + (i % 5) * 0.075;
      const y = ((seed * 6.2 - t * speed) % 6.2 + 6.2) % 6.2 + 0.16;
      const x = (((i * 53) % 131) / 131 - 0.5) * 12.8 + Math.sin(t * 0.65 + i * 2.1) * 0.52;
      const z = 3.7 + ((i * 37) % 137) / 137 * 3.85;
      dummy.position.set(x, y, z);
      dummy.rotation.set(t * 0.32 + i, t * 0.43 + i * 0.8, Math.sin(t + i) * 0.4);
      dummy.scale.setScalar(0.8 + (i % 3) * 0.13);
      dummy.updateMatrix(); falling.current.setMatrixAt(i, dummy.matrix);
      color.copy(leafColors[i % leafColors.length]).lerp(sunlight, springBeamStrength(x, y, z) * 0.68);
      falling.current.setColorAt(i, color);
    }
    falling.current.instanceMatrix.needsUpdate = true;
    if (falling.current.instanceColor) falling.current.instanceColor.needsUpdate = true;
  });

  return <group visible={active}>
    <instancedMesh ref={falling} args={[leaf, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.96} depthWrite={false} toneMapped={false} />
    </instancedMesh>
    <instancedMesh ref={settled} args={[leaf, undefined, settledCount]} frustumCulled={false}>
      <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} transparent opacity={0.96} depthWrite={false} toneMapped={false} />
    </instancedMesh>
  </group>;
}

function WinterSnowflakes({ active, compact }: { active: boolean; compact: boolean }) {
  const count = compact ? 60 : 118; // Match spring's falling petal count.
  const flakes = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => {
    const outline = new THREE.Shape();
    for (let i = 0; i < 24; i++) {
      const angle = i * Math.PI / 12;
      const radius = i % 4 === 0 ? 0.075 : i % 2 === 0 ? 0.026 : 0.016;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) outline.moveTo(x, y);
      else outline.lineTo(x, y);
    }
    outline.closePath();
    return new THREE.ShapeGeometry(outline);
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(({ clock, camera }) => {
    if (!active || !flakes.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const seed = ((i * 73) % 127) / 127;
      const speed = 0.24 + (i % 5) * 0.045;
      const y = ((seed * 6.4 - t * speed) % 6.4 + 6.4) % 6.4 + 0.15;
      const x = (((i * 53) % 131) / 131 - 0.5) * 13.2 + Math.sin(t * 0.6 + i * 2.1) * 0.42;
      const z = 3.65 + ((i * 37) % 137) / 137 * 4.0;
      dummy.position.set(x, y, z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.rotateZ(t * (i % 2 ? 0.23 : -0.19) + i);
      dummy.scale.setScalar(0.68 + (i % 4) * 0.12);
      dummy.updateMatrix();
      flakes.current.setMatrixAt(i, dummy.matrix);
    }
    flakes.current.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={flakes} args={[geometry, undefined, count]} visible={active} frustumCulled={false}>
    <meshBasicMaterial color="#f2f8ff" side={THREE.DoubleSide} transparent opacity={0.92} depthWrite={false} toneMapped={false} />
  </instancedMesh>;
}

function SnowCap({ position, size, material }: { position: [number, number, number]; size: [number, number, number]; material: THREE.Material }) {
  const geometry = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 4, Math.min(size[1] * 0.48, size[2] * 0.42, 0.055)), [size[0], size[1], size[2]]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh position={position} geometry={geometry} material={material} receiveShadow />;
}

function WinterSnowCover({ active }: { active: boolean }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#f4f8fb";
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 420; i++) {
      const x = (i * 83.17) % 128;
      const y = (i * 47.71) % 128;
      ctx.fillStyle = i % 3 ? "rgba(167,190,206,0.13)" : "rgba(255,255,255,0.7)";
      ctx.fillRect(x, y, i % 5 ? 1 : 2, i % 5 ? 1 : 2);
    }
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ map: texture, roughness: 0.98, metalness: 0, emissive: new THREE.Color("#566b80"), emissiveIntensity: 0.08 }), [texture]);
  useEffect(() => () => { material.dispose(); texture.dispose(); }, [material, texture]);
  return <group visible={active}>
    {/* Thin, rounded layers follow existing exterior surfaces; no prop geometry is changed. */}
    {/* The two raised sidewalks top out at y=0.10; these caps sink slightly into them. */}
    <SnowCap position={[-6.75, 0.124, -0.25]} size={[3.76, 0.054, 10.76]} material={material} />
    <SnowCap position={[6.7, 0.124, -0.25]} size={[3.84, 0.054, 10.76]} material={material} />
    <SnowCap position={[0, 5.857, -0.47]} size={[8.72, 0.074, 6.9]} material={material} />
    {[[-3.2, -2.15, 1.05, 0.51], [-1.55, 0.38, 1.38, 0.62], [1.14, -2.85, 1.08, 0.43], [2.9, 0.8, 1.15, 0.58], [0.1, 2.1, 1.55, 0.52]].map(([x, z, w, d], i) => <mesh key={`roof-drift-${i}`} position={[x, 5.894, z]} scale={[w, 0.04 + (i % 3) * 0.008, d]} material={material}>
      <sphereGeometry args={[1, 20, 10]} />
    </mesh>)}
    <SnowCap position={[0, 5.715, 3.19]} size={[9.35, 0.075, 0.32]} material={material} />
    <SnowCap position={[0, 3.915, 3.69]} size={[9.37, 0.08, 0.94]} material={material} />
    {[-3.8, -2.15, -0.45, 1.35, 3.25].map((x, i) => <mesh key={`awning-drift-${i}`} position={[x, 3.96, 4.09]} scale={[0.86 + (i % 2) * 0.22, 0.055 + (i % 3) * 0.012, 0.22]} material={material}>
      <sphereGeometry args={[1, 20, 10]} />
    </mesh>)}
    <SnowCap position={[-3.27, 0.177, 4.14]} size={[4.04, 0.065, 0.16]} material={material} />
    <SnowCap position={[3.27, 0.177, 4.14]} size={[4.04, 0.065, 0.16]} material={material} />
    {[-4.85, -3.8, -2.35, 2.25, 3.55, 4.85].map((x, i) => <mesh key={`curb-drift-${i}`} position={[x, 0.205, 4.12]} scale={[0.42 + (i % 3) * 0.09, 0.047 + (i % 2) * 0.012, 0.14]} material={material}>
      <sphereGeometry args={[1, 16, 8]} />
    </mesh>)}
    {/* Bin lids: entrance pair plus the collection bins beside and behind the store. */}
    {[5.05, 5.67].map((x) => <SnowCap key={`entrance-bin-${x}`} position={[x, 1.036, 3.85]} size={[0.54, 0.052, 0.5]} material={material} />)}
    <SnowCap position={[6.1, 0.879, -1]} size={[0.86, 0.052, 0.63]} material={material} />
    <SnowCap position={[6.28, 1.45, -1.12]} size={[0.65, 0.052, 0.46]} material={material} />
    <SnowCap position={[6.17, 1.002, -3.69]} size={[0.53, 0.05, 0.55]} material={material} />
    <mesh position={[5.62, 0.73, -3.69]} scale={[0.25, 0.033, 0.25]} material={material}><sphereGeometry args={[1, 16, 8]} /></mesh>
    {/* Light heads, not the glowing lens or the vertical poles. */}
    <SnowCap position={[-6.13, 5.521, 3.15]} size={[0.36, 0.05, 0.34]} material={material} />
    <SnowCap position={[6.25, 5.835, -3.4]} size={[0.57, 0.05, 0.43]} material={material} />
    {/* Vending-machine roof and ledge. */}
    <SnowCap position={[-5.65, 2.617, 2.03]} size={[1.32, 0.07, 0.78]} material={material} />
    <mesh position={[-5.65, 2.655, 2.15]} scale={[0.54, 0.04, 0.28]} material={material}><sphereGeometry args={[1, 18, 10]} /></mesh>
    {/* Match the bicycle's existing transform so the snow stays on its seat, rack and basket. */}
    <group position={[-6.25, 0.14, 3.48]} rotation={[0, -0.25, 0]} scale={0.84}>
      <SnowCap position={[-0.3, 1.659, 0]} size={[0.45, 0.045, 0.22]} material={material} />
      <SnowCap position={[-1.03, 1.386, -0.18]} size={[0.67, 0.045, 0.3]} material={material} />
      {[-0.31, 0.31].map((z) => <SnowCap key={`basket-side-${z}`} position={[1.065, 1.755, z]} size={[0.67, 0.035, 0.055]} material={material} />)}
      <SnowCap position={[1.4, 1.755, 0]} size={[0.052, 0.035, 0.62]} material={material} />
      {[-0.7, 0.73].map((x) => <mesh key={`fender-snow-${x}`} position={[x, 1.091, 0]} scale={[0.32, 0.025, 0.08]} material={material}><sphereGeometry args={[1, 14, 8]} /></mesh>)}
    </group>
  </group>;
}

function SpringLight({ active, autumn = false }: { active: boolean; autumn?: boolean }) {
  const glow = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 5, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,.65)");
    gradient.addColorStop(0.55, "rgba(255,255,255,.3)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glow.dispose(), [glow]);
  return <group visible={active}>
    {/* Fixed diagonal pools of sunlight and soft awning shadows; no shadow-map redraw. */}
    {[[1.7, 5.2, 8.3, 4.4], [-3.3, 2.9, 3.2, 2.5]].map(([x, z, w, h], i) => <mesh key={`sun-${i}`} position={[x, z < 4 ? 0.153 : 0.042, z]} rotation={[-Math.PI / 2, 0, -0.22]}>
      <planeGeometry args={[w, h]} /><meshBasicMaterial map={glow} color={autumn ? "#e99545" : "#ffe1a4"} transparent opacity={autumn ? (i ? 0.5 : 0.62) : (i ? 0.6 : 0.82)} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>)}
    {[[-3.0, 4.73, 2.2, 0.7], [2.9, 4.92, 2.9, 0.8]].map(([x, z, w, h], i) => <mesh key={`shade-${i}`} position={[x, 0.045, z]} rotation={[-Math.PI / 2, 0, -0.32]}>
      <planeGeometry args={[w, h]} /><meshBasicMaterial map={glow} color={autumn ? "#765644" : "#605858"} transparent opacity={0.28} depthWrite={false} />
    </mesh>)}
    {[-3.62, 3.62].map((x, i) => <mesh key={`frontlight-${x}`} position={[x, 4.64, 3.592]} rotation={[0, 0, -0.2]}>
      <planeGeometry args={[2.0, 1.24]} /><meshBasicMaterial map={glow} color={autumn ? "#ffb775" : "#ffeacf"} transparent opacity={autumn ? (i ? 0.35 : 0.43) : (i ? 0.15 : 0.18)} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>)}
    <mesh position={[-1.9, 5.83, 0.75]} rotation={[-Math.PI / 2, 0, -0.24]}>
      <planeGeometry args={[5.4, 3.7]} /><meshBasicMaterial map={glow} color={autumn ? "#ffb977" : "#ffeacf"} transparent opacity={autumn ? 0.22 : 0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
    </mesh>
  </group>;
}

function Street({ spring, rainy, winter }: { spring: boolean; rainy: boolean; winter: boolean }) {
  return <group>
    <Box position={[0, -0.65, 0]} size={[18, 1.1, 18]} color={spring ? "#39434b" : "#122b38"} outline />
    <Box position={[0, -0.08, 0]} size={[17.8, 0.06, 17.8]} color={spring ? "#f4f5f3" : "#253845"} emissive={spring ? "#f4f5f3" : undefined} intensity={spring ? 0.55 : 0} roughness={spring ? 0.88 : 0.46} />
    <Box position={[0, -0.025, 5.7]} size={[17.8, 0.025, 6.35]} color={spring ? "#62666c" : winter ? "#344651" : "#3a5460"} emissive={spring ? "#62666c" : undefined} intensity={spring ? 0.32 : 0} roughness={spring || winter ? 0.9 : 0.14} metalness={spring || winter ? 0 : 0.38} />
    <Box position={[-6.75, 0.025, -0.25]} size={[3.8, 0.15, 10.9]} color={spring ? "#f6f7f5" : "#788b91"} emissive={spring ? "#f6f7f5" : undefined} intensity={spring ? 0.55 : 0} />
    <Box position={[6.7, 0.025, -0.25]} size={[3.9, 0.15, 10.9]} color={spring ? "#f6f7f5" : "#72858b"} emissive={spring ? "#f6f7f5" : undefined} intensity={spring ? 0.55 : 0} />
    <Box position={[0, 0.04, 3.62]} size={[10.7, 0.16, 1.18]} color={spring ? "#f6f7f5" : "#858e8b"} emissive={spring ? "#f6f7f5" : undefined} intensity={spring ? 0.55 : 0} />
    <Box position={[0, 0.11, 4.14]} size={[10.7, 0.06, 0.12]} color={spring ? "#e5e8e7" : "#c4c2ad"} />
    {Array.from({ length: 7 }, (_, i) => <Box key={`cross-${i}`} position={[-3.9 + i * 1.3, 0.014, 6.08]} size={[0.67, 0.015, 2.6]} color={spring ? "#f5f7f6" : "#c2ccd0"} emissive={spring ? "#f5f7f6" : undefined} intensity={spring ? 0.35 : 0} roughness={spring ? 0.8 : 0.23} opacity={0.87} />)}
    <group visible={rainy}>
    {([[-3.2, 6.3, 0.75, 2.6, "#5daeca"], [-1.7, 5.82, 0.5, 1.7, "#e6be7e"], [0.35, 6.75, 0.85, 2.7, "#6bbdd1"], [2.45, 5.76, 0.64, 2.1, "#f1cd8d"], [-6.15, 5.58, 0.48, 2.5, "#f37b98"]] as [number, number, number, number, string][]).map(([x, z, w, h, color], i) =>
      <WetReflection key={`reflection-${i}`} x={x} z={z} width={w} length={h} color={color} phase={i * 1.7} active={rainy} />)}
    <WetReflection x={0} z={5.06} width={4.75} length={1.45} color="#f5d59a" phase={0.8} active={rainy} />
    <WetReflection x={-5.35} z={6.9} width={1.55} length={2.15} color="#9dd4e1" phase={2.1} active={rainy} />
    </group>
    {[-6.5, -5.2, -3.9, 3.8, 5.1, 6.4].map((x, i) => <Box key={`pavement-seam-${i}`} position={[x, 0.11, 3.64]} size={[0.018, 0.005, 1.06]} color="#4b6971" opacity={0.64} />)}
    {[-5.25, -4.1, 4.1, 5.28].map((x, i) => <Box key={`curb-inset-${i}`} position={[x, 0.1, 4.19]} size={[0.03, 0.012, 0.12]} color="#536b72" />)}
    {[-6.5, -5.9, -5.3, 5.7, 6.35].map((x, i) => <Box key={`drain-${i}`} position={[x, 0.075, 3.47]} size={[0.4, 0.024, 0.22]} color="#26353c" />)}
    {[-4.2, -3.7, -3.2, -2.7, -2.2, -1.7].map((x) => <Box key={x} position={[x, 0.078, 3.47]} size={[0.04, 0.03, 0.2]} color="#829198" />)}
    {[[-7, 2.45], [6.6, 2.5]].map(([x, z], i) => <group key={`rail-${i}`}>
      {[0, 1.05, 2.1].map((d) => <Tube key={d} from={[x, 0.12, z - d]} to={[x, 0.85, z - d]} radius={0.035} color="#b0bab5" />)}
      <Tube from={[x, 0.82, z]} to={[x, 0.82, z - 2.1]} radius={0.035} color="#b0bab5" />
    </group>)}
  </group>;
}

function StreetProps({ spring }: { spring: boolean }) {
  const signal = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => { if (signal.current) (signal.current.material as THREE.MeshStandardMaterial).emissiveIntensity = spring ? 0.18 : 0.3 + (Math.sin(clock.elapsedTime * 0.7) > 0.7 ? 1 : 0); });
  return <group>
    <group position={[-7.5, 0, 3.15]}>
      <mesh position={[0, 2.95, 0]}><cylinderGeometry args={[0.065, 0.09, 5.9, 10]} /><meshStandardMaterial color="#465961" /></mesh>
      <Tube from={[0, 5.68, 0]} to={[1.35, 5.52, 0]} radius={0.048} color="#465961" />
      <Box position={[1.37, 5.43, 0]} size={[0.34, 0.13, 0.34]} color="#f4d596" emissive="#f4d596" intensity={spring ? 0.12 : 1.1} />
      <Glow position={[1.35, 5.43, 0.5]} color="#ffd8a0" size={[2.5, 2.5]} opacity={spring ? 0.05 : 0.42} />
      <pointLight position={[1.35, 5.4, 0]} color="#f0c685" intensity={spring ? 0.2 : 7} distance={7} />
      <Box position={[0.02, 3.1, 0.08]} size={[0.4, 0.58, 0.28]} color="#2e3b42" />
      <mesh ref={signal} position={[0.02, 3.15, 0.24]}><sphereGeometry args={[0.1, 12, 8]} /><meshStandardMaterial color="#e67d69" emissive="#f45c54" emissiveIntensity={1} /></mesh>
      <mesh position={[0.02, 2.94, 0.24]}><sphereGeometry args={[0.1, 12, 8]} /><meshStandardMaterial color="#3c6157" emissive="#50cf9d" emissiveIntensity={0.08} /></mesh>
    </group>
    <group position={[7.45, 0, -3.4]}>
      <mesh position={[0, 3.2, 0]}><cylinderGeometry args={[0.1, 0.16, 6.4, 10]} /><meshStandardMaterial color="#485960" /></mesh>
      <Tube from={[0, 5.8, 0]} to={[-1.2, 5.8, 0]} radius={0.05} color="#54636a" />
      <Box position={[-1.2, 5.7, 0]} size={[0.6, 0.22, 0.45]} color="#667579" />
      <Box position={[0.25, 4.72, 0]} size={[0.56, 0.38, 0.04]} color="#2c72a0" />
      <Label text="青葉通り" position={[0.25, 4.72, 0.027]} width={0.54} height={0.22} color="#f5f7ec" fontSize={48} />
      {[-1, 0, 1].map((i) => <Tube key={i} from={[-8.5, 6.45 + i * 0.16, -6.6]} to={[0, 6.05 + i * 0.12, 0]} radius={0.008} color="#526a71" />)}
      <Tube from={[0, 6.05, 0]} to={[-7.55, 5.8, 6]} radius={0.008} color="#526a71" />
    </group>
    <group position={[6.25, 0, 4.03]}>
      <Box position={[0, 0.47, 0]} size={[0.52, 0.94, 0.5]} color={spring ? "#988671" : "#40515b"} />
      <Box position={[0, 0.94, 0]} size={[0.61, 0.08, 0.58]} color={spring ? "#d1c4ad" : "#becbd0"} />
      <Label text="P" position={[0, 0.56, 0.256]} width={0.25} height={0.33} color={spring ? "#fff5df" : "#d7e4e5"} fontSize={92} />
    </group>
  </group>;
}

function VendingMachine({ spring }: { spring: boolean }) {
  return <group position={[-5.65, 0.08, 2.03]}>
    <Box position={[0, 1.25, 0]} size={[1.35, 2.5, 0.8]} color="#e6edf0" outline />
    <Box position={[0, 2.33, 0.415]} size={[1.22, 0.26, 0.04]} color="#e94c63" emissive="#ed445f" intensity={spring ? 0.08 : 0.45} />
    <Label text="DRINKS" position={[0, 2.33, 0.443]} width={1.08} height={0.17} color="#fff7e1" fontSize={46} />
    <Box position={[-0.07, 1.52, 0.415]} size={[1.03, 1.26, 0.045]} color="#2c566d" emissive="#8cc6e0" intensity={spring ? 0.04 : 0.25} />
    {[0, 1, 2].map((row) => Array.from({ length: 5 }, (_, col) => <group key={`${row}-${col}`} position={[-0.48 + col * 0.2, 1.92 - row * 0.34, 0.47]}>
      <mesh><cylinderGeometry args={[0.062, 0.065, 0.22, 8]} /><meshStandardMaterial color={["#e6b59c", "#a1c6cf", "#f1d182", "#c2daaa", "#e8a1a1"][(col + row) % 5]} /></mesh>
      <Box position={[0, 0.075, 0]} size={[0.12, 0.055, 0.13]} color="#f1efe2" />
    </group>))}
    <Box position={[-0.22, 0.57, 0.42]} size={[0.55, 0.13, 0.045]} color="#243a43" />
    <Box position={[0.42, 0.83, 0.43]} size={[0.22, 0.27, 0.025]} color="#526973" />
    {[0, 1, 2].map((row) => <Box key={`button-${row}`} position={[0.41, 1.31 - row * 0.12, 0.451]} size={[0.13, 0.04, 0.018]} color={row === 1 ? "#e5c586" : "#b6ced2"} emissive={row === 1 ? "#f0c779" : "#acd7df"} intensity={0.28} />)}
    <Box position={[0.43, 0.37, 0.444]} size={[0.32, 0.22, 0.018]} color="#283f49" />
    <Box position={[0, 0.045, 0.08]} size={[1.42, 0.09, 0.89]} color="#9aafb2" />
    <Glow position={[0, 1.8, 0.68]} color="#95d8ec" size={[1.5, 2.6]} opacity={spring ? 0.04 : 0.26} />
    <pointLight position={[0, 1.7, 0.62]} intensity={spring ? 0.2 : 2.4} distance={3} color="#a5def5" />
  </group>;
}

function BikeWheel({ x }: { x: number }) {
  const spokes = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i < 20; i++) {
      const angle = i * Math.PI / 10;
      points.push(0, 0, i % 2 ? 0.018 : -0.018, Math.cos(angle) * 0.452, Math.sin(angle) * 0.452, i % 2 ? -0.018 : 0.018);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, []);
  useEffect(() => () => spokes.dispose(), [spokes]);
  return <group position={[x, 0.53, 0]}>
    <mesh><torusGeometry args={[0.49, 0.047, 10, 48]} /><meshStandardMaterial color="#1b292e" roughness={0.82} /></mesh>
    <mesh><torusGeometry args={[0.443, 0.012, 8, 48]} /><meshStandardMaterial color="#adb9b7" metalness={0.7} roughness={0.28} /></mesh>
    <lineSegments geometry={spokes}><lineBasicMaterial color="#a6b5b6" transparent opacity={0.82} /></lineSegments>
    <mesh rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.08, 0.08, 0.16, 14]} /><meshStandardMaterial color="#718b91" metalness={0.6} /></mesh>
    <mesh rotation={[0, 0, -0.18]}><torusGeometry args={[0.55, 0.027, 8, 44, Math.PI * 1.18]} /><meshStandardMaterial color="#bdd1cd" metalness={0.34} roughness={0.4} /></mesh>
  </group>;
}

function Bicycle({ spring }: { spring: boolean }) {
  const frame = spring ? "#d9d4c8" : "#a8c9bd";
  const metal = spring ? "#b7b3aa" : "#aab9b7";
  return <group position={[-6.25, 0.14, 3.48]} rotation={[0, -0.25, 0]} scale={0.84}>
    <BikeWheel x={-0.7} /><BikeWheel x={0.73} />
    {/* Low step-through city frame, with a real fork and chain case. */}
    <Tube from={[-0.7, 0.53, 0]} to={[-0.2, 1.3, 0]} radius={0.039} color={frame} />
    <Tube from={[-0.7, 0.53, 0]} to={[-0.05, 0.64, 0]} radius={0.036} color={frame} />
    <Tube from={[-0.2, 1.3, 0]} to={[-0.05, 0.64, 0]} radius={0.043} color={frame} />
    <Tube from={[-0.05, 0.64, 0]} to={[0.41, 1.3, 0]} radius={0.044} color={frame} />
    <Tube from={[-0.2, 1.3, 0]} to={[0.17, 1.15, 0]} radius={0.03} color={frame} />
    <Tube from={[0.17, 1.15, 0]} to={[0.41, 1.3, 0]} radius={0.03} color={frame} />
    <Tube from={[0.41, 1.3, 0]} to={[0.73, 0.53, 0]} radius={0.035} color={metal} />
    <Tube from={[0.43, 1.27, 0.07]} to={[0.73, 0.53, 0.07]} radius={0.022} color={metal} />
    <Tube from={[-0.2, 1.3, 0]} to={[-0.25, 1.55, 0]} radius={0.025} color={metal} />
    <Box position={[-0.3, 1.6, 0]} size={[0.48, 0.075, 0.24]} color="#514846" roughness={0.9} />
    <Tube from={[0.41, 1.3, 0]} to={[0.4, 1.6, 0]} radius={0.027} color={metal} />
    <Tube from={[0.39, 1.6, 0]} to={[0.72, 1.65, 0]} radius={0.025} color={metal} />
    <Tube from={[0.66, 1.65, -0.22]} to={[0.66, 1.65, 0.22]} radius={0.024} color={metal} />
    {[-0.23, 0.23].map((z) => <Box key={z} position={[0.68, 1.65, z]} size={[0.15, 0.055, 0.08]} color="#433f3d" />)}
    <mesh position={[-0.05, 0.64, 0.085]}><torusGeometry args={[0.15, 0.02, 8, 24]} /><meshStandardMaterial color="#70858a" metalness={0.65} /></mesh>
    <Tube from={[-0.62, 0.51, 0.105]} to={[-0.05, 0.64, 0.105]} radius={0.038} color="#c4d1c8" />
    <Tube from={[-0.05, 0.64, 0.105]} to={[-0.03, 0.42, 0.105]} radius={0.017} color="#68777b" />
    <Box position={[-0.02, 0.39, 0.16]} size={[0.23, 0.04, 0.12]} color="#343c3d" />
    <Tube from={[-0.72, 0.58, 0.08]} to={[-0.48, 0.08, 0.25]} radius={0.018} color="#66787b" />
    <Tube from={[-1.07, 1.31, -0.18]} to={[-0.23, 1.31, -0.18]} radius={0.023} color={metal} />
    {[-1.02, -0.45].map((x) => <Tube key={x} from={[x, 1.28, -0.18]} to={[x + 0.17, 0.9, -0.18]} radius={0.016} color={metal} />)}
    <Box position={[-1.03, 1.34, -0.18]} size={[0.7, 0.045, 0.33]} color="#667d7e" />
    {/* Open wire shopping basket: meshwork remains legible from the front view. */}
    <Tube from={[0.67, 1.35, -0.27]} to={[1.39, 1.35, -0.27]} radius={0.015} color={metal} />
    <Tube from={[0.67, 1.35, 0.27]} to={[1.39, 1.35, 0.27]} radius={0.015} color={metal} />
    {[0.75, 1.35].map((x) => <Tube key={x} from={[x, 1.35, -0.27]} to={[x, 1.35, 0.27]} radius={0.015} color={metal} />)}
    {[0.76, 0.96, 1.16, 1.36].map((x) => <group key={x}>
      <Tube from={[x, 1.36, -0.27]} to={[x, 1.72, -0.31]} radius={0.012} color={metal} />
      <Tube from={[x, 1.36, 0.27]} to={[x, 1.72, 0.31]} radius={0.012} color={metal} />
    </group>)}
    <Tube from={[0.73, 1.73, -0.31]} to={[1.4, 1.73, -0.31]} radius={0.018} color={metal} />
    <Tube from={[0.73, 1.73, 0.31]} to={[1.4, 1.73, 0.31]} radius={0.018} color={metal} />
    <Tube from={[1.4, 1.73, -0.31]} to={[1.4, 1.73, 0.31]} radius={0.018} color={metal} />
    <Box position={[0.93, 1.18, 0]} size={[0.27, 0.16, 0.19]} color="#f2e9cb" emissive="#ffe9ab" intensity={0.22} />
    <Box position={[-1.13, 0.73, 0]} size={[0.1, 0.17, 0.12]} color="#d45e5d" emissive="#cf585a" intensity={0.25} />
  </group>;
}

function EntranceProps({ spring }: { spring: boolean }) {
  return <group>
    {[-3.8, -3.53, -3.26].map((x) => <group key={x} position={[x, 0, 3.73]}>
      <mesh position={[0, 0.52, 0]}><cylinderGeometry args={[0.1, 0.11, 1.03, 12]} /><meshStandardMaterial color="#3b4e58" /></mesh>
      <mesh position={[0, 1.02, 0]} rotation={[0, 0, x * 0.04]}><coneGeometry args={[0.27, 0.65, 10]} /><meshStandardMaterial color={x < -3.5 ? "#d6c397" : "#7eaac1"} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 1.32, 0]}><sphereGeometry args={[0.05, 10, 8]} /><meshStandardMaterial color="#e7e1c9" /></mesh>
    </group>)}
    <Box position={[-3.53, 0.32, 3.72]} size={[0.92, 0.47, 0.41]} color="#263b46" />
    <group position={[5.05, 0, 3.85]}>
      {[0, 0.62].map((x) => <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, 0.48, 0]}><cylinderGeometry args={[0.24, 0.19, 0.96, 12]} /><meshStandardMaterial color={spring ? "#bca98e" : "#809296"} emissive={spring ? "#ad8d65" : "#000000"} emissiveIntensity={spring ? 0.18 : 0} /></mesh>
        <mesh position={[0, 0.98, 0]}><cylinderGeometry args={[0.27, 0.27, 0.06, 12]} /><meshStandardMaterial color={spring ? "#786b5a" : "#344a51"} /></mesh>
      </group>)}
    </group>
    <group position={[-5.55, 0, -2.2]}>
      <Box position={[0, 0.7, 0]} size={[1.1, 1.4, 0.25]} color="#425761" />
      <Box position={[0, 0.72, 0.145]} size={[0.93, 1.12, 0.025]} color="#ddd8c0" />
      {[-0.3, 0, 0.3].map((x, i) => <Box key={i} position={[x, 0.82, 0.166]} size={[0.22, 0.64, 0.008]} color={["#80adbd", "#e9ba80", "#b8c8a9"][i]} />)}
      <Box position={[0, 1.47, 0]} size={[1.25, 0.09, 0.4]} color="#344752" />
    </group>
  </group>;
}

function InteriorStock({ position, rotation = [0, 0, 0], length = 2.3, levels = 3 }: { position: [number, number, number]; rotation?: [number, number, number]; length?: number; levels?: number }) {
  return <group position={position} rotation={rotation}>
    <Box position={[0, 1.04, 0]} size={[length, 2.1, 0.68]} color="#d5d9d0" />
    {Array.from({ length: levels }, (_, level) => <group key={level} position={[0, 0.48 + level * 0.65, 0.37]}>
      <Box position={[0, -0.25, 0]} size={[length + 0.08, 0.07, 0.8]} color="#8babb1" />
      {Array.from({ length: Math.floor(length * 6) }, (_, i) => {
        const x = -length / 2 + 0.13 + i * (length - 0.26) / (Math.floor(length * 6) - 1);
        const colors = ["#d9a7a0", "#e5c97a", "#aac7ad", "#a8c5cf", "#dcbbb0"];
        return <Box key={i} position={[x, 0, 0.05]} size={[0.12, 0.42 + ((i + level) % 3) * 0.035, 0.23]} color={colors[(i + level * 2) % colors.length]} />;
      })}
    </group>)}
  </group>;
}

function Fridges() {
  return <group position={[-4.17, 0, -1.2]} rotation={[0, Math.PI / 2, 0]}>
    {[-2.1, -0.18, 1.74].map((x, index) => <group key={x} position={[x, 0, 0]}>
      <Box position={[0, 1.58, 0]} size={[1.82, 3.16, 0.65]} color="#d0dce0" />
      <Box position={[0, 1.58, 0.34]} size={[1.62, 2.82, 0.035]} color="#74a6b9" opacity={0.32} />
      {[0.6, 1.35, 2.1].map((y, row) => <group key={row}>
        <Box position={[0, y, 0.33]} size={[1.55, 0.045, 0.12]} color="#e5f5ed" emissive="#d9faff" intensity={0.6} />
        {Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[-0.64 + i * 0.255, y + 0.28, 0.31]}><cylinderGeometry args={[0.085, 0.085, 0.42, 10]} /><meshStandardMaterial color={["#e9b9a9", "#d6d98e", "#afd3ce", "#c7a7bd"][(i + row + index) % 4]} /></mesh>)}
      </group>)}
      <Tube from={[0.76, 0.42, 0.4]} to={[0.76, 2.74, 0.4]} radius={0.025} color="#e5e9dc" />
    </group>)}
  </group>;
}

const giftFrontImages = ["/project-gift-front-01.png", "/project-gift-front-02.png", "/project-gift-front-03.png", "/project-gift-front-04.png"];

function GiftBoxImage({ image, color }: { image: string; color: string }) {
  const source = useLoader(THREE.TextureLoader, image);
  const front = useMemo(() => {
    const crop = giftLayout.frontCrop;
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext("2d")!;
    // The supplied PNG has transparent pixels around the cutout. Fill them with
    // the box color so a camera angle can never reveal black/empty front corners.
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source.image as CanvasImageSource, crop.x0, crop.y0, crop.x1 - crop.x0, crop.y1 - crop.y0, 0, 0, canvas.width, canvas.height);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    return map;
  }, [source, color]);
  useEffect(() => () => front.dispose(), [front]);
  const b = giftLayout.box;
  const tapeWidth = b.width * 0.245;
  return <group>
    {/* Closed geometry: its bottom is exactly at the shelf top, not a floating image plane. */}
    <mesh position={[0, b.bodyHeight / 2, 0]} castShadow receiveShadow userData={{ projectGift: true }}>
      <boxGeometry args={[b.width, b.bodyHeight, b.depth]} />
      <meshStandardMaterial attach="material-0" color={color} roughness={0.83} />
      <meshStandardMaterial attach="material-1" color={color} roughness={0.83} />
      <meshStandardMaterial attach="material-2" color={color} roughness={0.83} />
      <meshStandardMaterial attach="material-3" color={color} roughness={0.83} />
      <meshBasicMaterial attach="material-4" map={front} toneMapped={false} />
      <meshStandardMaterial attach="material-5" color={color} roughness={0.83} />
    </mesh>
    <mesh position={[0, b.bodyHeight + b.lidHeight / 2, 0]} castShadow receiveShadow userData={{ projectGift: true }}>
      <boxGeometry args={[b.width + b.lidOverhang * 2, b.lidHeight, b.depth + b.lidOverhang * 2]} />
      <meshStandardMaterial color={color} roughness={0.76} />
    </mesh>
    <Box position={[-b.width * 0.31, b.bodyHeight + b.lidHeight + 0.001, 0]} size={[tapeWidth, 0.002, b.depth + b.lidOverhang * 2]} color="#efe6d2" />
    <Box position={[-b.width * 0.31, b.bodyHeight + b.lidHeight / 2, -b.depth / 2 - b.lidOverhang - 0.001]} size={[tapeWidth, b.lidHeight, 0.002]} color="#efe6d2" />
  </group>;
}

function ProjectDisplay({ projects, onSelect, active, loadImages }: { projects: Project[]; onSelect: Props["onSelect"]; active: boolean; loadImages: boolean }) {
  const shelf = giftLayout.shelf;
  const gift = giftLayout.box;
  return <group position={[2.48, 0, -3.7]}>
    <Box position={[0, 2.02, -0.1]} size={[3.35, 3.7, 0.42]} color="#cfdbd7" />
    <Box position={[0, 3.77, 0.14]} size={[3.37, 0.32, 0.42]} color="#4e9fc6" emissive="#acd7e7" intensity={0.2} />
    {/* Match the 4:1 label texture so the lettering keeps its natural proportions. */}
    <Label text="PICK UP" position={[0, 3.77, 0.351]} width={2.55} height={0.6375} color="#ffffff" fontSize={76} sharp printed />
    {[0.78, shelf.lowerY, shelf.upperY].map((y) => <Box key={y} position={[shelf.centerX, y, shelf.centerZ]} size={[shelf.width, shelf.thickness, shelf.depth]} color="#8baab2" />)}
    {projects.map((project, i) => {
      const x = i % 2 === 0 ? gift.leftX : gift.rightX;
      const y = (i < 2 ? shelf.upperY : shelf.lowerY) + shelf.thickness / 2;
      return <Clickable key={project.id} position={[x, y, gift.centerZ]} active={active} onClick={(event) => { event.stopPropagation(); onSelect(project); }}>
        {loadImages ? <Suspense fallback={<Box position={[0, gift.bodyHeight / 2, 0]} size={[gift.width, gift.bodyHeight, gift.depth]} color={project.color} />}>
          <GiftBoxImage image={giftFrontImages[i]} color={project.color} />
        </Suspense> : <Box position={[0, gift.bodyHeight / 2, 0]} size={[gift.width, gift.bodyHeight, gift.depth]} color={project.color} />}
      </Clickable>;
    })}
    {[0.84, 1.46, 2.08].map((x, i) => <group key={i} position={[-x, 0.95, 0.35]}>
      <Box size={[0.28, 0.33, 0.23]} color={["#e7ca8e", "#b5d0c1", "#e0b6af"][i]} />
    </group>)}
  </group>;
}

function Clickable({ position, children, onClick, active = true, hoverScale = 1.045 }: { position: [number, number, number]; children: ReactNode; onClick: (e: ThreeEvent<MouseEvent>) => void; active?: boolean; hoverScale?: number }) {
  const [hover, setHover] = useState(false);
  useEffect(() => { if (!active) setHover(false); }, [active]);
  useEffect(() => { if (active && hover) document.body.style.cursor = "pointer"; return () => { document.body.style.cursor = "default"; }; }, [active, hover]);
  return <group position={position} scale={active && hover ? hoverScale : 1} onClick={active ? onClick : undefined} onPointerOver={active ? (e) => { e.stopPropagation(); setHover(true); } : undefined} onPointerOut={active ? () => setHover(false) : undefined}>{children}</group>;
}

function SoftBox({ position, size, radius, color, rotation = [0, 0, 0] }: {
  position: [number, number, number]; size: [number, number, number]; radius: number; color: string; rotation?: [number, number, number];
}) {
  const geometry = useMemo(() => new RoundedBoxGeometry(size[0], size[1], size[2], 3, radius), [size[0], size[1], size[2], radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={position} rotation={rotation} castShadow receiveShadow>
    <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
  </mesh>;
}

function Cashier({ onProfile, active }: { onProfile: () => void; active: boolean }) {
  const face = useMemo(() => {
    const rings = [
      [2.315, 0.075, 0.105, 0.11],
      [2.37, 0.15, 0.16, 0.11],
      [2.48, 0.24, 0.225, 0.105],
      [2.64, 0.305, 0.255, 0.105],
      [2.77, 0.285, 0.245, 0.095],
      [2.87, 0.15, 0.17, 0.075],
    ];
    const sides = 16;
    const vertices: number[] = [];
    const indices: number[] = [];
    rings.forEach(([y, rx, rz, centerZ]) => {
      for (let i = 0; i < sides; i++) {
        const angle = i / sides * Math.PI * 2;
        vertices.push(Math.cos(angle) * rx, y, centerZ + Math.sin(angle) * rz);
      }
    });
    for (let row = 0; row < rings.length - 1; row++) {
      for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        const a = row * sides + i;
        const b = row * sides + next;
        const c = (row + 1) * sides + i;
        const d = (row + 1) * sides + next;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  const jacket = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.35, 1.36);
    shape.quadraticCurveTo(-0.46, 1.36, -0.47, 1.52);
    shape.lineTo(-0.47, 2.06);
    shape.quadraticCurveTo(-0.47, 2.23, -0.31, 2.3);
    shape.quadraticCurveTo(0, 2.39, 0.31, 2.3);
    shape.quadraticCurveTo(0.47, 2.23, 0.47, 2.06);
    shape.lineTo(0.47, 1.52);
    shape.quadraticCurveTo(0.46, 1.36, 0.35, 1.36);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.44, bevelEnabled: true, bevelSize: 0.045, bevelThickness: 0.045, bevelSegments: 3, curveSegments: 8 });
  }, []);
  const hair = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.33, 2.77);
    shape.quadraticCurveTo(-0.44, 2.96, -0.31, 3.1);
    shape.quadraticCurveTo(-0.2, 3.18, -0.07, 3.15);
    shape.quadraticCurveTo(0.07, 3.25, 0.22, 3.14);
    shape.quadraticCurveTo(0.42, 3.1, 0.36, 2.92);
    shape.quadraticCurveTo(0.35, 2.78, 0.22, 2.75);
    shape.quadraticCurveTo(0.1, 2.86, -0.04, 2.83);
    shape.quadraticCurveTo(-0.21, 2.75, -0.33, 2.77);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2, curveSegments: 6 });
  }, []);
  const fringe = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.3, 2.88);
    shape.quadraticCurveTo(-0.2, 3.08, 0.07, 3.08);
    shape.quadraticCurveTo(0.26, 3.12, 0.31, 3.01);
    shape.quadraticCurveTo(0.22, 2.97, 0.17, 2.9);
    shape.quadraticCurveTo(0.03, 2.91, -0.06, 2.79);
    shape.quadraticCurveTo(-0.14, 2.75, -0.18, 2.87);
    shape.quadraticCurveTo(-0.25, 2.83, -0.3, 2.88);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.075, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 6 });
  }, []);
  useEffect(() => () => { face.dispose(); jacket.dispose(); hair.dispose(); fringe.dispose(); }, [face, jacket, hair, fringe]);
  return <Clickable position={[3.98, 0, -2.66]} active={active} onClick={(e) => {
    if (e.intersections.some((hit) => hit.object.userData.projectGift)) return;
    e.stopPropagation();
    onProfile();
  }}>
    <group rotation={[0, -0.12, 0]}>
      {/* Rounded tailored forms preserve the reference sheet's clean, lightly faceted silhouette. */}
      {[-0.2, 0.2].map((x) => <group key={`leg-${x}`}>
        <SoftBox position={[x, 0.83, 0]} size={[0.34, 1.02, 0.36]} radius={0.1} color="#2b2c33" />
        <SoftBox position={[x + Math.sign(x) * 0.17, 0.82, 0.025]} size={[0.17, 0.37, 0.34]} radius={0.035} color="#34343c" />
        <SoftBox position={[x + Math.sign(x) * 0.185, 1.045, 0.025]} size={[0.19, 0.11, 0.36]} radius={0.025} color="#3d3d45" />
        <SoftBox position={[x, 0.47, 0.185]} size={[0.3, 0.055, 0.025]} radius={0.015} color="#303038" />
        <SoftBox position={[x, 0.26, 0.02]} size={[0.32, 0.18, 0.34]} radius={0.065} color="#24252b" />
        <SoftBox position={[x, 0.12, 0.16]} size={[0.42, 0.19, 0.63]} radius={0.085} color="#e9e7e1" />
        <SoftBox position={[x, 0.205, -0.01]} size={[0.34, 0.135, 0.39]} radius={0.055} color="#292a32" />
        <SoftBox position={[x, 0.213, 0.1]} size={[0.275, 0.09, 0.19]} radius={0.035} color="#54565b" />
        {[0, 1, 2].map((lace) => <Tube key={`lace-${lace}`} from={[x - 0.095, 0.267, 0.04 + lace * 0.065]} to={[x + 0.095, 0.267, 0.04 + lace * 0.065]} radius={0.008} color="#cfd0cc" />)}
      </group>)}
      <SoftBox position={[0, 1.35, 0]} size={[0.71, 0.16, 0.38]} radius={0.06} color="#26272e" />
      <mesh geometry={jacket} position={[0, 0, -0.22]} castShadow receiveShadow><meshStandardMaterial color="#393942" roughness={0.88} /></mesh>
      <SoftBox position={[0, 1.39, -0.266]} size={[0.74, 0.12, 0.025]} radius={0.015} color="#292a31" />
      <SoftBox position={[0, 2.12, -0.267]} size={[0.71, 0.018, 0.014]} radius={0.005} color="#515059" />
      <SoftBox position={[0, 1.87, 0.268]} size={[0.31, 0.77, 0.025]} radius={0.01} color="#1c1d23" />
      <SoftBox position={[-0.27, 1.88, 0.259]} size={[0.14, 0.8, 0.03]} radius={0.014} color="#3c3c44" rotation={[0, 0, -0.035]} />
      <SoftBox position={[0.27, 1.88, 0.259]} size={[0.14, 0.8, 0.03]} radius={0.014} color="#3c3c44" rotation={[0, 0, 0.035]} />
      <Tube from={[0, 1.47, 0.289]} to={[0, 2.25, 0.289]} radius={0.009} color="#cbd0d0" />
      {Array.from({ length: 16 }, (_, i) => <Tube key={`zip-${i}`} from={[-0.02, 1.53 + i * 0.043, 0.298]} to={[0.02, 1.53 + i * 0.043, 0.298]} radius={0.003} color="#d7d9d7" />)}
      <SoftBox position={[0, 1.48, 0.3]} size={[0.055, 0.085, 0.025]} radius={0.01} color="#c8c9c6" />
      {[-1, 1].map((side) => <group key={`arm-${side}`}>
        <mesh position={[side * 0.56, 1.79, 0]} rotation={[0, 0, side * 0.11]} scale={[1, 1, 1.13]} castShadow receiveShadow>
          <cylinderGeometry args={[0.225, 0.16, 0.93, 10, 3]} />
          <meshStandardMaterial color="#383840" roughness={0.9} flatShading />
        </mesh>
        <SoftBox position={[side * 0.63, 1.64, 0.21]} rotation={[0, 0, side * 0.17]} size={[0.23, 0.3, 0.018]} radius={0.008} color="#33333b" />
        <SoftBox position={[side * 0.62, 1.32, 0.015]} size={[0.26, 0.12, 0.34]} radius={0.04} color="#25262c" />
        <SoftBox position={[side * 0.62, 1.14, 0.04]} size={[0.22, 0.3, 0.24]} radius={0.095} color="#e1aa88" />
        <mesh position={[side * 0.72, 1.14, 0.15]} rotation={[0, 0, side * 0.35]} scale={[0.055, 0.105, 0.06]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#dda383" roughness={0.9} /></mesh>
      </group>)}
      <SoftBox position={[0, 2.34, -0.145]} size={[0.58, 0.25, 0.18]} radius={0.05} color="#303037" />
      <SoftBox position={[-0.24, 2.34, 0.075]} rotation={[0, 0, -0.1]} size={[0.25, 0.3, 0.38]} radius={0.06} color="#303037" />
      <SoftBox position={[0.24, 2.34, 0.075]} rotation={[0, 0, 0.1]} size={[0.25, 0.3, 0.38]} radius={0.06} color="#303037" />
      <mesh geometry={face} castShadow receiveShadow><meshStandardMaterial color="#e8b28f" roughness={0.9} side={THREE.DoubleSide} /></mesh>
      {[-0.315, 0.315].map((x) => <group key={`ear-${x}`}>
        <mesh position={[x, 2.56, 0.09]} scale={[0.065, 0.105, 0.07]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#dfa580" roughness={0.9} /></mesh>
        <mesh position={[x + Math.sign(x) * 0.035, 2.56, 0.14]} scale={[0.018, 0.06, 0.02]}><sphereGeometry args={[1, 8, 6]} /><meshStandardMaterial color="#bf8066" roughness={0.9} /></mesh>
      </group>)}
      <mesh position={[0, 2.95, -0.13]} scale={[0.37, 0.23, 0.29]} castShadow><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#202127" roughness={0.9} flatShading /></mesh>
      <mesh geometry={hair} position={[0, 0, -0.18]} castShadow><meshStandardMaterial color="#202127" roughness={0.88} flatShading /></mesh>
      <mesh geometry={fringe} position={[0, 0, 0.255]} castShadow><meshStandardMaterial color="#17181e" roughness={0.88} flatShading /></mesh>
      <SoftBox position={[-0.15, 2.63, 0.392]} size={[0.265, 0.155, 0.055]} radius={0.045} color="#11141a" />
      <SoftBox position={[0.15, 2.63, 0.392]} size={[0.265, 0.155, 0.055]} radius={0.045} color="#11141a" />
      <Tube from={[-0.28, 2.64, 0.39]} to={[-0.35, 2.66, 0.23]} radius={0.012} color="#1a1d23" />
      <Tube from={[0.28, 2.64, 0.39]} to={[0.35, 2.66, 0.23]} radius={0.012} color="#1a1d23" />
      <SoftBox position={[0, 2.65, 0.422]} size={[0.065, 0.028, 0.025]} radius={0.01} color="#1a1d23" />
      <mesh position={[0, 2.49, 0.376]} scale={[0.045, 0.06, 0.04]}><sphereGeometry args={[1, 12, 8]} /><meshStandardMaterial color="#e5ad89" roughness={0.9} /></mesh>
      <SoftBox position={[0, 2.415, 0.373]} size={[0.085, 0.017, 0.014]} radius={0.006} color="#ad735f" />
    </group>
    <mesh position={[0, 1.94, 0.13]}>
      <boxGeometry args={[1.3, 2.25, 0.83]} />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
    </mesh>
  </Clickable>;
}

function SpriteCashier({ onProfile, active }: { onProfile: () => void; active: boolean }) {
  const texture = useLoader(THREE.TextureLoader, "/cashier-front-sprite.png");
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }, [texture]);
  return <Clickable position={[3.98, 0, -2.66]} active={active} onClick={(e) => {
    if (e.intersections.some((hit) => hit.object.userData.projectGift)) return;
    e.stopPropagation();
    onProfile();
  }}>
    <sprite position={[0, 1.61, 0]} scale={[2.14, 3.22, 1]}>
      <spriteMaterial map={texture} transparent alphaTest={0.08} depthWrite toneMapped={false} />
    </sprite>
    <mesh position={[0, 1.95, 0.11]}>
      <boxGeometry args={[1.38, 2.3, 0.9]} />
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
    </mesh>
  </Clickable>;
}

function Checkout({ onCheckout, active }: { onCheckout: () => void; active: boolean }) {
  const image = useLoader(THREE.TextureLoader, "/checkout-reference.png");
  useEffect(() => {
    image.colorSpace = THREE.SRGBColorSpace;
    image.anisotropy = 8;
    image.needsUpdate = true;
  }, [image]);
  return <group position={[2.25, 0, -1.35]}>
    <Clickable position={[0, 0.76, 0.66]} active={active} hoverScale={1.075} onClick={(e) => {
      if (e.intersections.some((hit) => hit.object.userData.projectGift)) return;
      e.stopPropagation();
      onCheckout();
    }}>
      {/* Scale the supplied image with its hit area, keeping the original pose. */}
      <mesh position={[0, 0.34, -0.04]} raycast={() => {}}>
        <planeGeometry args={[4.15, 4.15 * 919 / 1711]} />
        <meshBasicMaterial map={image} transparent alphaTest={0.04} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <Label text="MONDAY MART 24" position={[0, 0.094, -0.035]} width={1.865} height={0.278} color="#15516e" background="#e7e2d4" fontSize={100} sharp />
      {/* Only the opaque counter body receives pointer events. */}
      <mesh>
        <boxGeometry args={[3.6, 1.12, 0.08]} />
        <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
      </mesh>
    </Clickable>
  </group>;
}

function CheckoutPlaceholder({ onCheckout, active }: { onCheckout: () => void; active: boolean }) {
  return <group position={[2.25, 0, -1.35]}>
    <Clickable position={[0, 0.76, 0.66]} active={active} onClick={(event) => { event.stopPropagation(); onCheckout(); }}>
      <Box size={[3.6, 1.12, 0.1]} color="#d5c49f" />
    </Clickable>
  </group>;
}

function Interior({ projects, onSelect, onCheckout, onProfile, active, fitRoom, loadProjects, loadCheckout }: Pick<Props, "projects" | "onSelect" | "onCheckout" | "onProfile"> & { active: boolean; fitRoom: boolean; loadProjects: boolean; loadCheckout: boolean }) {
  const { size, camera } = useThree();
  const extendedRoom = useRef<THREE.Group>(null);
  const mobileRoom = fitRoom && size.width <= 720;
  // Continue the room around the portrait camera, filling the viewport with
  // the store's floor, walls and ceiling rather than a separate backdrop.
  const distanceScale = Math.max(1, 1.45 / (size.width / size.height));
  const extension = fitRoom && distanceScale > 1 ? (distanceScale - 1) * 3.28 + 2 : 0;
  useFrame(() => {
    // The extra room is only a camera surround. Never expose its outer shell
    // while approaching the shop from outside.
    if (extendedRoom.current) extendedRoom.current.visible = extension > 0 && (active || camera.position.z < 3.1 + extension - 0.35);
  });
  return <group>
    <Box position={[0, 0.11, -0.48]} size={[9, 0.07, 7.3]} color="#eadbbd" emissive="#b38f56" intensity={0.05} />
    {[-3, -1.5, 0, 1.5, 3].map((x) => <Box key={x} position={[x, 0.156, -0.5]} size={[mobileRoom ? 0.006 : 0.022, 0.01, 7.2]} color={mobileRoom ? "#e4d8c4" : "#d4cfc0"} opacity={mobileRoom ? 0.08 : 1} />)}
    {[-3.2, -1.9, -0.6, 0.7, 2].map((z) => <Box key={z} position={[0, 0.156, z]} size={[8.9, 0.01, mobileRoom ? 0.006 : 0.022]} color={mobileRoom ? "#e4d8c4" : "#d4cfc0"} opacity={mobileRoom ? 0.08 : 1} />)}
    <Box position={[0, 2.7, -4.08]} size={[9, 5.4, 0.16]} color="#e7dfc8" />
    <Box position={[-4.52, 2.7, -0.5]} size={[0.16, 5.4, 7.2]} color="#d7ddda" />
    <Box position={[4.52, 2.7, -0.5]} size={[0.16, 5.4, 7.2]} color="#bec9c8" />
    <Box position={[0, 5.44, -0.5]} size={[9.25, 0.14, 7.3]} color="#e7e4d4" />
    {extension > 0 && <group ref={extendedRoom} visible={false}>
      <Box position={[0, 0.11, 3.17 + extension / 2]} size={[9, 0.07, extension]} color="#eadbbd" emissive="#b38f56" intensity={0.05} />
      <Box position={[-4.52, 2.7, 3.1 + extension / 2]} size={[0.16, 5.4, extension]} color="#d7ddda" />
      <Box position={[4.52, 2.7, 3.1 + extension / 2]} size={[0.16, 5.4, extension]} color="#bec9c8" />
      <Box position={[0, 5.44, 3.15 + extension / 2]} size={[9.25, 0.14, extension]} color="#e7e4d4" />
    </group>}
    <Fridges />
    <InteriorStock position={[-1.77, 0.14, -1.65]} length={2.35} />
    <group visible={!mobileRoom}><InteriorStock position={[-1.77, 0.14, 0.55]} length={2.35} /></group>
    <InteriorStock position={[0.15, 0.14, -3.36]} length={1.65} levels={2} />
    <ProjectDisplay projects={projects} onSelect={onSelect} active={active} loadImages={loadProjects} />
    <Suspense fallback={null}><SpriteCashier onProfile={onProfile} active={active} /></Suspense>
    {loadCheckout ? <Suspense fallback={<CheckoutPlaceholder onCheckout={onCheckout} active={active} />}><Checkout onCheckout={onCheckout} active={active} /></Suspense> : <CheckoutPlaceholder onCheckout={onCheckout} active={active} />}
    <Box position={[-0.8, 1.23, -3.99]} size={[1.12, 2.42, 0.06]} color="#778e93" />
    <Box position={[-0.8, 1.28, -3.95]} size={[0.72, 1.5, 0.035]} color="#b9ccc4" />
    <Label text="STAFF ONLY" position={[-0.8, 2.02, -3.918]} width={0.68} height={0.15} color="#234151" fontSize={48} />
    <Box position={[-3.32, 3.95, -3.97]} size={[1.1, 0.78, 0.03]} color="#e4b895" />
    <Label text="おにぎり / BENTO" position={[-3.32, 4, -3.948]} width={1.04} height={0.24} color="#5c4a37" fontSize={46} />
    <group visible={!mobileRoom}>
      <Box position={[-0.02, 4.93, -0.45]} size={[7.8, 0.12, 0.7]} color="#fff7dd" emissive="#fff2c1" intensity={1.4} />
      <Box position={[-0.02, 4.78, -0.45]} size={[7.55, 0.03, 0.12]} color="#fffbe9" emissive="#fffbe9" intensity={2} />
    </group>
    {[[-3.2, 3.8, -1], [0, 3.8, -1], [3.2, 3.8, -1]].map(([x, y, z], i) => <pointLight key={i} position={[x, y, z]} color="#ffdaa0" intensity={i === 2 ? 10 : 7} distance={7} />)}
    <Box position={[-2.93, 0.16, 2.1]} size={[0.72, 0.012, 1.15]} color="#e5bf6a" opacity={0.48} />
    <Box position={[-1.14, 0.16, 2.1]} size={[0.72, 0.012, 1.15]} color="#e5bf6a" opacity={0.48} />
    <group position={[-3.05, 0.15, 1.83]}>
      <Box position={[0, 0.6, 0]} size={[1.1, 1.2, 0.5]} color="#d7dfda" />
      <Box position={[0, 1.17, 0.27]} size={[0.97, 0.47, 0.04]} color="#704d3b" />
      <Label text="COFFEE" position={[0, 1.17, 0.297]} width={0.85} height={0.23} color="#fff0c7" fontSize={60} />
      {[0.24, -0.24].map((x) => <mesh key={x} position={[x, 0.64, 0.31]}><cylinderGeometry args={[0.13, 0.1, 0.34, 12]} /><meshStandardMaterial color="#f1e5cb" /></mesh>)}
    </group>
    <group position={[-3.1, 0.16, -3.37]}>
      <Box position={[0, 0.57, 0]} size={[1.3, 1.12, 0.58]} color="#b8ced1" />
      <Box position={[0, 1.15, 0]} size={[1.36, 0.08, 0.67]} color="#e4eeee" />
      <Box position={[0, 1.19, 0]} size={[1.1, 0.025, 0.42]} color="#8bb5c0" opacity={0.4} />
      <Label text="ICE" position={[0, 0.62, 0.307]} width={0.76} height={0.25} color="#f9f7ed" fontSize={80} />
    </group>
    <group position={[0.3, 0.14, 1.8]} visible={!mobileRoom}>
      <Box position={[0, 0.64, 0]} size={[1.25, 1.28, 0.55]} color="#8b705d" />
      <Box position={[0, 1.29, 0]} size={[1.4, 0.06, 0.68]} color="#f1ead4" />
      {[0, 1, 2].map((i) => <Box key={i} position={[-0.36 + i * 0.34, 0.72, 0.3]} size={[0.26, 0.53, 0.055]} color={["#ddd5a5", "#a6bbbe", "#d7b6ab"][i]} />)}
      <Label text="MAGAZINE" position={[0, 1.08, 0.294]} width={1.05} height={0.16} color="#f4e8cc" fontSize={55} />
    </group>
    <group position={[1.07, 0.15, -2.68]}>
      <Box position={[0, 0.62, 0]} size={[0.92, 1.22, 0.6]} color="#d8bc95" />
      <Box position={[0, 1.25, 0]} size={[1.06, 0.08, 0.68]} color="#f3e2bb" />
      <Box position={[0, 1.48, 0]} size={[0.92, 0.39, 0.55]} color="#c98769" opacity={0.45} />
      {[-0.25, 0, 0.25].map((x) => <mesh key={x} position={[x, 1.34, 0.09]}><sphereGeometry args={[0.13, 10, 8]} /><meshStandardMaterial color="#ba855e" /></mesh>)}
      <Label text="おでん" position={[0, 0.88, 0.309]} width={0.73} height={0.22} color="#664d3b" fontSize={76} />
    </group>
    <group position={[-1.2, 0.15, -3.85]}>
      <Box position={[0, 0.55, 0]} size={[1.13, 1.1, 0.52]} color="#d2dcd8" />
      <Box position={[0, 1.12, 0]} size={[1.23, 0.07, 0.61]} color="#f3e6c9" />
      {[0, 1, 2, 3].map((i) => <group key={i} position={[-0.41 + i * 0.27, 0.68, 0.285]}>
        <Box size={[0.2, 0.24, 0.045]} color={i % 2 ? "#e4c582" : "#c8d3ad"} />
        <Box position={[0, 0.13, 0]} size={[0.22, 0.035, 0.05]} color="#eff0dd" />
      </group>)}
      <Label text="BENTO" position={[0, 0.97, 0.292]} width={0.9} height={0.16} color="#4c695d" fontSize={62} />
    </group>
  </group>;
}

function SlidingDoors({ mode, onEnter }: { mode: Mode; onEnter: () => void }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const wasEntering = useRef(false);
  const keepOpenUntil = useRef(0);
  const [hovered, setHovered] = useState(false);
  useFrame(({ clock }, delta) => {
    if (mode === "entering") wasEntering.current = true;
    if (mode === "inside" && wasEntering.current) {
      keepOpenUntil.current = clock.elapsedTime + 0.4;
      wasEntering.current = false;
    }
    const open = hovered || mode === "entering" || (mode === "inside" && clock.elapsedTime < keepOpenUntil.current);
    const k = 1 - Math.exp(-delta * 2.4);
    if (left.current) left.current.position.x = THREE.MathUtils.lerp(left.current.position.x, open ? -1.08 : -0.55, k);
    if (right.current) right.current.position.x = THREE.MathUtils.lerp(right.current.position.x, open ? 1.08 : 0.55, k);
  });
  useEffect(() => { if (mode !== "outside") setHovered(false); }, [mode]);
  useEffect(() => { if (hovered && mode === "outside") document.body.style.cursor = "pointer"; return () => { document.body.style.cursor = "default"; }; }, [hovered, mode]);
  return <group position={[0, 0, 3.3]}>
    {[-1, 1].map((side) => <group key={side} ref={side < 0 ? left : right} position={[side * 0.55, 0, 0]}>
      <Box position={[0, 1.87, 0]} size={[1.08, 3.52, 0.07]} color="#a3c6d0" opacity={0.16} roughness={0.1} metalness={0.3} />
      <Box position={[0, 3.61, 0.055]} size={[1.1, 0.055, 0.08]} color="#304d5b" />
      <Box position={[side * 0.52, 1.87, 0.055]} size={[0.055, 3.48, 0.08]} color="#304d5b" />
      <Box position={[0, 0.16, 0.055]} size={[1.1, 0.1, 0.08]} color="#304d5b" />
      <Box position={[-side * 0.42, 1.7, 0.067]} size={[0.025, 0.52, 0.03]} color="#d7e5df" />
      <Box position={[0, 1.13, 0.064]} size={[1.02, 0.1, 0.022]} color="#b0c3c5" opacity={0.6} />
    </group>)}
    <mesh position={[0, 1.9, 0.14]} onPointerOver={mode === "outside" ? (e) => { e.stopPropagation(); setHovered(true); } : undefined} onPointerOut={() => setHovered(false)} onClick={mode === "outside" ? (e) => { e.stopPropagation(); onEnter(); } : undefined}>
      <boxGeometry args={[2.25, 3.65, 0.14]} />
      <meshBasicMaterial color="#fff" transparent opacity={0.001} depthWrite={false} />
    </mesh>
  </group>;
}

function Facade({ mode, onEnter, spring, rainy }: { mode: Mode; onEnter: () => void; spring: boolean; rainy: boolean }) {
  const sign = useRef<THREE.Mesh>(null);
  // The warm-season front face receives little direct light. Give its white
  // lightbox a neutral luminance floor so tone mapping doesn't turn it gray;
  // the standard material still receives each season's exterior light.
  useFrame(({ clock }) => { if (sign.current) (sign.current.material as THREE.MeshStandardMaterial).emissiveIntensity = spring ? 1 : 0.45 + Math.sin(clock.elapsedTime * 1.2) * 0.035 + (Math.sin(clock.elapsedTime * 8.3) > 0.994 ? 0.12 : 0); });
  return <group>
    <Box position={[0, 4.64, 3.3]} size={[9.35, 1.27, 0.36]} color={spring ? "#1688c7" : "#3e8db6"} outline />
    <Box position={[0, 5.31, 3.52]} size={[9.42, 0.075, 0.09]} color="#f4f3df" emissive="#f4f3df" intensity={0.6} />
    <Box position={[0, 4.02, 3.52]} size={[9.42, 0.075, 0.09]} color="#f4f3df" emissive="#f4f3df" intensity={0.6} />
    <mesh ref={sign} position={[0, 4.65, 3.511]}><boxGeometry args={[5.1, 0.76, 0.06]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={spring ? 1 : 0.45} /></mesh>
    <Label text="MONDAY" position={[-0.56, 4.68, 3.60]} width={3.38} height={0.61} color="#15516e" fontSize={196} sharp />
    <Label text="MART 24" position={[1.64, 4.68, 3.60]} width={1.33} height={0.28} color="#276a85" fontSize={147} sharp />
    <Glow position={[0, 4.68, 3.91]} color="#fff1c3" size={[6.4, 1.65]} opacity={spring ? 0.04 : 0.18} />
    {[-4.1, 4.1].map((x) => <group key={x} position={[x, 4.66, 3.57]}>
      <mesh><circleGeometry args={[0.39, 32]} /><meshBasicMaterial color="#fff0c9" /></mesh>
      <mesh position={[0, 0, 0.015]}><ringGeometry args={[0.2, 0.275, 32]} /><meshBasicMaterial color="#3e8db6" /></mesh>
    </group>)}
    <Box position={[0, 3.8, 3.66]} size={[9.5, 0.15, 1.06]} color="#334c59" />
    <Box position={[0, 3.75, 4.15]} size={[9.5, 0.08, 0.11]} color="#86b9c7" emissive="#78aec4" intensity={spring ? 0.05 : 0.35} />
    {[-4.42, -3.16, -1.9, -0.64, 0.64, 1.9, 3.16, 4.42].map((x) => <Box key={`canopy-rib-${x}`} position={[x, 3.714, 3.69]} size={[0.035, 0.018, 0.93]} color="#94aeb4" />)}
    <Box position={[0, 3.62, 4.18]} size={[9.36, 0.025, 0.025]} color="#d8e9e5" emissive="#add9dd" intensity={spring ? 0.06 : 0.55} />
    {[-2.7, 0, 2.7].map((x) => <group key={`canopy-light-${x}`}>
      <Box position={[x, 3.67, 3.77]} size={[1.36, 0.035, 0.23]} color="#ffe5a5" emissive="#ffe2a2" intensity={spring ? 0.1 : 1.15} />
      <pointLight position={[x, 3.3, 3.85]} color="#ffdba2" intensity={spring ? 0.3 : 2.7} distance={3.5} />
    </group>)}
    {[-4.64, -2.68, -1.14, 1.14, 2.68, 4.64].map((x) => <Box key={x} position={[x, 1.97, 3.38]} size={[0.08, 3.82, 0.12]} color="#2f5260" />)}
    <Box position={[0, 0.12, 3.38]} size={[9.4, 0.15, 0.26]} color="#415a63" />
    {[-4.65, -2.68, -1.14, 1.14, 2.68, 4.65].map((x) => <Box key={`sill-${x}`} position={[x, 0.24, 3.48]} size={[0.13, 0.05, 0.12]} color="#8aa7ab" metalness={0.45} roughness={0.28} />)}
    {[-3.65, 3.65].map((x) => <group key={x} position={[x, 1.92, 3.39]}>
      <Box size={[1.89, 3.62, 0.06]} color="#88b7c3" opacity={0.14} roughness={0.08} metalness={0.38} />
      <Box position={[0, 0.33, 0.05]} size={[1.89, 0.05, 0.09]} color="#416372" />
      <Box position={[0, -1.2, 0.05]} size={[1.89, 0.16, 0.09]} color="#557583" />
      <Box position={[-0.67, 0.05, 0.075]} size={[0.012, 1.5, 0.01]} color="#d5e8e9" opacity={0.25} />
      <Box position={[0.62, 0.48, 0.075]} size={[0.012, 1.95, 0.01]} color="#d5e8e9" opacity={0.25} />
      {[-0.72, -0.24, 0.41, 0.76].map((dx, i) => <Box key={dx} position={[dx, 0.32 - (i % 2) * 0.62, 0.092]} size={[0.01, 0.42 + (i % 3) * 0.18, 0.008]} color="#b9d6db" opacity={0.31} />)}
    </group>)}
    <GlassRain active={rainy && mode !== "inside"} />
    <SlidingDoors mode={mode} onEnter={onEnter} />
    <Box position={[-3.62, 1.15, 3.45]} size={[0.82, 0.98, 0.025]} color="#f4d39a" />
    <Label text="HOT FOOD" position={[-3.62, 1.2, 3.468]} width={0.78} height={0.2} color="#8d5a3f" fontSize={52} />
    <Box position={[3.67, 1.18, 3.45]} size={[0.86, 1.14, 0.025]} color="#8fc4c8" />
    <Label text="NEW!" position={[3.67, 1.3, 3.468]} width={0.76} height={0.24} color="#2c6175" fontSize={70} />
    <Box position={[4.68, 2.82, -0.54]} size={[0.3, 0.74, 1.16]} color={spring ? "#d2c6af" : "#8c9c9a"} />
    <Box position={[4.87, 2.82, -0.54]} size={[0.035, 0.57, 0.94]} color={spring ? "#80735f" : "#465d67"} />
    {[-0.84, -0.55, -0.26].map((z) => <Box key={z} position={[4.9, 2.82, z]} size={[0.045, 0.5, 0.015]} color={spring ? "#b09e83" : "#8ea19f"} />)}
    <Box position={[4.55, 5.48, -0.55]} size={[0.13, 0.27, 7.45]} color="#4a5d65" />
    <group position={[4.65, 1.5, 1.25]} rotation={[0, Math.PI / 2, 0]}>
      <Box size={[1.3, 1.8, 0.09]} color={spring ? "#9b8167" : "#2b566e"} emissive={spring ? "#b99a74" : "#327ca4"} intensity={spring ? 0.06 : 0.18} />
      <Box position={[0, 0, 0.055]} size={[1.1, 1.56, 0.03]} color="#f2dfad" emissive="#f2dfad" intensity={spring ? 0.04 : 0.16} />
      <Label text="24 HOURS" position={[0, 0.4, 0.078]} width={1.03} height={0.28} color={spring ? "#80664e" : "#28779e"} fontSize={67} />
      <Label text="あたたかな夜" position={[0, -0.2, 0.078]} width={1.03} height={0.3} color="#766557" fontSize={63} />
    </group>
  </group>;
}

function SpringExteriorWalls({ active, autumn = false }: { active: boolean; autumn?: boolean }) {
  return <group visible={active}>
    {[-1, 1].map((side) => <Box key={side} position={[side * 4.65, 2.7, -0.5]} size={[0.055, 5.3, 7.2]} color="#f8f9f7" emissive={autumn ? "#e8b47f" : "#f8f9f7"} intensity={autumn ? 0.36 : 0.42} roughness={0.9} />)}
  </group>;
}

function Rooftop({ spring, autumn = false }: { spring: boolean; autumn?: boolean }) {
  return <group>
    <Box position={[0, 5.55, -0.47]} size={[9.55, 0.26, 7.65]} color={spring ? "#69777d" : "#3c5360"} emissive={autumn ? "#be7d4c" : undefined} intensity={autumn ? 0.1 : 0} roughness={spring ? 0.75 : 0.28} outline />
    <Box position={[0, 5.75, -0.47]} size={[8.9, 0.14, 7.07]} color={spring ? "#a2a8a2" : "#536d73"} emissive={autumn ? "#cf9564" : undefined} intensity={autumn ? 0.1 : 0} />
    {[-3.8, 3.8].map((x) => <group key={x} position={[x, 5.82, -2.65]}>
      <Box position={[0, 0.34, 0]} size={[0.7, 0.68, 0.86]} color="#9aaba9" />
      {[0, 0.15, 0.3].map((y) => <Box key={y} position={[0, 0.08 + y, 0.44]} size={[0.52, 0.045, 0.015]} color="#47616a" />)}
    </group>)}
    <Tube from={[-3.8, 6.14, -2.65]} to={[-3.8, 6.14, -1.78]} radius={0.045} color="#9aaba9" />
    <Tube from={[-3.8, 6.14, -1.78]} to={[-2.8, 5.88, -1.78]} radius={0.045} color="#9aaba9" />
    <Box position={[0, 5.9, -2.1]} size={[2.7, 0.29, 1.33]} color="#38505c" />
  </group>;
}

function SideAlley({ spring }: { spring: boolean }) {
  return <group>
    <group position={[4.67, 0, -2.52]} rotation={[0, Math.PI / 2, 0]}>
      <Box position={[0, 1.32, 0]} size={[1.24, 2.64, 0.08]} color={spring ? "#a39179" : "#607681"} />
      <Box position={[0, 1.3, 0.065]} size={[0.96, 2.28, 0.035]} color={spring ? "#d1c1a8" : "#98a9a9"} />
      <Box position={[0, 2.58, 0.075]} size={[1.2, 0.14, 0.1]} color={spring ? "#81705d" : "#344e5c"} />
      <Box position={[0.3, 1.3, 0.089]} size={[0.08, 0.16, 0.015]} color={spring ? "#5d5a54" : "#415463"} />
      <Box position={[0, 1.82, 0.089]} size={[0.42, 0.23, 0.012]} color={spring ? "#746e63" : "#49616c"} />
      <Label text="STAFF" position={[0, 1.82, 0.101]} width={0.4} height={0.12} color="#e5e8d6" fontSize={62} />
      <Box position={[0, 0.13, 0.18]} size={[1.45, 0.2, 0.76]} color={spring ? "#aaa396" : "#657b83"} />
    </group>
    <group position={[4.68, 0, -0.4]} rotation={[0, Math.PI / 2, 0]}>
      <Box position={[0, 2.98, 0]} size={[1.43, 0.85, 0.12]} color={spring ? "#e0d1b8" : "#a9b7b6"} />
      <Box position={[0, 2.98, 0.075]} size={[1.22, 0.63, 0.03]} color={spring ? "#77736a" : "#465c64"} />
      {[-0.43, -0.23, -0.03, 0.17, 0.37].map((x) => <Box key={x} position={[x, 2.98, 0.096]} size={[0.04, 0.56, 0.01]} color={spring ? "#b6afa1" : "#94a9ac"} />)}
      <Box position={[0, 3.52, 0]} size={[1.56, 0.09, 0.22]} color={spring ? "#666158" : "#384e58"} />
    </group>
    <Tube from={[4.73, 4.35, -3.6]} to={[4.73, 4.35, 1.7]} radius={0.052} color={spring ? "#b09d81" : "#82969a"} />
    <Tube from={[4.73, 4.35, -3.6]} to={[4.73, 0.28, -3.6]} radius={0.052} color={spring ? "#b09d81" : "#82969a"} />
    <Tube from={[4.73, 4.35, 1.7]} to={[4.73, 3.65, 1.7]} radius={0.052} color={spring ? "#b09d81" : "#82969a"} />
    <Box position={[5.04, 3.55, -3.55]} size={[0.52, 0.42, 0.64]} color={spring ? "#e0d1b8" : "#98aaaa"} />
    {[0, 0.17, 0.34].map((y) => <Box key={y} position={[5.31, 3.41 + y, -3.55]} size={[0.025, 0.045, 0.49]} color={spring ? "#898274" : "#526a72"} />)}
    <group position={[6.1, 0.12, -1.0]}>
      <Box position={[0, 0.34, 0]} size={[0.82, 0.68, 0.61]} color={spring ? "#99866e" : "#49616c"} />
      <Box position={[0, 0.7, 0]} size={[0.9, 0.07, 0.67]} color={spring ? "#aaa294" : "#5b7782"} />
      <Box position={[0.18, 0.99, -0.12]} size={[0.63, 0.51, 0.47]} color={spring ? "#cfbda3" : "#78949c"} />
      <Box position={[0.18, 1.27, -0.12]} size={[0.69, 0.065, 0.52]} color={spring ? "#686259" : "#324b59"} />
      <Box position={[-0.23, 0.34, 0.31]} size={[0.23, 0.37, 0.015]} color={spring ? "#e4dcc9" : "#c1d1c4"} />
    </group>
    <group position={[5.62, 0.12, -3.69]}>
      <mesh position={[0, 0.27, 0]}><cylinderGeometry args={[0.25, 0.23, 0.54, 12]} /><meshStandardMaterial color={spring ? "#aa957a" : "#586a70"} emissive={spring ? "#9c815e" : "#000000"} emissiveIntensity={spring ? 0.15 : 0} /></mesh>
      <mesh position={[0, 0.56, 0]}><cylinderGeometry args={[0.27, 0.27, 0.07, 12]} /><meshStandardMaterial color={spring ? "#bbb2a2" : "#a0aaa8"} /></mesh>
      <Box position={[0.55, 0.43, 0]} size={[0.5, 0.74, 0.55]} color={spring ? "#ae997e" : "#607d83"} />
      <Box position={[0.55, 0.82, 0]} size={[0.57, 0.06, 0.61]} color={spring ? "#615d56" : "#344c57"} />
    </group>
    {[[-6.7, -2.9], [-6.15, -2.6]].map(([x, z], i) => <group key={i} position={[x, 0.07, z]}>
      <mesh position={[0, 0.28, 0]}><cylinderGeometry args={[0.21, 0.17, 0.57, 10]} /><meshStandardMaterial color="#ce895f" /></mesh>
      <Box position={[0, 0.42, 0]} size={[0.36, 0.095, 0.36]} color="#eee0bb" />
    </group>)}
    <pointLight position={[6.1, 3.6, -0.35]} color={spring ? "#f5dfb8" : "#8cc6d1"} intensity={spring ? 0.18 : 4.2} distance={5.2} />
  </group>;
}

function Drips({ active }: { active: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => { if (active && group.current) group.current.position.y = -((clock.elapsedTime * 0.8) % 0.8); });
  return <group ref={group} visible={active}>
    {[-4.3, -2.5, -0.9, 0.6, 2.3, 4.35].map((x, i) => <mesh key={i} position={[x, 3.7 - i * 0.07, 4.11]}>
      <sphereGeometry args={[0.035, 8, 6]} /><meshBasicMaterial color="#9cc8d2" transparent opacity={0.72} />
    </mesh>)}
  </group>;
}

function SummerLightning({ active, onFlash }: { active: boolean; onFlash: () => void }) {
  const ambient = useRef<THREE.AmbientLight>(null);
  const directional = useRef<THREE.DirectionalLight>(null);
  const streetFill = useRef<THREE.PointLight>(null);
  const nextFlashAt = useRef(-1);
  const flashStartedAt = useRef(-1);

  useEffect(() => {
    nextFlashAt.current = -1;
    flashStartedAt.current = -1;
    if (ambient.current) ambient.current.intensity = 0;
    if (directional.current) directional.current.intensity = 0;
    if (streetFill.current) streetFill.current.intensity = 0;
  }, [active]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (!active) return;

    if (nextFlashAt.current < 0) nextFlashAt.current = now + 4 + Math.random() * 4;
    if (flashStartedAt.current < 0 && now >= nextFlashAt.current) {
      flashStartedAt.current = now;
      onFlash();
    }

    let strength = 0;
    if (flashStartedAt.current >= 0) {
      const phase = now - flashStartedAt.current;
      if (phase < 0.055) strength = phase / 0.055;
      else if (phase < 0.14) strength = 1 - ((phase - 0.055) / 0.085) * 0.82;
      else if (phase < 0.2) strength = 0.18 * (1 - (phase - 0.14) / 0.06);
      else if (phase < 0.255) strength = ((phase - 0.2) / 0.055) * 0.68;
      else if (phase < 0.39) strength = 0.68 * (1 - (phase - 0.255) / 0.135);
      else if (phase < 0.68) strength = 0.1 * (1 - (phase - 0.39) / 0.29);
      else {
        flashStartedAt.current = -1;
        nextFlashAt.current = now + 9 + Math.random() * 10;
      }
    }

    if (ambient.current) ambient.current.intensity = strength * 1.35;
    if (directional.current) directional.current.intensity = strength * 3.2;
    if (streetFill.current) streetFill.current.intensity = strength * 4.4;
  });

  return <>
    <ambientLight ref={ambient} intensity={0} color="#d9e8ff" />
    <directionalLight ref={directional} position={[-7, 13, 8]} intensity={0} color="#dbe9ff" />
    <pointLight ref={streetFill} position={[-2.5, 7.5, 7]} intensity={0} distance={18} decay={2} color="#d7eaff" />
  </>;
}

function Scene(props: Props & { compact: boolean }) {
  const entryProgress = useRef(0);
  const spring = props.season === "spring";
  const autumn = props.season === "autumn";
  const winter = props.season === "winter";
  const summer = props.season === "summer";
  const warmSeason = spring || autumn;
  const summerRain = summer && props.mode !== "inside";
  const winterOutside = winter && props.mode !== "inside";
  return <>
    <color attach="background" args={[props.mode !== "inside" ? (autumn ? "#f4ddc3" : spring ? "#fff0f4" : winter ? "#1a3040" : "#0e222e") : "#0e222e"]} />
    <fog attach="fog" args={[props.mode !== "inside" ? (autumn ? "#f4ddc3" : spring ? "#fff0f4" : winter ? "#1a3040" : "#0e222e") : "#0e222e", 26, 52]} />
    <ambientLight intensity={0.78} color="#a0c0cb" />
    <directionalLight position={[-5, 12, 9]} intensity={1.8} color="#a5c9d7" />
    <pointLight position={[-5.8, 5.3, 4.5]} intensity={3.2} distance={12} color="#77b9d8" />
    <SummerLightning active={summer && props.mode === "outside"} onFlash={props.onLightningFlash} />
    <CameraController mode={props.mode} resetViewKey={props.resetViewKey} onViewReset={props.onViewReset} onEntered={props.onEntered} entryProgress={entryProgress} />
    <group position={[0, -0.37, 0]}>
      <EntryExterior mode={props.mode} entryProgress={entryProgress}>
      <Street spring={warmSeason} rainy={summerRain} winter={winter} /><StreetProps spring={warmSeason} />
      </EntryExterior>
      <Interior projects={props.projects} onSelect={props.onSelect} onCheckout={props.onCheckout} onProfile={props.onProfile} active={props.mode === "inside"} fitRoom={props.mode !== "outside"} loadProjects={props.preloadStage >= 1 || props.mode !== "outside"} loadCheckout={props.preloadStage >= 2 || props.mode !== "outside"} />
      <EntryExterior mode={props.mode} entryProgress={entryProgress}>
      <Facade mode={props.mode} onEnter={props.onEnter} spring={warmSeason} rainy={summerRain} /><SpringExteriorWalls active={warmSeason && props.mode !== "inside"} autumn={autumn} /><Rooftop spring={warmSeason} autumn={autumn} /><SideAlley spring={warmSeason} />
      <VendingMachine spring={warmSeason} /><Bicycle spring={warmSeason} /><EntranceProps spring={warmSeason} /><Drips active={summerRain} />
      <SpringLight active={warmSeason && props.mode !== "inside"} autumn={autumn} /><SpringSunbeam active={warmSeason && props.mode !== "inside"} autumn={autumn} />
      <SpringPetals active={spring && props.mode !== "inside"} compact={props.compact} /><AutumnLeaves active={autumn && props.mode !== "inside"} compact={props.compact} />
      <WinterSnowflakes active={winterOutside} compact={props.compact} /><WinterSnowCover active={winterOutside} />
      <Rain active={summerRain} count={props.compact ? 100 : 180} />
      <RainImpacts active={summerRain} count={props.compact ? 100 : 180} />
      </EntryExterior>
    </group>
  </>;
}

export default function RainyStoreScene(props: Props) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 720px)");
    const update = () => setCompact(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return <Canvas camera={{ fov: 58, near: 0.1, far: 90, position: [0, 2.7, 23] }} dpr={[1, compact ? 1.2 : 1.5]} gl={{ antialias: true, powerPreference: "high-performance" }}>
    <Scene {...props} compact={compact} />
  </Canvas>;
}
