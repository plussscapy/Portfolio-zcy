import { MeshStandardMaterial } from "three";

export type SnowCoverage = "surface" | "ground" | "crosswalk";

export function applyStoreSnow(material: MeshStandardMaterial, coverage: SnowCoverage, footprints = false) {
  const amount = { value: 0 };
  material.customProgramCacheKey = () => `store-snow-${coverage}${footprints ? "-footprints" : ""}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.storeSnow = amount;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 snowPosition;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nsnowPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float storeSnow;\nvarying vec3 snowPosition;")
      .replace("#include <normal_fragment_begin>", `#include <normal_fragment_begin>
        vec3 snowNormal = inverseTransformDirection(normal, viewMatrix);
        vec2 snowUV = snowPosition.xz;
        float snowCover = ${coverage === "crosswalk" ? "0.0" : "storeSnow * smoothstep(0.29, 0.69, snowNormal.y)"};
        ${coverage === "crosswalk" ? `
          float stripeDistance = abs(snowUV.x - 1.3 * floor(snowUV.x / 1.3 + 0.5)) - 0.335;
          float crossingDistance = max(max(stripeDistance, abs(snowUV.x) - 4.235), abs(snowUV.y - 6.08) - 1.3);
          float paintEdge = max(fwidth(crossingDistance), 0.0001);
          float roadPaint = (1.0 - smoothstep(-paintEdge, paintEdge, crossingDistance))
            * step(0.95, snowNormal.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.77, 0.82, 0.85), roadPaint);
          roughnessFactor = mix(roughnessFactor, 0.85, roadPaint);
          metalnessFactor *= 1.0 - roadPaint;
        ` : ""}
        vec3 snowColor = vec3(0.83, 0.89, 0.95);
        ${footprints ? "snowColor *= sampledDiffuseColor.rgb; diffuseColor.rgb = diffuse;" : ""}
        diffuseColor.rgb = mix(diffuseColor.rgb, snowColor, snowCover);
        roughnessFactor = mix(roughnessFactor, 0.98, snowCover);
        metalnessFactor *= 1.0 - snowCover;
      `)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, snowCover));
      `)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance = mix(totalEmissiveRadiance, vec3(0.035, 0.047, 0.067), snowCover);
      `);
  };
  return amount;
}
