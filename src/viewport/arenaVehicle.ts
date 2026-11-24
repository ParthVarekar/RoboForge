import * as THREE from 'three';
import type { ArenaVehicleMode } from '../engine/arenaPhysics';
import { createPresetProject } from '../catalog/presets';
import { buildComponentGroup } from './componentMeshes';
import type { VehicleSnapshot } from './WorkbenchScene';

/** The vehicle driven in the arena, with the moving parts the arena animates. */
export interface ArenaVehicleVisual {
  group: THREE.Group;
  leftWheels: THREE.Object3D[];
  rightWheels: THREE.Object3D[];
  props: THREE.Object3D[];
  leds: THREE.MeshStandardMaterial[];
}

/** Bench units are centimetres, the arena's are metres. */
const CM = 0.01;
/** Height of the lowest point below the vehicle's origin, where the arena's physics puts the ground (m). */
const GROUND_BELOW_ORIGIN: Record<ArenaVehicleMode, number> = { rover: 0.036, drone: -0.006 };

/** The bench's own build for each kind of vehicle, used when the bench holds something else. */
const PRESET_FOR: Record<ArenaVehicleMode, string> = { rover: 'roboforge_rover', drone: 'quad_5in' };

/**
 * The same model as on the bench: the user's own build (parts and wires, see `WorkbenchScene.snapshotModel`) when it
 * is this kind of vehicle, otherwise the bench's ready-made build of it from the same part builders. Scaled to metres,
 * centred on the vehicle's origin and set down on the arena floor.
 */
export function buildArenaVehicle(mode: ArenaVehicleMode, snapshot?: VehicleSnapshot | null): ArenaVehicleVisual {
  const model = snapshot && snapshot.vehicle === mode ? snapshot.group.clone(true) : presetModel(mode);

  const group = new THREE.Group();
  const scaled = new THREE.Group();
  scaled.scale.setScalar(CM);
  scaled.add(model);
  group.add(scaled);

  // centre it over its footprint and stand it on the ground
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scaled);
  const centre = box.getCenter(new THREE.Vector3());
  scaled.position.set(-centre.x, -box.min.y - GROUND_BELOW_ORIGIN[mode], -centre.z);

  const visual: ArenaVehicleVisual = { group, leftWheels: [], rightWheels: [], props: [], leds: [] };
  group.traverse((obj) => {
    const role = obj.userData.arenaRole as string | undefined;
    if (role === 'wheelL') visual.leftWheels.push(obj);
    else if (role === 'wheelR') visual.rightWheels.push(obj);
    else if (role === 'prop') visual.props.push(obj);
    else if (role === 'led') {
      const mat = (obj as THREE.Mesh).material;
      if (mat instanceof THREE.MeshStandardMaterial) visual.leds.push(mat);
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return visual;
}

/** The ready-made build of this vehicle from the bench's part builders (parts only, no wires). */
function presetModel(mode: ArenaVehicleMode): THREE.Group {
  const group = new THREE.Group();
  for (const comp of createPresetProject(PRESET_FOR[mode]).components) {
    const handle = buildComponentGroup(comp);
    if (handle.wheelMesh) handle.wheelMesh.userData.arenaRole = comp.side === 'right' ? 'wheelR' : 'wheelL';
    if (handle.propMesh) handle.propMesh.userData.arenaRole = 'prop';
    const drop: THREE.Object3D[] = [handle.faultRing];
    handle.group.traverse((obj) => {
      if (obj.userData.pickType === 'pin') drop.push(obj);
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && handle.ledMaterial && mesh.material === handle.ledMaterial) mesh.userData.arenaRole = 'led';
    });
    for (const obj of drop) obj.removeFromParent();
    group.add(handle.group);
  }
  return group;
}
