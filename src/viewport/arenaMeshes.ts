import * as THREE from 'three';
import type { ArenaObstacle } from '../schema/projectSchema';
import { getArenaWallTexture, getCarbonTexture, getTreeBarkTexture } from './materials';

/**
 * Builds a detailed 3D Three.js Group for any Arena obstacle, wall, tree, FPV gate, or geometric shape.
 */
export function buildArenaObstacleGroup(obs: ArenaObstacle, isGhost = false): THREE.Group {
  const [sx, sy, sz] = obs.size;
  const group = new THREE.Group();
  group.position.set(obs.position[0], obs.position[1], obs.position[2]);
  group.rotation.y = obs.rotationY ?? 0;

  const ghostProps = isGhost ? { transparent: true, opacity: 0.55 } : {};

  switch (obs.kind) {
    case 'tree': {
      const barkMat = new THREE.MeshStandardMaterial({
        map: getTreeBarkTexture(),
        roughness: 0.92,
        ...ghostProps,
      });
      const trunkR = Math.max(0.11, sx * 0.13);
      const trunkH = sy * 0.46;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR * 0.72, trunkR * 1.18, trunkH, 12), barkMat);
      trunk.position.y = trunkH / 2;
      trunk.castShadow = !isGhost;
      trunk.receiveShadow = !isGhost;
      group.add(trunk);

      // Multi-tier conifer pine canopy (3 overlapping sculpted foliage cones)
      const baseColor = new THREE.Color(obs.color);
      const tiers: Array<[number, number, number, number]> = [
        [sx * 0.52, sy * 0.36, sy * 0.44, 0],
        [sx * 0.4, sy * 0.34, sy * 0.66, 0.35],
        [sx * 0.25, sy * 0.3, sy * 0.86, 0.7],
      ];
      tiers.forEach(([r, h, yCenter, rot], idx) => {
        const tierColor = baseColor.clone().offsetHSL(0, 0, idx * 0.04);
        const foliageMat = new THREE.MeshStandardMaterial({
          color: tierColor,
          roughness: 0.84,
          flatShading: true,
          ...ghostProps,
        });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 9), foliageMat);
        cone.position.y = yCenter;
        cone.rotation.y = rot;
        cone.castShadow = !isGhost;
        cone.receiveShadow = !isGhost;
        group.add(cone);
      });
      break;
    }

    case 'gate': {
      // Sleek FPV Drone Racing Archway Gate with glowing inner LED accent strips
      const postW = Math.max(0.12, Math.min(0.24, sx * 0.1));
      const depth = Math.max(0.14, sz);
      const halfSpan = Math.max(0.3, sx / 2 - postW / 2);

      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.42,
        metalness: 0.35,
        ...ghostProps,
      });
      const accentMat = new THREE.MeshStandardMaterial({
        color: obs.color,
        emissive: new THREE.Color(obs.color),
        emissiveIntensity: isGhost ? 0.2 : 0.65,
        roughness: 0.3,
        ...ghostProps,
      });

      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(postW, sy, depth), frameMat);
        post.position.set(side * halfSpan, sy / 2, 0);
        post.castShadow = !isGhost;
        post.receiveShadow = !isGhost;
        group.add(post);

        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, sy - postW, depth + 0.02), accentMat);
        strip.position.set(side * (halfSpan - postW * 0.48), (sy - postW) / 2, 0);
        group.add(strip);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(postW * 2.1, 0.06, depth * 2.4), frameMat);
        foot.position.set(side * halfSpan, 0.03, 0);
        group.add(foot);
      }

      const header = new THREE.Mesh(new THREE.BoxGeometry(sx + postW * 0.2, postW * 1.15, depth * 1.05), accentMat);
      header.position.set(0, sy - postW * 0.5, 0);
      header.castShadow = !isGhost;
      group.add(header);
      break;
    }

    case 'wall': {
      const wallMat = new THREE.MeshStandardMaterial({
        color: obs.color,
        map: getArenaWallTexture(),
        roughness: 0.78,
        ...ghostProps,
      });
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), wallMat);
      wall.position.y = sy / 2;
      wall.castShadow = !isGhost;
      wall.receiveShadow = !isGhost;
      group.add(wall);

      // Architectural coping cap + baseboard trim
      const capMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.55, ...ghostProps });
      const cap = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.04, 0.05, sz + 0.05), capMat);
      cap.position.y = sy + 0.02;
      const base = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.03, 0.06, sz + 0.03), capMat);
      base.position.y = 0.03;
      group.add(cap, base);
      break;
    }

    case 'cone': {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(sx * 1.15, 0.04, sz * 1.15),
        new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.75, ...ghostProps }),
      );
      base.position.y = 0.02;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(sx * 0.45, sy, 20),
        new THREE.MeshStandardMaterial({ color: obs.color, roughness: 0.42, ...ghostProps }),
      );
      cone.position.y = sy / 2 + 0.03;
      cone.castShadow = !isGhost;
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(sx * 0.22, sx * 0.28, sy * 0.18, 18),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xf8fafc, emissiveIntensity: 0.15, ...ghostProps }),
      );
      collar.position.y = sy * 0.62;
      group.add(base, cone, collar);
      break;
    }

    case 'bag': {
      const bagBody = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: obs.color, roughness: 0.84, ...ghostProps }),
      );
      bagBody.position.y = sy / 2;
      bagBody.castShadow = !isGhost;
      bagBody.receiveShadow = !isGhost;
      group.add(bagBody);

      const strapMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.68, ...ghostProps });
      for (const dz of [-sz * 0.25, sz * 0.25]) {
        const handle = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 8, 16, Math.PI), strapMat);
        handle.position.set(0, sy, dz);
        group.add(handle);
      }
      break;
    }

    case 'sphere': {
      const radius = Math.max(0.14, Math.min(sx, sy, sz) * 0.5);
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(radius, 1),
        new THREE.MeshStandardMaterial({
          color: obs.color,
          roughness: 0.86,
          flatShading: true,
          ...ghostProps,
        }),
      );
      rock.scale.set(sx / (radius * 2), sy / (radius * 2), sz / (radius * 2));
      rock.position.y = sy * 0.45;
      rock.castShadow = !isGhost;
      rock.receiveShadow = !isGhost;
      group.add(rock);
      break;
    }

    case 'pillar':
    case 'cylinder': {
      const r = Math.max(0.1, sx * 0.5);
      const cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, sy, 22),
        new THREE.MeshStandardMaterial({ color: obs.color, roughness: 0.48, metalness: 0.2, ...ghostProps }),
      );
      cyl.position.y = sy / 2;
      cyl.castShadow = !isGhost;
      cyl.receiveShadow = !isGhost;
      group.add(cyl);

      if (obs.kind === 'pillar') {
        const cap = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 1.18, r * 1.18, 0.08, 20),
          new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, ...ghostProps }),
        );
        cap.position.y = 0.04;
        const topRing = new THREE.Mesh(
          new THREE.TorusGeometry(r * 1.04, 0.04, 8, 20),
          new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.35, ...ghostProps }),
        );
        topRing.rotation.x = Math.PI / 2;
        topRing.position.y = sy - 0.1;
        group.add(cap, topRing);
      }
      break;
    }

    case 'ramp': {
      const ramp = new THREE.Mesh(
        new THREE.BoxGeometry(sx, sy, sz),
        new THREE.MeshStandardMaterial({ color: obs.color, roughness: 0.72, ...ghostProps }),
      );
      ramp.position.y = sy / 2;
      ramp.rotation.x = 0.18;
      ramp.castShadow = !isGhost;
      ramp.receiveShadow = !isGhost;
      group.add(ramp);
      break;
    }

    case 'box':
    default: {
      const boxMat = new THREE.MeshStandardMaterial({ color: obs.color, roughness: 0.65, ...ghostProps });
      const box = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), boxMat);
      box.position.y = sy / 2;
      box.castShadow = !isGhost;
      box.receiveShadow = !isGhost;
      group.add(box);
      // Corner crate banding
      const trimMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, ...ghostProps });
      const rimTop = new THREE.Mesh(new THREE.BoxGeometry(sx + 0.02, 0.04, sz + 0.02), trimMat);
      rimTop.position.y = sy - 0.02;
      group.add(rimTop);
      break;
    }
  }

  if (!isGhost) {
    group.userData = { pickType: 'obstacle', obstacleId: obs.id };
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.userData = { pickType: 'obstacle', obstacleId: obs.id };
      }
    });
  }
  return group;
}

/**
 * Builds the detailed 3D 2WD Rover model rendered in the Physics Arena.
 */
export function buildArenaRoverModel(): {
  group: THREE.Group;
  leftWheel: THREE.Object3D;
  rightWheel: THREE.Object3D;
  statusLedMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const carbonMat = new THREE.MeshStandardMaterial({ map: getCarbonTexture(), roughness: 0.42, metalness: 0.25 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.18 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.72, roughness: 0.28 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.012, 0.195), carbonMat);
  deck.position.y = 0.012;
  deck.castShadow = true;
  group.add(deck);

  // Corner red standoffs
  for (const cx of [-0.06, 0.06]) {
    for (const cz of [-0.08, 0.08]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6), redMat);
      post.position.set(cx, 0.024, cz);
      group.add(post);
    }
  }

  // Detailed ESP32 + silver RF shield, purple DRV8833, OLED, 2S blue cells
  const esp = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.008, 0.06), new THREE.MeshStandardMaterial({ color: 0x151b26 }));
  esp.position.set(-0.028, 0.022, 0.006);
  const rf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.006, 0.024), chromeMat);
  rf.position.set(-0.028, 0.028, -0.008);
  const drv = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.008, 0.032), new THREE.MeshStandardMaterial({ color: 0x581c87 }));
  drv.position.set(0.032, 0.022, 0.008);
  const oled = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.007, 0.022),
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x0284c7, emissiveIntensity: 0.5 }),
  );
  oled.position.set(0, 0.024, -0.056);
  const bat = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.024, 0.044), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3 }));
  bat.position.set(0, 0.028, 0.066);
  group.add(esp, rf, drv, oled, bat);

  // Front HC-SR04 eyes
  const usPlate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.008), new THREE.MeshStandardMaterial({ color: 0x0369a1 }));
  usPlate.position.set(0, 0.045, -0.094);
  group.add(usPlate);
  for (const x of [-0.014, 0.014]) {
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.014, 16), chromeMat);
    eye.rotation.x = Math.PI / 2;
    eye.position.set(x, 0.045, -0.101);
    group.add(eye);
  }

  // ESP32-CAM mast + sapphire lens
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.014), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  camBox.position.set(0, 0.088, -0.065);
  const camLens = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.01, 14), chromeMat);
  camLens.rotation.x = Math.PI / 2;
  camLens.position.set(0, 0.092, -0.075);
  group.add(camBox, camLens);

  const statusLedMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 0.35,
  });
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 12), statusLedMat);
  led.position.set(0.04, 0.034, -0.04);
  group.add(led);

  const makeWheel = (x: number): THREE.Group => {
    const wg = new THREE.Group();
    wg.position.set(x, -0.003, -0.01);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181e, roughness: 0.88 });
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.022, 22), tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);
    for (let i = 0; i < 10; i += 1) {
      const ang = (i * Math.PI * 2) / 10;
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.007), tireMat);
      lug.position.set(0, Math.sin(ang) * 0.034, Math.cos(ang) * 0.034);
      lug.rotation.x = -ang;
      wg.add(lug);
    }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.024, 14), new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.38 }));
    rim.rotation.z = Math.PI / 2;
    wg.add(rim);
    return wg;
  };

  const leftWheel = makeWheel(-0.084);
  const rightWheel = makeWheel(0.084);
  group.add(leftWheel, rightWheel);

  return { group, leftWheel, rightWheel, statusLedMat };
}

/**
 * Builds the detailed 3D 5-inch Freestyle Quadcopter Drone model rendered in the Physics Arena.
 */
export function buildArenaDroneModel(): {
  group: THREE.Group;
  props: THREE.Object3D[];
  statusLedMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const carbonMat = new THREE.MeshStandardMaterial({ map: getCarbonTexture(), roughness: 0.38, metalness: 0.28 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.78, roughness: 0.24 });
  const copperMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });
  const blueMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.8, roughness: 0.22 });
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 });
  const propMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    transparent: true,
    opacity: 0.82,
    roughness: 0.25,
    side: THREE.DoubleSide,
  });

  // True-X Carbon arms (~26 cm tip-to-tip scaled neatly for 3D arena flight!)
  for (const ang of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.008, 0.022), carbonMat);
    arm.position.y = 0.01;
    arm.rotation.y = ang;
    arm.castShadow = true;
    group.add(arm);
  }

  const bottomPlate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.008, 0.16), carbonMat);
  bottomPlate.position.y = 0.014;
  const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.006, 0.155), carbonMat);
  topPlate.position.y = 0.048;
  group.add(bottomPlate, topPlate);

  for (const cx of [-0.024, 0.024]) {
    for (const cz of [-0.056, 0.056]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.032, 6), redMat);
      post.position.set(cx, 0.031, cz);
      group.add(post);
    }
  }

  // Top 6S LiPo brick + rear orange TPU VTX antenna + front camera
  const lipo = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.042, 0.092), new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.5 }));
  lipo.position.set(0, 0.072, -0.005);
  lipo.castShadow = true;
  const vtxMount = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.018, 0.024), orangeMat);
  vtxMount.position.set(0, 0.058, 0.06);
  const vtxStem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.055, 8), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  vtxStem.position.set(0, 0.088, 0.065);
  const vtxHead = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.007, 0.02, 12), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  vtxHead.position.set(0, 0.118, 0.065);
  group.add(lipo, vtxMount, vtxStem, vtxHead);

  const statusLedMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 0.85,
  });
  const rearLed = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.008), statusLedMat);
  rearLed.position.set(0, 0.03, 0.08);
  group.add(rearLed);

  const props: THREE.Object3D[] = [];
  const motorCoords: Array<[number, number]> = [
    [-0.112, -0.112],
    [0.112, -0.112],
    [-0.112, 0.112],
    [0.112, 0.112],
  ];
  for (const [mx, mz] of motorCoords) {
    const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 14), copperMat);
    stator.position.set(mx, 0.022, mz);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7 }));
    bell.position.set(mx, 0.03, mz);
    group.add(stator, bell);

    const rotor = new THREE.Group();
    rotor.position.set(mx, 0.038, mz);
    for (let i = 0; i < 3; i += 1) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.0025, 0.013), propMat);
      const a = (i * Math.PI * 2) / 3;
      blade.position.set(Math.cos(a) * 0.038, 0, Math.sin(a) * 0.038);
      blade.rotation.y = -a;
      blade.rotation.x = 0.25;
      rotor.add(blade);
    }
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 6), blueMat);
    nut.position.y = 0.005;
    rotor.add(nut);
    group.add(rotor);
    props.push(rotor);
  }

  return { group, props, statusLedMat };
}
