import { Suspense, useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { BoxGeometry, RepeatWrapping, TextureLoader } from "three";

type WallProps = {
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  emissive?: string;
  intensity?: number;
};

function PaintedWall({ position, size, color, emissive, intensity = 0 }: WallProps) {
  const maps = useLoader(TextureLoader, [
    "/models/refinement/textures/paint-normal.png",
    "/models/refinement/textures/paint-orm.png",
  ]);
  const [normal, orm] = useMemo(() => maps.map((map) => {
    const texture = map.clone();
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 2;
    texture.needsUpdate = true;
    return texture;
  }), [maps]);
  const geometry = useMemo(() => {
    const box = new BoxGeometry(...size);
    const p = box.attributes.position, n = box.attributes.normal, uv = box.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + position[0], y = p.getY(i) + position[1], z = p.getZ(i) + position[2];
      // Match the Blender walls' 45 cm grain scale, including portrait extensions.
      uv.setXY(i, (Math.abs(n.getX(i)) > .5 ? -z : x) / .45, (Math.abs(n.getY(i)) > .5 ? -z : y) / .45);
    }
    return box;
  }, [size[0], size[1], size[2], position[0], position[1], position[2]]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => { normal.dispose(); orm.dispose(); }, [normal, orm]);
  return <mesh position={position} geometry={geometry} castShadow receiveShadow>
    <meshPhysicalMaterial color={color} emissive={emissive || color} emissiveIntensity={intensity}
      roughness={1} roughnessMap={orm} metalness={0} ior={1.45} specularIntensity={.5}
      normalMap={normal} normalScale={[.65, .65]} clearcoat={0} />
  </mesh>;
}

export function MatteWall(props: WallProps) {
  return <Suspense fallback={<mesh position={props.position} castShadow receiveShadow>
    <boxGeometry args={props.size} />
    <meshStandardMaterial color={props.color} emissive={props.emissive || props.color}
      emissiveIntensity={props.intensity || 0} roughness={.955} metalness={0} />
  </mesh>}><PaintedWall {...props} /></Suspense>;
}
