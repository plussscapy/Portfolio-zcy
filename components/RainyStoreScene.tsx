"use client";

import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { RefinedAsset } from "./RefinedStoreAssets";
import { MatteWall } from "./MatteWall";
import { WinterSnowbanks } from "./WinterSnowbanks";
import { StoreLighting } from "./StoreLighting";
import giftLayout from "../lib/gift-box-layout.json";
import type { Project } from "../lib/projects";
import { advanceEntryTime, createEntryPath, entryDistanceAtTime, ENTRY_END, ENTRY_LOOK_END, interiorCameraPosition, makeEntryTiming, smoothRange } from "../lib/entry-path";

type Mode = "outside" | "entering" | "inside";
type Season = "spring" | "summer" | "autumn" | "winter";
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
    <RefinedAsset file="street" snow={winter} materials={{
      site_base: { color: spring ? "#39434b" : "#122b38" },
      site_top: { color: spring ? "#f4f5f3" : "#253845", emissive: "#f4f5f3", emissiveIntensity: spring ? 0.55 : 0, roughness: spring ? 0.88 : 0.46 },
      road: { color: spring ? "#62666c" : winter ? "#344651" : "#3a5460", emissive: "#62666c", emissiveIntensity: spring ? 0.32 : 0, roughness: spring || winter ? 0.9 : 0.14, metalness: spring || winter ? 0 : 0.38 },
      walk_left: { color: spring ? "#f6f7f5" : "#788b91", emissive: "#f6f7f5", emissiveIntensity: spring ? 0.55 : 0 },
      walk_right: { color: spring ? "#f6f7f5" : "#72858b", emissive: "#f6f7f5", emissiveIntensity: spring ? 0.55 : 0 },
      walk_entry: { color: spring ? "#f6f7f5" : "#858e8b", emissive: "#f6f7f5", emissiveIntensity: spring ? 0.55 : 0 },
      curb: { color: spring ? "#e5e8e7" : "#c4c2ad" },
    }} />
    <group visible={rainy}>
    {([[-3.2, 6.3, 0.75, 2.6, "#5daeca"], [-1.7, 5.82, 0.5, 1.7, "#e6be7e"], [0.35, 6.75, 0.85, 2.7, "#6bbdd1"], [2.45, 5.76, 0.64, 2.1, "#f1cd8d"], [-6.15, 5.58, 0.48, 2.5, "#f37b98"]] as [number, number, number, number, string][]).map(([x, z, w, h, color], i) =>
      <WetReflection key={`reflection-${i}`} x={x} z={z} width={w} length={h} color={color} phase={i * 1.7} active={rainy} />)}
    <WetReflection x={0} z={5.06} width={4.75} length={1.45} color="#f5d59a" phase={0.8} active={rainy} />
    <WetReflection x={-5.35} z={6.9} width={1.55} length={2.15} color="#9dd4e1" phase={2.1} active={rainy} />
    </group>
  </group>;
}

function StreetProps({ spring, winter }: { spring: boolean; winter: boolean }) {
  const signal = useRef<THREE.MeshStandardMaterial | undefined>(undefined);
  useFrame(({ clock }) => {
    if (signal.current) signal.current.emissiveIntensity = spring ? 0.18 : 0.3 + (Math.sin(clock.elapsedTime * 0.7) > 0.7 ? 1 : 0);
  });
  return <group>
    <RefinedAsset file="street-props" snow={winter} materials={{
      street_lamp: { emissive: "#f4d596", emissiveIntensity: spring ? 0.12 : 1.1 },
      traffic_signal: { emissive: "#f45c54" },
    }} materialRefs={{ traffic_signal: signal }} />
    <Glow position={[-6.15, 5.43, 3.65]} color="#ffd8a0" size={[2.5, 2.5]} opacity={spring ? 0.05 : 0.42} />
    <pointLight position={[-6.15, 5.4, 3.15]} color="#f0c685" intensity={spring ? 0.2 : 7} distance={7} />
  </group>;
}

function VendingMachine({ spring, winter }: { spring: boolean; winter: boolean }) {
  return <group>
    <RefinedAsset file="vending" snow={winter} />
    <group position={[-5.65, 0.08, 2.03]}>
      <Glow position={[0, 1.8, 0.68]} color="#95d8ec" size={[1.5, 2.6]} opacity={spring ? 0.04 : 0.26} />
      <pointLight position={[0, 1.7, 0.62]} intensity={spring ? 0.2 : 2.4} distance={3} color="#a5def5" />
    </group>
  </group>;
}

function InteriorStock(props: { position: [number, number, number]; rotation?: [number, number, number]; length?: number; levels?: number; front?: boolean }) {
  const file = props.front ? "stock-front" : props.length === 1.65 ? "stock-back" : "stock-wide";
  return <group position={props.position} rotation={props.rotation}>
    <RefinedAsset file={file} fallback={<OriginalInteriorStock {...props} position={[0, 0, 0]} rotation={[0, 0, 0]} />} />
  </group>;
}

function OriginalInteriorStock({ position, rotation = [0, 0, 0], length = 2.3, levels = 3 }: { position: [number, number, number]; rotation?: [number, number, number]; length?: number; levels?: number }) {
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
  return <group position={[2.25, 0, -1.35]}>
    <Clickable position={[0, 0.15, 0]} active={active} hoverScale={1.015} onClick={(e) => {
      if (e.intersections.some((hit) => hit.object.userData.projectGift)) return;
      e.stopPropagation();
      onCheckout();
    }}>
      {/* Source: MONDAY_MART24_counter.blend; hover stays anchored to the floor. */}
      <group position={[0, -0.15, 0]}>
        <RefinedAsset file="checkout" fallback={<>
          <Box position={[0, 0.75, 0]} size={[3.98, 1.2, 1.06]} color="#acbfba" />
          <Box position={[0, 1.312, 0]} size={[4.15, 0.086, 1.258]} color="#ebe7d9" />
        </>} />
      </group>
      {/* Preserve the previous contact hit area's world position and dimensions. */}
      <mesh position={[0, 0.61, 0.66]}>
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
  const floorEnd = active ? 3.31 : 3.16;
  useFrame(() => {
    // The extra room is only a camera surround. Never expose its outer shell
    // while approaching the shop from outside.
    if (extendedRoom.current) extendedRoom.current.visible = extension > 0 && (active || camera.position.z < 3.1 + extension - 0.35);
  });
  return <group>
    <Box position={[0, 0.11, (floorEnd - 4.16) / 2]} size={[9, 0.07, floorEnd + 4.16]} color="#eadbbd" emissive="#b38f56" intensity={0.05} />
    <RefinedAsset file="interior" />
    {extension > 0 && <group ref={extendedRoom} visible={false}>
      <Box position={[0, 0.11, 3.31 + extension / 2]} size={[9, 0.07, extension]} color="#eadbbd" emissive="#b38f56" intensity={0.05} />
      <MatteWall position={[-4.52, 2.7, 3.1 + extension / 2]} size={[0.16, 5.4, extension]} color="#d7ddda" />
      <MatteWall position={[4.52, 2.7, 3.1 + extension / 2]} size={[0.16, 5.4, extension]} color="#bec9c8" />
      <Box position={[0, 5.44, 3.15 + extension / 2]} size={[9.25, 0.14, extension]} color="#eeeede" roughness={0.94} />
    </group>}
    <InteriorStock position={[-1.77, 0.14, -1.65]} length={2.35} />
    <group visible={!mobileRoom}><InteriorStock position={[-1.77, 0.14, 0.55]} length={2.35} front /></group>
    <InteriorStock position={[0.15, 0.14, -3.36]} length={1.65} levels={2} />
    <ProjectDisplay projects={projects} onSelect={onSelect} active={active} loadImages={loadProjects} />
    <Suspense fallback={null}><SpriteCashier onProfile={onProfile} active={active} /></Suspense>
    {loadCheckout ? <Suspense fallback={<CheckoutPlaceholder onCheckout={onCheckout} active={active} />}><Checkout onCheckout={onCheckout} active={active} /></Suspense> : <CheckoutPlaceholder onCheckout={onCheckout} active={active} />}
    <StoreLighting />
    <group visible={!mobileRoom}><RefinedAsset file="magazine" /></group>
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
      <RefinedAsset file={side < 0 ? "door-left" : "door-right"} fallback={<>
      <Box position={[0, 3.61, 0.055]} size={[1.1, 0.055, 0.08]} color="#304d5b" />
      <Box position={[side * 0.52, 1.87, 0.055]} size={[0.055, 3.48, 0.08]} color="#304d5b" />
      <Box position={[0, 0.16, 0.055]} size={[1.1, 0.1, 0.08]} color="#304d5b" />
      <Box position={[-side * 0.42, 1.7, 0.067]} size={[0.025, 0.52, 0.03]} color="#d7e5df" />
      <Box position={[0, 1.13, 0.064]} size={[1.02, 0.1, 0.022]} color="#b0c3c5" opacity={0.6} />
      </>} />
    </group>)}
    <mesh position={[0, 1.9, 0.14]} onPointerOver={mode === "outside" ? (e) => { e.stopPropagation(); setHovered(true); } : undefined} onPointerOut={() => setHovered(false)} onClick={mode === "outside" ? (e) => { e.stopPropagation(); onEnter(); } : undefined}>
      <boxGeometry args={[2.25, 3.65, 0.14]} />
      <meshBasicMaterial color="#fff" transparent opacity={0.001} depthWrite={false} />
    </mesh>
  </group>;
}

function Facade({ mode, onEnter, spring, rainy, winter }: { mode: Mode; onEnter: () => void; spring: boolean; rainy: boolean; winter: boolean }) {
  const sign = useRef<THREE.Mesh>(null);
  // The warm-season front face receives little direct light. Give its white
  // lightbox a neutral luminance floor so tone mapping doesn't turn it gray;
  // the standard material still receives each season's exterior light.
  useFrame(({ clock }) => { if (sign.current) (sign.current.material as THREE.MeshStandardMaterial).emissiveIntensity = spring ? 1 : 0.45 + Math.sin(clock.elapsedTime * 1.2) * 0.035 + (Math.sin(clock.elapsedTime * 8.3) > 0.994 ? 0.12 : 0); });
  return <group>
    <RefinedAsset file="facade" snow={winter} />
    <RefinedAsset file="sign-shell" snow={winter} color={spring ? "#1688c7" : "#3e8db6"} fallback={<Box position={[0, 4.64, 3.3]} size={[9.35, 1.27, 0.36]} color={spring ? "#1688c7" : "#3e8db6"} outline />} />
    <mesh ref={sign} position={[0, 4.65, 3.594]}><boxGeometry args={[5.1, 0.76, 0.01]} /><meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={spring ? 1 : 0.45} /></mesh>
    <Label text="MONDAY" position={[-0.56, 4.68, 3.605]} width={3.38} height={0.61} color="#15516e" fontSize={196} sharp />
    <Label text="MART 24" position={[1.64, 4.68, 3.605]} width={1.33} height={0.28} color="#276a85" fontSize={147} sharp />
    <Glow position={[0, 4.68, 3.91]} color="#fff1c3" size={[6.4, 1.65]} opacity={spring ? 0.04 : 0.18} />
    {[-2.7, 0, 2.7].map((x) => <pointLight key={x} position={[x, 3.3, 3.85]} color="#ffdba2" intensity={spring ? 0.3 : 2.7} distance={3.5} />)}
    <GlassRain active={rainy && mode !== "inside"} />
    <SlidingDoors mode={mode} onEnter={onEnter} />
  </group>;
}

function SpringExteriorWalls({ active, autumn = false }: { active: boolean; autumn?: boolean }) {
  return <group visible={active}>
    {[-1, 1].map((side) => <MatteWall key={side} position={[side * 4.65, 2.7, -0.5]} size={[0.055, 5.3, 7.2]} color="#f8f9f7" emissive={autumn ? "#e8b47f" : "#f8f9f7"} intensity={autumn ? 0.36 : 0.42} />)}
  </group>;
}

function Rooftop({ spring, winter, autumn = false }: { spring: boolean; winter: boolean; autumn?: boolean }) {
  return <group>
    <RefinedAsset file="roof-shell" snow={winter} color={spring ? "#69777d" : "#3c5360"} emissive={autumn ? "#be7d4c" : undefined} emissiveIntensity={autumn ? 0.1 : 0} fallback={<Box position={[0, 5.55, -0.47]} size={[9.55, 0.26, 7.65]} color={spring ? "#69777d" : "#3c5360"} roughness={0.78} />} />
    <RefinedAsset file="roof-surface" snow={winter} color={spring ? "#a2a8a2" : "#536d73"} emissive={autumn ? "#cf9564" : undefined} emissiveIntensity={autumn ? 0.1 : 0} fallback={<Box position={[0, 5.75, -0.47]} size={[8.9, 0.14, 7.07]} color={spring ? "#a2a8a2" : "#536d73"} emissive={autumn ? "#cf9564" : undefined} intensity={autumn ? 0.1 : 0} />} />
    <RefinedAsset file="roof-equipment" snow={winter} fallback={<>
    {[-3.8, 3.8].map((x) => <group key={x} position={[x, 5.82, -2.65]}>
      <Box position={[0, 0.34, 0]} size={[0.7, 0.68, 0.86]} color="#9aaba9" />
      {[0, 0.15, 0.3].map((y) => <Box key={y} position={[0, 0.08 + y, 0.44]} size={[0.52, 0.045, 0.015]} color="#47616a" />)}
    </group>)}
    <Tube from={[-3.8, 6.14, -2.65]} to={[-3.8, 6.14, -1.78]} radius={0.045} color="#9aaba9" />
    <Tube from={[-3.8, 6.14, -1.78]} to={[-2.8, 5.88, -1.78]} radius={0.045} color="#9aaba9" />
    <Box position={[0, 5.9, -2.1]} size={[2.7, 0.29, 1.33]} color="#38505c" />
    </>} />
  </group>;
}

function SideAlley({ spring, winter }: { spring: boolean; winter: boolean }) {
  return <group>
    <RefinedAsset file="side-alley" snow={winter} />
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
      <Street spring={warmSeason} rainy={summerRain} winter={winter} />
      {winterOutside && <WinterSnowbanks />}<StreetProps spring={warmSeason} winter={winter} />
      </EntryExterior>
      <Interior projects={props.projects} onSelect={props.onSelect} onCheckout={props.onCheckout} onProfile={props.onProfile} active={props.mode === "inside"} fitRoom={props.mode !== "outside"} loadProjects={props.preloadStage >= 1 || props.mode !== "outside"} loadCheckout={props.preloadStage >= 2 || props.mode !== "outside"} />
      <EntryExterior mode={props.mode} entryProgress={entryProgress}>
      <Facade mode={props.mode} onEnter={props.onEnter} spring={warmSeason} rainy={summerRain} winter={winter} /><SpringExteriorWalls active={warmSeason && props.mode !== "inside"} autumn={autumn} /><Rooftop spring={warmSeason} winter={winter} autumn={autumn} /><SideAlley spring={warmSeason} winter={winter} />
      <VendingMachine spring={warmSeason} winter={winter} /><RefinedAsset file="bicycle" snow={winter} /><RefinedAsset file="entrance" snow={winter} /><Drips active={summerRain} />
      <SpringLight active={warmSeason && props.mode !== "inside"} autumn={autumn} /><SpringSunbeam active={warmSeason && props.mode !== "inside"} autumn={autumn} />
      <SpringPetals active={spring && props.mode !== "inside"} compact={props.compact} /><AutumnLeaves active={autumn && props.mode !== "inside"} compact={props.compact} />
      <WinterSnowflakes active={winterOutside} compact={props.compact} />
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
