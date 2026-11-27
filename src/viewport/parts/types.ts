import type * as THREE from 'three';
import type { PartSpec } from '../../catalog/partsCatalog';
import type { DisplaySurface } from '../displayPainter';
import type { ComponentInstance } from '../../schema/projectSchema';

/** Live handles a part hands back so the scene can animate it (LED glow, wheel/prop spin, screen, button press). */
export interface PartBuildResult {
  ledMaterial?: THREE.MeshStandardMaterial | null;
  wheelMesh?: THREE.Object3D | null;
  propMesh?: THREE.Object3D | null;
  /** The screen of a display module (OLED, LCD), painted from what the sketch drives. */
  display?: DisplaySurface | null;
  /** Moving part of a push button; carries `userData.restY` and `userData.travel` (cm). */
  buttonCap?: THREE.Mesh | null;
  /** A servo's output: horn and spline, turning about its own vertical axis (rotation.y 0 = 90 degrees). */
  servoHorn?: THREE.Object3D | null;
  /** The body that sounds or vibrates (a buzzer), for its animation. */
  soundBody?: THREE.Object3D | null;
  /** A module's status LED that follows its output (the relay's "on" LED). */
  statusLed?: THREE.MeshStandardMaterial | null;
}

export interface PartBuildContext {
  instance: ComponentInstance;
  /** Group already placed and rotated in the scene; add the part's meshes in its local frame (cm, north = -Z). */
  group: THREE.Group;
  spec: PartSpec;
  size: readonly [number, number, number];
}

export type PartBuilder = (ctx: PartBuildContext) => PartBuildResult | void;
