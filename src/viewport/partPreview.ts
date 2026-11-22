import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { ComponentKind } from '../schema/projectSchema';
import { buildComponentGroup } from './componentMeshes';
import { disposeObject } from './kit/pbr';

/**
 * Thumbnails for the parts list rendered from the same 3D models the bench uses (one shared offscreen renderer,
 * lit like the bench, transparent background so they sit on either theme). Renders are queued one per idle slot so the
 * panel never stalls, cached as PNG data URLs for the session, and the renderer is released when the queue empties.
 */

const W = 384;
const H = 192;
const cache = new Map<ComponentKind, string>();
const waiting = new Map<ComponentKind, Array<(url: string) => void>>();
const queue: ComponentKind[] = [];
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let envTarget: THREE.WebGLRenderTarget | null = null;
let pumping = false;
let unavailable = false;

function setup(): boolean {
  if (renderer) return true;
  if (unavailable) return false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    unavailable = true;
    return false;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTarget = pmrem.fromScene(new RoomEnvironment(), 0.035);
  pmrem.dispose();
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.62;
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(6, 10, 7);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
  fill.position.set(-8, 4, -3);
  scene.add(key, fill, new THREE.HemisphereLight(0xffffff, 0xd0d4da, 0.3));
  camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
  return true;
}

function release(): void {
  envTarget?.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
  scene = null;
  camera = null;
  envTarget = null;
}

function renderOne(kind: ComponentKind): string | null {
  if (!setup() || !renderer || !scene || !camera) return null;
  const handle = buildComponentGroup({ id: `thumb_${kind}`, kind, label: kind, position: [0, 0, 0], rotationY: -0.5 });
  const g = handle.group;
  // the thumbnail shows the part alone: no contact shadow, selection ring or pin targets
  const strip: THREE.Object3D[] = [];
  g.traverse((o) => {
    if (o.userData.noFrame || o.userData.pickType === 'pin') strip.push(o);
  });
  for (const o of strip) o.parent?.remove(o);
  scene.add(g);
  const box = new THREE.Box3().setFromObject(g);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const dir = new THREE.Vector3(0.62, 0.58, 0.9).normalize();
  const fitH = sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  const fitW = fitH / Math.min(1, camera.aspect);
  const dist = Math.max(fitH, fitW * 0.5) * 0.92;
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - sphere.radius * 2);
  camera.far = dist + sphere.radius * 2;
  camera.updateProjectionMatrix();
  camera.lookAt(sphere.center);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(g);
  disposeObject(g);
  return url;
}

function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const kind = queue.shift();
    if (!kind) {
      pumping = false;
      release();
      return;
    }
    let url: string | null = null;
    try {
      url = renderOne(kind);
    } catch {
      url = null;
    }
    if (url) {
      cache.set(kind, url);
      for (const cb of waiting.get(kind) ?? []) cb(url);
    }
    waiting.delete(kind);
    schedule(step);
  };
  schedule(step);
}

function schedule(fn: () => void): void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) ric(fn, { timeout: 400 });
  else window.setTimeout(fn, 16);
}

/** Cached render of a part, or null until it is ready (`onReady` is called once it is). */
export function requestPartThumbnail(kind: ComponentKind, onReady: (url: string) => void): string | null {
  const hit = cache.get(kind);
  if (hit) return hit;
  if (unavailable) return null;
  const list = waiting.get(kind);
  if (list) list.push(onReady);
  else {
    waiting.set(kind, [onReady]);
    queue.push(kind);
  }
  pump();
  return null;
}

/** Drops a pending callback (component unmounted before its thumbnail was ready). */
export function cancelPartThumbnail(kind: ComponentKind, onReady: (url: string) => void): void {
  const list = waiting.get(kind);
  if (!list) return;
  const i = list.indexOf(onReady);
  if (i >= 0) list.splice(i, 1);
}
