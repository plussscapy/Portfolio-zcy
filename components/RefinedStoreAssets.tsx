import { Component, type ReactNode, type RefObject, Suspense, useEffect, useLayoutEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from "three";
import { applyStoreSnow } from "./storeSnow";

class AssetBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Store model could not load", error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

type MaterialStyle = {
  color?: string;
  opacity?: number;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
};
type ModelProps = {
  file: string;
  materials?: Record<string, MaterialStyle>;
  snow?: boolean;
  doorway?: Group;
  materialRefs?: Record<string, RefObject<MeshStandardMaterial | undefined>>;
} & MaterialStyle;

export const storeModelUrl = (file: string) => `${import.meta.env.BASE_URL}models/common-v4/${file}.glb`;

// The GLB batches the sill into the window frame and the floor channels
// into the overhead track. Separate those low faces from the fixtures.
function splitThresholdFaces(mesh: Mesh) {
  const isSill = mesh.name.startsWith("Existing_window_frame");
  const bounds = isSill
    ? new Box3(new Vector3(-4.701, 0.044, 3.249), new Vector3(4.701, 0.196, 3.511))
    : mesh.name.startsWith("Top_sliding_track")
      ? new Box3(new Vector3(-1.141, 0.183, 3.283), new Vector3(1.141, 0.197, 3.377))
      : undefined;
  const { geometry } = mesh;
  if (!bounds || !geometry.index) return;
  const position = geometry.getAttribute("position");
  const vertex = new Vector3();
  const inThreshold = new Uint8Array(position.count);
  for (let i = 0; i < position.count; i++) {
    inThreshold[i] = Number(bounds.containsPoint(vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)));
  }
  const facade: number[] = [];
  const sill: number[] = [];
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const faces = inThreshold[a] && inThreshold[b] && inThreshold[c] ? sill : facade;
    faces.push(a, b, c);
  }
  if (!sill.length || !facade.length) return;
  return { facade, sill, isSill };
}

function sillGeometry(left: number, right: number) {
  // Match the original full-width sill's height and depth.
  return new BoxGeometry(right - left, 0.15, 0.26).translate((left + right) / 2, 0.12, 3.38);
}

function Model({ file, color, emissive, emissiveIntensity, materials, materialRefs, snow, doorway }: ModelProps) {
  const gltf = useLoader(GLTFLoader, storeModelUrl(file));
  const acceptsSnow = snow !== undefined;
  const { scene, instances, copies, snowAmounts, geometries, doorwayMeshes } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    if (doorway) scene.updateMatrixWorld(true);
    const instances = new Map<string, { original: MeshStandardMaterial; material: MeshStandardMaterial }>();
    const copies = new Set<MeshStandardMaterial | MeshBasicMaterial>();
    const geometries: Mesh["geometry"][] = [];
    const snowAmounts: { value: number }[] = [];
    const doorwayMeshes: Mesh[] = [];
    const facadeSills: Mesh[] = [];
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
      // The facade GLB batches both cream emblem faces into this mesh.
      if (file === "facade" && /^Web_\|_Facade0010\d*$/.test(object.name)) {
        const material = new MeshBasicMaterial({ color: "#ffffff", toneMapped: false, side: object.material.side });
        object.material = material;
        copies.add(material);
        return;
      }
      const copy = (original: MeshStandardMaterial, name = object.name) => {
        const material = original.clone();
        copies.add(material);
        if (original instanceof MeshStandardMaterial) {
          instances.set(name, { original, material });
          if (acceptsSnow && !original.transparent && key !== "site_base" && key !== "site_top") {
            const coverage = file !== "street" ? "surface" : key === "road" ? "crosswalk" : "ground";
            snowAmounts.push(applyStoreSnow(material, coverage));
          }
        }
        return material;
      };
      if (file === "facade" && object.material instanceof MeshStandardMaterial) {
        const original = object.material;
        const split = doorway && splitThresholdFaces(object);
        if (split) {
          const material = copy(original);
          const fixedMaterial = copy(original, `${object.name}:doorway`);
          const facadeGeometry = object.geometry.clone().setIndex(split.facade);
          const fixedGeometry = split.isSill
            ? sillGeometry(-1.14, 1.14)
            : object.geometry.clone().setIndex(split.sill).applyMatrix4(object.matrixWorld);
          const fixed = new Mesh(fixedGeometry, fixedMaterial);
          fixed.name = split.isSill ? "EntryThreshold" : "EntryThresholdRails";
          doorwayMeshes.push(fixed);
          geometries.push(facadeGeometry, fixedGeometry);
          object.material = material;
          object.geometry = facadeGeometry;
          // The window bases still belong to the facade. Only the span
          // across the doorway remains in place after the windows fade.
          if (split.isSill) {
            for (const side of [sillGeometry(-4.7, -1.14), sillGeometry(1.14, 4.7)]) {
              facadeSills.push(new Mesh(side, material));
              geometries.push(side);
            }
          }
          return;
        }
        if (object.name.startsWith("Floor_to_threshold_infill")) {
          const floor = copy(original);
          floor.userData.entryFade = "floor";
          object.material = floor;
          return;
        }
      }
      object.material = Array.isArray(object.material) ? object.material.map((material) => copy(material)) : copy(object.material);
    });
    for (const sill of facadeSills) scene.add(sill);
    return { scene, instances, copies, snowAmounts, geometries, doorwayMeshes };
  }, [gltf, file, acceptsSnow, doorway]);

  useLayoutEffect(() => {
    if (!doorway || !doorwayMeshes.length) return;
    doorway.add(...doorwayMeshes);
    return () => { doorway.remove(...doorwayMeshes); };
  }, [doorway, doorwayMeshes]);

  useLayoutEffect(() => {
    for (const amount of snowAmounts) amount.value = snow ? 1 : 0;
  }, [snow, snowAmounts]);

  useLayoutEffect(() => {
    for (const [name, { original, material }] of instances) {
      const key = name.replace(/_?\d+$/, "");
      const style = materials?.[key] ?? materials?.[original.name];
      const nextColor = style?.color ?? color;
      const nextEmissive = style?.emissive ?? emissive;
      if (style?.opacity !== undefined || file === "facade") material.opacity = style?.opacity ?? original.opacity;
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
