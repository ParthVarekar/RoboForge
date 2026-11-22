import * as THREE from 'three';

let cachedCarbonTex: THREE.CanvasTexture | null = null;
let cachedLightMatTex: THREE.CanvasTexture | null = null;
let cachedDarkMatTex: THREE.CanvasTexture | null = null;
let cachedAcousticMeshTex: THREE.CanvasTexture | null = null;
let cachedGrassTex: THREE.CanvasTexture | null = null;
let cachedConcreteTex: THREE.CanvasTexture | null = null;
let cachedBarkTex: THREE.CanvasTexture | null = null;
let cachedWallTex: THREE.CanvasTexture | null = null;
const cachedPcbTextures = new Map<string, THREE.CanvasTexture>();

/**
 * Creates (and caches) a crisp procedural 2x2 twill carbon-fiber weave texture.
 */
export function getCarbonTexture(): THREE.CanvasTexture {
  if (cachedCarbonTex) return cachedCarbonTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0d1015';
    ctx.fillRect(0, 0, size, size);
    const cell = 16;
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        const phase = ((x / cell) + (y / cell)) % 2 === 0;
        const grad = ctx.createLinearGradient(x, y, x + cell, y + cell);
        if (phase) {
          grad.addColorStop(0, '#262b35');
          grad.addColorStop(0.45, '#111419');
          grad.addColorStop(1, '#1d222b');
        } else {
          grad.addColorStop(0, '#0d1015');
          grad.addColorStop(0.55, '#2b323e');
          grad.addColorStop(1, '#101318');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.anisotropy = 8;
  cachedCarbonTex = tex;
  return tex;
}

/**
 * Generates a metallic honeycomb / perforated acoustic screen texture for HC-SR04 transducers.
 */
export function getAcousticMeshTexture(): THREE.CanvasTexture {
  if (cachedAcousticMeshTex) return cachedAcousticMeshTex;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, '#475569');
    grad.addColorStop(0.75, '#1e293b');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6;
    const step = 10;
    for (let i = -size; i < size * 2; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + size, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
    }

    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  cachedAcousticMeshTex = tex;
  return tex;
}

export interface PcbSilkscreenConfig {
  key: string;
  solderMask: string;
  traceColor: string;
  title: string;
  subtitle?: string;
  leftPins?: readonly string[];
  rightPins?: readonly string[];
  bottomPins?: readonly string[];
  topPins?: readonly string[];
  showAxes?: boolean;
}

/**
 * Renders a high-resolution procedural PCB top-layer texture with copper traces, ENIG pads,
 * silkscreen pin labels, and component outlines.
 */
export function getPcbSilkscreenTexture(cfg: PcbSilkscreenConfig): THREE.CanvasTexture {
  const existing = cachedPcbTextures.get(cfg.key);
  if (existing) return existing;

  const w = 512;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = cfg.solderMask;
    ctx.fillRect(0, 0, w, h);

    // Subtle FR-4 copper trace lines beneath solder mask
    ctx.strokeStyle = cfg.traceColor;
    ctx.lineWidth = 4;
    for (let i = 1; i <= 9; i += 1) {
      const y = (i / 10) * h;
      ctx.beginPath();
      ctx.moveTo(46, y);
      ctx.lineTo(145, y);
      ctx.lineTo(185, y + (i % 2 === 0 ? 18 : -18));
      ctx.lineTo(325, y + (i % 2 === 0 ? 18 : -18));
      ctx.lineTo(365, y);
      ctx.lineTo(w - 46, y);
      ctx.stroke();
    }

    // Crisp outer silkscreen border
    ctx.strokeStyle = 'rgba(248,250,252,0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Corner gold mounting vias
    for (const [cx, cy] of [
      [28, 28],
      [w - 28, 28],
      [28, h - 28],
      [w - 28, h - 28],
    ] as const) {
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.arc(cx, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center title silkscreen
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cfg.title, w / 2, cfg.subtitle ? h * 0.44 : h * 0.5);
    if (cfg.subtitle) {
      ctx.fillStyle = 'rgba(226,232,240,0.85)';
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.fillText(cfg.subtitle, w / 2, h * 0.54);
    }

    // Optional IMU X/Y orientation arrows
    if (cfg.showAxes) {
      ctx.strokeStyle = '#f8fafc';
      ctx.fillStyle = '#f8fafc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(110, 175);
      ctx.lineTo(190, 175);
      ctx.moveTo(110, 175);
      ctx.lineTo(110, 95);
      ctx.stroke();
      ctx.font = 'bold 24px Consolas, monospace';
      ctx.fillText('X', 210, 175);
      ctx.fillText('Y', 110, 74);
    }

    // Left pin column labels + ENIG annular rings
    if (cfg.leftPins && cfg.leftPins.length > 0) {
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.textAlign = 'left';
      const step = (h - 90) / Math.max(1, cfg.leftPins.length - 1);
      cfg.leftPins.forEach((lbl, idx) => {
        const y = 45 + idx * step;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(28, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(lbl, 46, y);
      });
    }

    // Right pin column labels + ENIG annular rings
    if (cfg.rightPins && cfg.rightPins.length > 0) {
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.textAlign = 'right';
      const step = (h - 90) / Math.max(1, cfg.rightPins.length - 1);
      cfg.rightPins.forEach((lbl, idx) => {
        const y = 45 + idx * step;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(w - 28, y, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(lbl, w - 46, y);
      });
    }

    // Bottom pin row labels
    if (cfg.bottomPins && cfg.bottomPins.length > 0) {
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.textAlign = 'center';
      const step = (w - 130) / Math.max(1, cfg.bottomPins.length - 1);
      cfg.bottomPins.forEach((lbl, idx) => {
        const x = 65 + idx * step;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(x, h - 32, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(lbl, x, h - 62);
      });
    }

    // Top pin row labels
    if (cfg.topPins && cfg.topPins.length > 0) {
      ctx.font = 'bold 22px Consolas, monospace';
      ctx.textAlign = 'center';
      const step = (w - 130) / Math.max(1, cfg.topPins.length - 1);
      cfg.topPins.forEach((lbl, idx) => {
        const x = 65 + idx * step;
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(x, 32, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(lbl, x, 64);
      });
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  cachedPcbTextures.set(cfg.key, tex);
  return tex;
}

/**
 * Generates a tileable sunlit forest/airfield meadow grass texture for outdoor Arena environments.
 */
export function getGrassGroundTexture(): THREE.CanvasTexture {
  if (cachedGrassTex) return cachedGrassTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#3b6e38';
    ctx.fillRect(0, 0, size, size);
    // Deterministic grass blade / soil mottling
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 4200; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 2 + rand() * 8;
      ctx.fillStyle =
        i % 3 === 0
          ? 'rgba(74, 128, 60, 0.32)'
          : i % 3 === 1
            ? 'rgba(42, 84, 42, 0.28)'
            : 'rgba(116, 158, 76, 0.22)';
      ctx.fillRect(x, y, r, r * 0.45);
    }
    // Subtle 1 m turf measurement line
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(9, 9);
  tex.anisotropy = 8;
  cachedGrassTex = tex;
  return tex;
}

/**
 * Generates an industrial brushed concrete tile texture for Warehouse Maze / Indoor arenas.
 */
export function getConcreteFloorTexture(): THREE.CanvasTexture {
  if (cachedConcreteTex) return cachedConcreteTex;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, size, size);
    let seed = 919;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 2400; i += 1) {
      const shade = 45 + Math.floor(rand() * 30);
      ctx.fillStyle = `rgba(${shade}, ${shade + 8}, ${shade + 18}, 0.26)`;
      ctx.fillRect(rand() * size, rand() * size, 6 + rand() * 14, 6 + rand() * 14);
    }
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, size - 4, size - 4);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.anisotropy = 8;
  cachedConcreteTex = tex;
  return tex;
}

/**
 * Generates a vertical fibrous tree bark texture for outdoor forest trees.
 */
export function getTreeBarkTexture(): THREE.CanvasTexture {
  if (cachedBarkTex) return cachedBarkTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#5c3d28';
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 6) {
      ctx.fillStyle = x % 12 === 0 ? '#472d1c' : '#6f4b32';
      ctx.fillRect(x, 0, 3, size);
    }
    for (let y = 0; y < size; y += 28) {
      ctx.fillStyle = 'rgba(32,18,10,0.28)';
      ctx.fillRect(0, y, size, 4);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  cachedBarkTex = tex;
  return tex;
}

/**
 * Generates an architectural masonry/panel wall texture for custom Arena walls.
 */
export function getArenaWallTexture(): THREE.CanvasTexture {
  if (cachedWallTex) return cachedWallTex;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = 'rgba(15,23,42,0.25)';
    ctx.lineWidth = 3;
    for (let y = 0; y < size; y += 64) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      const offset = (y / 64) % 2 === 0 ? 0 : 64;
      for (let x = offset; x < size; x += 128) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 64);
        ctx.stroke();
      }
    }
    // High-visibility base hazard band
    ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
    ctx.fillRect(0, size - 22, size, 22);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  cachedWallTex = tex;
  return tex;
}

/**
 * Creates a crisp precision cutting-mat grid texture (2 mm minor, 10 mm major, 50 mm bold lines)
 * in either Light Studio or Dark Studio palette.
 */
export function getCuttingMatTexture(theme: 'light' | 'dark'): THREE.CanvasTexture {
  if (theme === 'light' && cachedLightMatTex) return cachedLightMatTex;
  if (theme === 'dark' && cachedDarkMatTex) return cachedDarkMatTex;

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = theme === 'light' ? '#dfe5ec' : '#111827';
    ctx.fillRect(0, 0, size, size);

    const cells = 32;
    const step = size / cells;

    ctx.strokeStyle = theme === 'light' ? 'rgba(100,116,139,0.16)' : 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    const subStep = step / 5;
    for (let i = 0; i <= cells * 5; i += 1) {
      const p = i * subStep;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.strokeStyle = theme === 'light' ? 'rgba(71,85,105,0.34)' : 'rgba(148,163,184,0.2)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= cells; i += 1) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.strokeStyle = theme === 'light' ? 'rgba(51,65,85,0.52)' : 'rgba(148,163,184,0.35)';
    ctx.lineWidth = 2.2;
    for (let i = 0; i <= cells; i += 4) {
      const p = i * step;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    ctx.fillStyle = theme === 'light' ? 'rgba(71,85,105,0.45)' : 'rgba(148,163,184,0.35)';
    ctx.font = 'bold 16px Consolas, monospace';
    ctx.fillText('ROBOFORGE PRECISION BENCH  ·  10 mm GRID', 22, 34);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  if (theme === 'light') cachedLightMatTex = tex;
  else cachedDarkMatTex = tex;
  return tex;
}

/**
 * Generates a high-contrast silkscreen label plane for PCB modules, RF shields, or battery packs.
 */
export function makeSilkscreenPlane(
  title: string,
  subtitle: string,
  width: number,
  depth: number,
  bg = '#111827',
  fg = '#f8fafc',
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 248, 120);
    ctx.fillStyle = fg;
    ctx.font = 'bold 34px Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 128, subtitle ? 46 : 64);
    if (subtitle) {
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '20px Consolas, monospace';
      ctx.fillText(subtitle, 128, 92);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

let oledFrame: HTMLCanvasElement | null = null;

/**
 * Paints what a 0.96" two-colour SSD1306 shows: a 128 x 64 dot matrix (text is rasterised at the panel's real
 * resolution and thresholded to lit/unlit dots, drawn with the small gaps between OLED pixels), the top 16 rows
 * yellow and the rest sky blue, as on the common yellow/blue panels. An unpowered panel is plain black.
 * The target canvas keeps a 2:1 aspect (any multiple of 128 x 64).
 */
export function paintOledCanvas(canvas: HTMLCanvasElement, lines: readonly string[], powered: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!powered) return;

  const W = 128;
  const H = 64;
  if (!oledFrame) {
    oledFrame = document.createElement('canvas');
    oledFrame.width = W;
    oledFrame.height = H;
  }
  const f = oledFrame.getContext('2d', { willReadFrequently: true });
  if (!f) return;
  f.clearRect(0, 0, W, H);
  f.fillStyle = '#fff';
  f.textBaseline = 'top';
  f.textAlign = 'left';
  const displayLines = lines.length > 0 ? lines : ['ROBOFORGE 2WD', 'I2C 0x3C OK', 'PRESS RUN'];
  displayLines.slice(0, 5).forEach((line, idx) => {
    // first line inside the 16-row yellow band, the rest on the blue part
    f.font = idx === 0 ? 'bold 11px Consolas, "Courier New", monospace' : '10px Consolas, "Courier New", monospace';
    f.fillText(line.slice(0, 21), 2, idx === 0 ? 2 : 18 + (idx - 1) * 11.5);
  });

  const data = f.getImageData(0, 0, W, H).data;
  const sx = canvas.width / W;
  const sy = canvas.height / H;
  const gap = Math.max(0.5, sx * 0.16);
  for (let y = 0; y < H; y += 1) {
    ctx.fillStyle = y < 16 ? '#ffd23a' : '#4cc8ff';
    for (let x = 0; x < W; x += 1) {
      if ((data[(y * W + x) * 4 + 3] ?? 0) > 100) ctx.fillRect(x * sx, y * sy, sx - gap, sy - gap);
    }
  }
}
