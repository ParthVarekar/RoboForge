import * as THREE from 'three';
import type { ArenaObstacle } from '../schema/projectSchema';
import { getArenaWallTexture, getTreeBarkTexture } from './materials';

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
