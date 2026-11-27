import * as THREE from 'three';
import { markShared } from './kit/pbr';

/**
 * A soft, pulsing glow on the selected part: every visible surface of the part gets a see-through twin drawn on top
 * of it with a rim (fresnel) shader, so the part's edges and outline light up in the accent colour and the whole part
 * is tinted a little. The glow breathes between dim and bright (steady when the system asks for reduced motion).
 * The twins share the part's geometry and follow it; nothing in the part itself changes.
 */

const VERTEX = /* glsl */ `
#include <common>
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
  vec4 mv = modelViewMatrix * p;
  vNormal = normalize(normalMatrix * n);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float facing = abs(dot(normalize(vNormal), normalize(vView)));
  float rim = pow(1.0 - facing, 2.0);
  float alpha = uStrength * (0.14 + 0.86 * rim);
  gl_FragColor = vec4(uColor, clamp(alpha, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

export class SelectionGlow {
  private target: THREE.Object3D | null = null;
  private overlays: THREE.Mesh[] = [];
  private readonly material: THREE.ShaderMaterial;
  private readonly steady: boolean;

  constructor(color = 0x2dd4bf) {
    this.material = markShared(
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: 0.5 } },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        // drawn over the part's own surfaces at the same depth
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    this.steady = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Glow on this part's group (null: no glow). Cheap to call every frame; rebuilds only when the part changes. */
  attach(group: THREE.Object3D | null): void {
    if (group === this.target && (group === null || this.overlays.every((o) => o.parent !== null))) return;
    this.clear();
    this.target = group;
    if (!group) return;
    const sources: THREE.Mesh[] = [];
    group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.visible) return;
      const ud = obj.userData as { noPick?: boolean; noFrame?: boolean; pickType?: string; glow?: boolean };
      if (ud.noPick || ud.noFrame || ud.pickType === 'pin' || ud.glow) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      // labels, decals and other see-through layers lie on surfaces that already glow
      if (mats.every((m) => !m.visible || (m.transparent && !m.depthWrite) || !m.colorWrite)) return;
      sources.push(obj);
    });
    for (const src of sources) {
      const overlay =
        src instanceof THREE.InstancedMesh
          ? (() => {
              const o = new THREE.InstancedMesh(src.geometry, this.material, src.count);
              o.instanceMatrix = src.instanceMatrix;
              return o;
            })()
          : new THREE.Mesh(src.geometry, this.material);
      overlay.userData = { glow: true, noPick: true, noFrame: true };
      overlay.raycast = () => undefined;
      overlay.castShadow = false;
      overlay.receiveShadow = false;
      overlay.frustumCulled = false;
      overlay.renderOrder = 2;
      src.add(overlay);
      this.overlays.push(overlay);
    }
  }

  /** Advances the breathing: about one slow pulse every two seconds. */
  update(timeSec: number): void {
    const wave = 0.5 + 0.5 * Math.sin(timeSec * 3.1);
    // never fully off, so the selection stays visible at the dim end of the pulse
    this.material.uniforms.uStrength!.value = this.steady ? 0.55 : 0.36 + 0.42 * wave;
  }

  clear(): void {
    // the twins share the part's geometry: remove them, dispose nothing but our own material (kept for reuse)
    for (const o of this.overlays) o.removeFromParent();
    this.overlays = [];
    this.target = null;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}
