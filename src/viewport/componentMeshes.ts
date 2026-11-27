import * as THREE from 'three';
import { getPartSpec, type PinSpec } from '../catalog/partsCatalog';
import type { ComponentInstance } from '../schema/projectSchema';
import type { DisplaySurface } from './displayPainter';
import { markShared } from './kit/pbr';
import { PART_BUILDERS } from './parts';

export interface ComponentVisualHandle {
  componentId: string;
  kind: ComponentInstance['kind'];
  group: THREE.Group;
  pinMeshes: Map<string, THREE.Mesh>;
  wheelMesh: THREE.Object3D | null;
  propMesh: THREE.Object3D | null;
  ledMaterial: THREE.MeshStandardMaterial | null;
  display: DisplaySurface | null;
  buttonCap: THREE.Mesh | null;
  servoHorn: THREE.Object3D | null;
  soundBody: THREE.Object3D | null;
  statusLed: THREE.MeshStandardMaterial | null;
  faultRing: THREE.Mesh;
}

function pinColorByRole(pin: PinSpec): number {
  if (pin.role === 'power_out' || pin.role === 'power_in' || pin.role === 'cap_pos') return 0xef4444;
  if (pin.role === 'gnd' || pin.role === 'cap_neg') return 0x475569;
  if (pin.role === 'gpio_input_only') return 0xf59e0b;
  if (pin.role === 'i2c_sda' || pin.role === 'i2c_scl') return 0x0284c7;
  if (pin.role === 'esc_phase') return 0x14b8a6;
  return 0xd97706;
}

const PIN_UP = new THREE.Vector3(0, 1, 0);
let targetGeo: THREE.BufferGeometry | null = null;
let targetMat: THREE.MeshBasicMaterial | null = null;
let haloGeo: THREE.BufferGeometry | null = null;
const haloMats = new Map<number, THREE.MeshBasicMaterial>();

/**
 * Invisible pick target at each pin tip (where wires attach), with a thin role-coloured halo that only shows while
 * wiring or when the pin is under the cursor. The pins you see are the real header pins drawn by each part.
 */
function addPinTargets(group: THREE.Group, instance: ComponentInstance, pins: PinSpec[]): Map<string, THREE.Mesh> {
  if (!targetGeo) {
    targetGeo = markShared(new THREE.CylinderGeometry(0.13, 0.13, 0.32, 10));
    targetMat = markShared(new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0 }));
    haloGeo = markShared(new THREE.TorusGeometry(0.11, 0.016, 8, 28));
  }
  const map = new Map<string, THREE.Mesh>();
  for (const pin of pins) {
    const target = new THREE.Mesh(targetGeo, targetMat!);
    target.position.set(pin.localPos[0], pin.localPos[1], pin.localPos[2]);
    if (pin.dir) target.quaternion.setFromUnitVectors(PIN_UP, new THREE.Vector3(pin.dir[0], pin.dir[1], pin.dir[2]).normalize());
    target.renderOrder = 10;
    target.userData = { pickType: 'pin', componentId: instance.id, pinId: pin.id, label: pin.label, role: pin.role };

    const color = pinColorByRole(pin);
    let hm = haloMats.get(color);
    if (!hm) {
      hm = markShared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: true }));
      haloMats.set(color, hm);
    }
    const halo = new THREE.Mesh(haloGeo!, hm);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -0.05;
    halo.visible = false;
    halo.userData = { noFrame: true, noPick: true };
    halo.raycast = () => undefined;
    target.add(halo);
    target.userData.halo = halo;
    group.add(target);
    map.set(pin.id, target);
  }
  return map;
}

/** Shows or hides a pin's halo; `strong` makes the hovered one larger. */
export function setPinHaloVisible(target: THREE.Mesh, visible: boolean, strong = false): void {
  const halo = target.userData.halo as THREE.Mesh | undefined;
  if (!halo) return;
  halo.visible = visible;
  halo.scale.setScalar(strong ? 1.45 : 1);
}

let shadowTex: THREE.CanvasTexture | null = null;

/** Soft contact shadow under a part: grounds it on the mat even where the key light's shadow is thin. */
function contactShadow(w: number, d: number): THREE.Mesh {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    if (ctx) {
      const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
      g.addColorStop(0, 'rgba(0,0,0,0.42)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    shadowTex = markShared(new THREE.CanvasTexture(c));
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.25, d * 1.25),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.85 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.renderOrder = -1;
  m.userData = { noFrame: true, noPick: true };
  m.raycast = () => undefined;
  return m;
}

/**
 * Builds the interactive 3D model of a workbench component: the part itself (real geometry and materials), invisible
 * pick targets at its pin tips, a contact shadow and the selection/fault ring.
 */
export function buildComponentGroup(instance: ComponentInstance): ComponentVisualHandle {
  const spec = getPartSpec(instance.kind);
  const [sx, sy, sz] = instance.sizeOverride ?? spec.sizeCm;

  const group = new THREE.Group();
  group.position.set(instance.position[0], instance.position[1], instance.position[2]);
  group.rotation.y = instance.rotationY;
  group.userData = { pickType: 'component', componentId: instance.id };

  const result = PART_BUILDERS[instance.kind]({ instance, group, spec, size: [sx, sy, sz] }) ?? {};

  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !obj.userData.pickType && !obj.userData.noPick) {
      obj.userData = { ...obj.userData, pickType: 'component', componentId: instance.id };
    }
  });

  // a soft blob grounds small parts; under a large open frame or deck it reads as a dark smudge, so the key light's
  // real shadow does that job there
  if (Math.max(sx, sz) < 12) group.add(contactShadow(sx, sz));
  const pinMeshes = addPinTargets(group, instance, spec.pins);

  const radius = Math.max(sx, sz) * 0.58;
  const faultRing = new THREE.Mesh(
    new THREE.RingGeometry(radius, radius + 0.18, 48),
    new THREE.MeshBasicMaterial({ color: 0x0d9488, side: THREE.DoubleSide, transparent: true, opacity: 0.0, depthWrite: false }),
  );
  faultRing.rotation.x = -Math.PI / 2;
  faultRing.position.y = 0.012;
  faultRing.userData = { noFrame: true, noPick: true };
  faultRing.raycast = () => undefined;
  group.add(faultRing);

  return {
    componentId: instance.id,
    kind: instance.kind,
    group,
    pinMeshes,
    wheelMesh: result.wheelMesh ?? null,
    propMesh: result.propMesh ?? null,
    ledMaterial: result.ledMaterial ?? null,
    display: result.display ?? null,
    buttonCap: result.buttonCap ?? null,
    servoHorn: result.servoHorn ?? null,
    soundBody: result.soundBody ?? null,
    statusLed: result.statusLed ?? null,
    faultRing,
  };
}
