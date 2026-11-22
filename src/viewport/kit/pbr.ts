import * as THREE from 'three';

/**
 * Shared physically based materials for the electronics models.
 *
 * Scene units are centimetres; every material here is cached and flagged `userData.shared`, so a part rebuild can
 * dispose its own geometry and one-off materials without destroying the cached ones other parts still use.
 */

const cache = new Map<string, THREE.Material>();

export function markShared<T extends THREE.Material | THREE.Texture | THREE.BufferGeometry>(item: T): T {
  item.userData.shared = true;
  return item;
}

function shared<T extends THREE.Material>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const m = markShared(make());
  m.name = key;
  cache.set(key, m);
  return m;
}

export const PBR = {
  /** ENIG (gold over nickel) pads, header pins, edge fingers. */
  gold: () => shared('gold', () => new THREE.MeshStandardMaterial({ color: 0xe2b65f, metalness: 1, roughness: 0.26 })),
  /** Hot-air-levelled solder / tin plating: header pins, SMD terminations, solder joints. */
  tin: () => shared('tin', () => new THREE.MeshStandardMaterial({ color: 0xcdd1d6, metalness: 1, roughness: 0.3 })),
  solder: () => shared('solder', () => new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 1, roughness: 0.22 })),
  /** Stamped nickel-silver RF shields and USB shells, with the faint grain of rolled sheet. */
  nickel: () =>
    shared(
      'nickel',
      () => new THREE.MeshPhysicalMaterial({ color: 0xa9aeb5, metalness: 1, roughness: 0.32, anisotropy: 0.55, anisotropyRotation: 0 }),
    ),
  steel: () => shared('steel', () => new THREE.MeshStandardMaterial({ color: 0xb9bec5, metalness: 1, roughness: 0.4 })),
  steelDark: () => shared('steelDark', () => new THREE.MeshStandardMaterial({ color: 0x5b6068, metalness: 1, roughness: 0.42 })),
  aluminium: () => shared('aluminium', () => new THREE.MeshStandardMaterial({ color: 0xd3d7dc, metalness: 1, roughness: 0.36 })),
  aluminiumBrushed: () =>
    shared(
      'aluminiumBrushed',
      () => new THREE.MeshPhysicalMaterial({ color: 0xcfd3d8, metalness: 1, roughness: 0.3, anisotropy: 0.75, anisotropyRotation: Math.PI / 2 }),
    ),
  copper: () => shared('copper', () => new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 1, roughness: 0.32 })),
  enamelledCopper: () =>
    shared('enamelledCopper', () => new THREE.MeshPhysicalMaterial({ color: 0xb4602f, metalness: 0.9, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 })),
  brass: () => shared('brass', () => new THREE.MeshStandardMaterial({ color: 0xc9a24f, metalness: 1, roughness: 0.3 })),
  /** PA66 glass-filled nylon of pin headers and connector housings. */
  headerPlastic: () => shared('headerPlastic', () => new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.58, metalness: 0 })),
  /** Moulded epoxy of IC packages (slightly glossy, almost black). */
  icEpoxy: () => shared('icEpoxy', () => new THREE.MeshPhysicalMaterial({ color: 0x1b1c1f, roughness: 0.66, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.7 })),
  /** Thick-film chip resistor: white alumina body, black resistive glaze on top. */
  aluminaWhite: () => shared('aluminaWhite', () => new THREE.MeshStandardMaterial({ color: 0xe8e5dc, roughness: 0.72, metalness: 0 })),
  resistorGlaze: () => shared('resistorGlaze', () => new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.5, metalness: 0 })),
  /** MLCC ceramic: grey-tan sintered body. */
  mlcc: () => shared('mlcc', () => new THREE.MeshStandardMaterial({ color: 0xa79176, roughness: 0.62, metalness: 0 })),
  ferrite: () => shared('ferrite', () => new THREE.MeshStandardMaterial({ color: 0x2b2c2f, roughness: 0.82, metalness: 0.05 })),
  rubber: () => shared('rubber', () => new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.93, metalness: 0 })),
  /** OLED / LCD cover glass over a black panel. */
  glassBlack: () =>
    shared('glassBlack', () => new THREE.MeshPhysicalMaterial({ color: 0x07090c, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, reflectivity: 0.6 })),
  lensGlass: () =>
    shared('lensGlass', () => new THREE.MeshPhysicalMaterial({ color: 0x14243b, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.5, iridescenceIOR: 1.4 })),
  kapton: () => shared('kapton', () => new THREE.MeshPhysicalMaterial({ color: 0xc9781e, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25, transparent: true, opacity: 0.92 })),
  carbonEdge: () => shared('carbonEdge', () => new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.7, metalness: 0.05 })),
  fr4Edge: () => shared('fr4Edge', () => new THREE.MeshStandardMaterial({ color: 0xb9ab7c, roughness: 0.86, metalness: 0 })),
};

/** Matte or satin plastic in any colour (ABS, PC, PA). Cached by colour and finish. */
export function plastic(hex: number, roughness = 0.5, clearcoat = 0): THREE.MeshPhysicalMaterial {
  return shared(`plastic_${hex.toString(16)}_${roughness}_${clearcoat}`, () =>
    new THREE.MeshPhysicalMaterial({ color: hex, roughness, metalness: 0, clearcoat, clearcoatRoughness: 0.4 }),
  );
}

/** Anodised aluminium in a colour (standoffs, nuts, CNC parts). */
export function anodised(hex: number, roughness = 0.32): THREE.MeshStandardMaterial {
  return shared(`anodised_${hex.toString(16)}_${roughness}`, () => new THREE.MeshStandardMaterial({ color: hex, metalness: 0.85, roughness }));
}

/** Silicone-insulated wire jacket. */
export function siliconeJacket(hex: number): THREE.MeshStandardMaterial {
  return shared(`silicone_${hex.toString(16)}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0 }));
}

/** Clear-coated solder mask in a colour, for board edges and undersides that carry no artwork. */
export function solderMask(hex: number): THREE.MeshPhysicalMaterial {
  const lum = 0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255);
  const dark = lum < 70;
  return shared(`mask_${hex.toString(16)}`, () =>
    new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness: 0.48,
      metalness: 0,
      clearcoat: dark ? 0.3 : 0.55,
      clearcoatRoughness: 0.28,
      specularIntensity: dark ? 0.45 : 0.85,
    }),
  );
}

/** Light-emitting die colour of an LED, one material per instance so it can glow with PWM. */
export function ledEmitter(hex: number, base = 0.15): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: base, roughness: 0.25, metalness: 0 });
}

/**
 * Disposes an object tree: its geometries, one-off materials and their one-off textures. Anything flagged
 * `userData.shared` (cached materials, cached textures, cached geometries) is kept.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      if (m.userData.shared) continue;
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture && !value.userData.shared) value.dispose();
      }
      m.dispose();
    }
  });
}
