import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import layout from "../lib/store-lighting.json";

// A shared layout keeps each light directly under its Blender ceiling diffuser.
RectAreaLightUniformsLib.init();

export function StoreLighting() {
  return <group>
    {layout.positions.map(([x, y, z]) => <rectAreaLight key={`${x}-${z}`}
      position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}
      width={layout.width} height={layout.depth}
      color={layout.color} intensity={layout.intensity} />)}
  </group>;
}
