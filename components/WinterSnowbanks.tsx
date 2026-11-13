import { useEffect, useMemo } from "react";
import { CanvasTexture, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { applyStoreSnow } from "./storeSnow";

const width = 3.1;
const depth = 9;
const trails = [
  [[-1.05, -3.6, -0.4], [-0.84, -3.1, -0.2], [-0.83, -2.52, 0.12], [-0.61, -1.95, 0.36], [0.12, 1.8, 0.8], [0.5, 2.28, 0.62], [0.62, 2.79, 0.32]],
  [[0.94, -3.35, -0.55], [0.61, -2.73, -0.42], [0.49, -2.01, -0.19], [0.13, -1.29, -0.35], [-0.51, 1.17, 0.25], [-0.17, 1.69, 0.42], [0.05, 2.43, 0.35], [0.42, 3.02, 0.58]],
];

function snowTexture(side: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 384;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  function print(x: number, z: number, angle: number, dog: boolean) {
    const size = dog ? 0.29 : 0.22;
    ctx.save();
    ctx.translate((x / width + 0.5) * canvas.width, (z / depth + 0.5) * canvas.height);
    ctx.scale(canvas.width / width, canvas.height / depth);
    ctx.rotate(-angle);
    ctx.scale(size, size);
    const pads = [
      [0, 0.13, dog ? 0.25 : 0.23, 0.18],
      [-0.27, -0.08, 0.095, 0.12], [-0.1, -0.26, 0.091, 0.125],
      [0.1, -0.26, 0.091, 0.125], [0.27, -0.08, 0.095, 0.12],
    ];
    if (dog) pads.push([-0.12, -0.43, 0.028, 0.04], [0.12, -0.43, 0.028, 0.04]);
    for (const [px, py, rx, ry] of pads) {
      const edge = ctx.createLinearGradient(0, py - ry, 0, py + ry);
      edge.addColorStop(0, "#778da1");
      edge.addColorStop(0.75, "#a9bccb");
      edge.addColorStop(1, "#f5fbff");
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.ellipse(px, py, rx, ry, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.restore();
  }

  trails[side].forEach(([x, z, angle], index) => print(x, z, angle, (side === 1) !== (index >= 4)));
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}

export function WinterSnowbanks() {
  const { geometry, materials } = useMemo(() => {
    const geometry = new PlaneGeometry(width, depth, 48, 80);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i);
      // A broad, curved falloff joins the existing pavement with a flat tangent.
      const cross = Math.min(1, (width / 2 - Math.abs(x)) / 0.85);
      const along = Math.min(1, (depth / 2 - Math.abs(z)) / 0.9);
      const taper = cross * cross * (3 - 2 * cross) * along * along * (3 - 2 * along);
      positions.setY(i, Math.max(0, taper) * 0.082);
    }
    geometry.computeVertexNormals();
    const materials = ["#788b91", "#72858b"].map((color, index) => {
      const material = new MeshStandardMaterial({ color, map: snowTexture(index) });
      applyStoreSnow(material, "ground", true).value = 1;
      return material;
    });
    return { geometry, materials };
  }, []);
  useEffect(() => () => {
    geometry.dispose();
    materials.forEach((material) => {
      material.map?.dispose();
      material.dispose();
    });
  }, [geometry, materials]);

  return <group>
    {[-6.66, 6.66].map((x, index) => <mesh key={x} position={[x, 0.034, -0.85]}
      geometry={geometry} material={materials[index]} />)}
  </group>;
}
