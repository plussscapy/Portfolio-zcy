import { Component, type ReactNode, type RefObject, Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Mesh, MeshStandardMaterial, Vector3 } from "three";
import { applyStoreSnow } from "./storeSnow";

class AssetBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Store model could not load", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

type MaterialStyle = {
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
};
type ModelProps = {
  file: string;
  materials?: Record<string, MaterialStyle>;
  snow?: boolean;
  materialRefs?: Record<string, RefObject<MeshStandardMaterial | undefined>>;
} & MaterialStyle;

function Model({ file, color, emissive, emissiveIntensity, materials, materialRefs, snow }: ModelProps) {
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/common-v4/${file}.glb`);
  const acceptsSnow = snow !== undefined;
  const { scene, instances, copies, snowAmounts, geometries } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    const instances = new Map<string, { original: MeshStandardMaterial; material: MeshStandardMaterial }>();
    const copies = new Set<MeshStandardMaterial>();
    const geometries: Mesh["geometry"][] = [];
    const snowAmounts: { value: number }[] = [];
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const key = object.name.replace(/_?\d+$/, "");
      // The road material draws the paint on its own surface.
      if (file === "street" && key === "crosswalk") {
        object.visible = false;
        return;
      }
      // The shallow bedding box has the same footprint as the entry slab.
      // Remove its overlapping faces while retaining the separate rear walkway.
      if (file === "street" && object.name.startsWith("Assembly_|_Entrance_sidewalk_bedding")) {
        const position = object.geometry.getAttribute("position");
        const index = object.geometry.index;
        if (index) {
          const vertex = new Vector3();
          const faces = [];
          for (let i = 0; i < index.count; i += 3) {
            const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            if (triangle.every((id) => vertex.fromBufferAttribute(position, id).applyMatrix4(object.matrix).z < 3)) {
              faces.push(...triangle);
            }
          }
          object.geometry = object.geometry.clone();
          object.geometry.setIndex(faces);
          geometries.push(object.geometry);
        }
      }
      // The imported window glints straddle the glass face at z=3.42.
      // Keep the thin printed highlights clear of the glazing depth plane.
      if (file === "facade" && /^Web_\|_Facade00(?:4[7-9]|5[0126-9]|6[01])/.test(object.name)) {
        object.position.z += 0.012;
      }
      const copy = (original: MeshStandardMaterial) => {
        const material = original.clone();
        copies.add(material);
        if (original instanceof MeshStandardMaterial) {
          instances.set(object.name, { original, material });
          if (acceptsSnow && !original.transparent && key !== "site_base" && key !== "site_top") {
            const coverage = file !== "street" ? "surface" : key === "road" ? "crosswalk" : "ground";
            snowAmounts.push(applyStoreSnow(material, coverage));
          }
        }
        return material;
      };
      object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
    });
    return { scene, instances, copies, snowAmounts, geometries };
  }, [gltf, file, acceptsSnow]);

  useLayoutEffect(() => {
    for (const amount of snowAmounts) amount.value = snow ? 1 : 0;
  }, [snow, snowAmounts]);

  useLayoutEffect(() => {
    for (const [name, { original, material }] of instances) {
      const key = name.replace(/_?\d+$/, "");
      const style = materials?.[key];
      const nextColor = style?.color ?? color;
      const nextEmissive = style?.emissive ?? emissive;
      material.color.copy(original.color);
      material.emissive.copy(original.emissive);
      if (nextColor) material.color.set(nextColor);
      if (nextEmissive) material.emissive.set(nextEmissive);
      material.emissiveIntensity = style?.emissiveIntensity ?? emissiveIntensity ?? original.emissiveIntensity;
      material.roughness = style?.roughness ?? original.roughness;
      material.metalness = style?.metalness ?? original.metalness;
      if (materialRefs?.[key]) materialRefs[key].current = material;
    }
    return () => {
      for (const ref of Object.values(materialRefs ?? {})) ref.current = undefined;
    };
  }, [instances, color, emissive, emissiveIntensity, materials, materialRefs]);

  useEffect(() => () => {
    copies.forEach((material) => material.dispose());
    geometries.forEach((geometry) => geometry.dispose());
  }, [copies, geometries]);
  return <primitive object={scene} dispose={null} />;
}

export function RefinedAsset({ fallback = null, ...props }: ModelProps & { fallback?: ReactNode }) {
  return <AssetBoundary key={props.file} fallback={fallback}>
    <Suspense fallback={fallback}><Model {...props} /></Suspense>
  </AssetBoundary>;
}
