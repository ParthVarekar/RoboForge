import type { ComponentKind } from '../schema/projectSchema';

/**
 * Returns a crisp inline SVG data URI thumbnail depicting the physical silhouette of a catalog part.
 */
export function getPartThumbnailSvg(kind: ComponentKind): string {
  const wrap = (inner: string): string =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 76">${inner}</svg>`,
    )}`;

  switch (kind) {
    case 'esp32_devkit':
      return wrap(`
        <rect x="20" y="14" width="80" height="48" rx="4" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <rect x="28" y="23" width="32" height="30" rx="2" fill="#cbd5e1" stroke="#64748b"/>
        <rect x="92" y="29" width="11" height="18" rx="2" fill="#94a3b8"/>
        <g fill="#eab308">${Array.from({ length: 10 }, (_, i) => `<rect x="${26 + i * 7}" y="11" width="3" height="5"/><rect x="${26 + i * 7}" y="60" width="3" height="5"/>`).join('')}</g>
        <circle cx="78" cy="48" r="3" fill="#3b82f6"/>
        <text x="44" y="42" font-size="8" font-family="monospace" text-anchor="middle" fill="#334155">ESP32</text>
      `);
    case 'fc_esc_stack':
      return wrap(`
        <rect x="30" y="16" width="60" height="46" rx="5" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <rect x="44" y="26" width="32" height="24" rx="2" fill="#334155"/>
        <circle cx="37" cy="23" r="3" fill="#ef4444"/><circle cx="83" cy="23" r="3" fill="#ef4444"/>
        <circle cx="37" cy="55" r="3" fill="#ef4444"/><circle cx="83" cy="55" r="3" fill="#ef4444"/>
        <text x="60" y="41" font-size="8" font-family="monospace" text-anchor="middle" fill="#f8fafc">F7/45A</text>
      `);
    case 'drv8833':
      return wrap(`
        <rect x="30" y="14" width="60" height="48" rx="4" fill="#6b21a8" stroke="#3b0764" stroke-width="2"/>
        <rect x="48" y="25" width="24" height="26" rx="2" fill="#111827"/>
        <g fill="#facc15">${Array.from({ length: 5 }, (_, i) => `<circle cx="36" cy="${21 + i * 8}" r="2.2"/><circle cx="84" cy="${21 + i * 8}" r="2.2"/>`).join('')}</g>
      `);
    case 'mpu6050':
      return wrap(`
        <rect x="30" y="18" width="60" height="40" rx="4" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="2"/>
        <rect x="52" y="29" width="16" height="16" rx="1" fill="#0f172a"/>
        <circle cx="37" cy="25" r="3" fill="#eab308"/><circle cx="83" cy="25" r="3" fill="#eab308"/>
        <g fill="#facc15">${Array.from({ length: 5 }, (_, i) => `<rect x="${40 + i * 9}" y="53" width="4" height="6"/>`).join('')}</g>
      `);
    case 'hcsr04':
      return wrap(`
        <rect x="18" y="18" width="84" height="40" rx="4" fill="#0284c7" stroke="#0369a1" stroke-width="2"/>
        <circle cx="40" cy="38" r="14" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
        <circle cx="40" cy="38" r="9" fill="#334155"/>
        <circle cx="80" cy="38" r="14" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
        <circle cx="80" cy="38" r="9" fill="#334155"/>
        <rect x="54" y="21" width="12" height="5" rx="2" fill="#e2e8f0"/>
      `);
    case 'oled_ssd1306':
      return wrap(`
        <rect x="30" y="10" width="60" height="56" rx="4" fill="#1e3a8a"/>
        <rect x="34" y="22" width="52" height="36" rx="2" fill="#09090b" stroke="#334155"/>
        <text x="60" y="37" font-size="8" font-family="monospace" text-anchor="middle" fill="#38bdf8">YAW 0.0°</text>
        <text x="60" y="49" font-size="8" font-family="monospace" text-anchor="middle" fill="#38bdf8">DST 42cm</text>
      `);
    case 'esp32_cam':
      return wrap(`
        <rect x="34" y="10" width="52" height="56" rx="4" fill="#18181b" stroke="#3f3f46" stroke-width="2"/>
        <circle cx="60" cy="34" r="12" fill="#09090b" stroke="#64748b" stroke-width="2"/>
        <circle cx="60" cy="34" r="6" fill="#0284c7"/>
        <rect x="72" y="16" width="7" height="7" rx="1" fill="#fef08a"/>
      `);
    case 'tactile_button':
      return wrap(`
        <rect x="36" y="18" width="48" height="40" rx="4" fill="#cbd5e1" stroke="#475569" stroke-width="2"/>
        <circle cx="60" cy="38" r="13" fill="#1e293b"/>
        <circle cx="42" cy="24" r="2.2" fill="#334155"/><circle cx="78" cy="24" r="2.2" fill="#334155"/>
        <circle cx="42" cy="52" r="2.2" fill="#334155"/><circle cx="78" cy="52" r="2.2" fill="#334155"/>
      `);
    case 'dc_motor':
      return wrap(`
        <rect x="18" y="24" width="54" height="28" rx="4" fill="#eab308" stroke="#a16207" stroke-width="2"/>
        <rect x="70" y="28" width="22" height="20" rx="3" fill="#cbd5e1" stroke="#64748b"/>
        <circle cx="38" cy="38" r="19" fill="#18181b" stroke="#3f3f46" stroke-width="2"/>
        <circle cx="38" cy="38" r="12" fill="#facc15"/>
      `);
    case 'brushless_2207':
      return wrap(`
        <ellipse cx="60" cy="38" rx="46" ry="7" fill="#94a3b8" opacity="0.7" transform="rotate(-18 60 38)"/>
        <ellipse cx="60" cy="38" rx="46" ry="7" fill="#64748b" opacity="0.7" transform="rotate(42 60 38)"/>
        <circle cx="60" cy="38" r="15" fill="#1e293b" stroke="#d97706" stroke-width="2.5"/>
        <circle cx="60" cy="38" r="6" fill="#2563eb"/>
      `);
    case 'battery_2s':
      return wrap(`
        <rect x="24" y="14" width="72" height="48" rx="6" fill="#0f172a"/>
        <rect x="28" y="19" width="64" height="17" rx="5" fill="#0284c7"/>
        <rect x="28" y="40" width="64" height="17" rx="5" fill="#0369a1"/>
        <text x="60" y="31" font-size="8" font-family="monospace" text-anchor="middle" fill="#fff">2S 7.4V</text>
      `);
    case 'battery_6s_lipo':
      return wrap(`
        <rect x="22" y="18" width="66" height="40" rx="4" fill="#1e293b" stroke="#0f172a" stroke-width="2"/>
        <rect x="50" y="16" width="12" height="44" fill="#334155"/>
        <rect x="88" y="30" width="12" height="16" rx="2" fill="#facc15" stroke="#ca8a04"/>
        <text x="42" y="41" font-size="8" font-family="monospace" text-anchor="middle" fill="#e2e8f0">6S 22V</text>
      `);
    case 'lm2596_buck':
      return wrap(`
        <rect x="18" y="18" width="84" height="40" rx="4" fill="#1d4ed8" stroke="#1e3a8a" stroke-width="2"/>
        <rect x="56" y="26" width="22" height="22" rx="3" fill="#0f172a"/>
        <rect x="28" y="25" width="14" height="18" rx="1" fill="#38bdf8"/>
        <circle cx="35" cy="31" r="3" fill="#facc15"/>
      `);
    case 'resistor_10k':
      return wrap(`
        <line x1="14" y1="38" x2="106" y2="38" stroke="#94a3b8" stroke-width="4"/>
        <rect x="36" y="27" width="48" height="22" rx="9" fill="#d4a373" stroke="#92400e"/>
        <rect x="44" y="27" width="5" height="22" fill="#78350f"/>
        <rect x="54" y="27" width="5" height="22" fill="#09090b"/>
        <rect x="64" y="27" width="5" height="22" fill="#ea580c"/>
        <rect x="74" y="27" width="4" height="22" fill="#eab308"/>
      `);
    case 'led_5mm':
      return wrap(`
        <line x1="53" y1="48" x2="53" y2="68" stroke="#94a3b8" stroke-width="3"/>
        <line x1="67" y1="48" x2="67" y2="64" stroke="#94a3b8" stroke-width="3"/>
        <path d="M45 48 V30 A15 15 0 0 1 75 30 V48 Z" fill="#22c55e" stroke="#15803d" stroke-width="2"/>
        <circle cx="55" cy="27" r="4" fill="#bbf7d0" opacity="0.7"/>
      `);
    case 'cap_1000uf':
      return wrap(`
        <line x1="52" y1="52" x2="52" y2="68" stroke="#94a3b8" stroke-width="3"/>
        <line x1="68" y1="52" x2="68" y2="65" stroke="#94a3b8" stroke-width="3"/>
        <rect x="42" y="14" width="36" height="40" rx="5" fill="#0f172a" stroke="#334155"/>
        <rect x="68" y="14" width="7" height="40" fill="#cbd5e1"/>
        <text x="55" y="38" font-size="8" font-family="monospace" text-anchor="middle" fill="#e2e8f0">1000u</text>
      `);
    case 'chassis_2wd':
      return wrap(`
        <rect x="24" y="14" width="72" height="48" rx="8" fill="#27272a" stroke="#52525b" stroke-width="2"/>
        <circle cx="32" cy="22" r="3" fill="#dc2626"/><circle cx="88" cy="22" r="3" fill="#dc2626"/>
        <circle cx="32" cy="54" r="3" fill="#dc2626"/><circle cx="88" cy="54" r="3" fill="#dc2626"/>
        <polygon points="90,38 78,31 78,45" fill="#38bdf8"/>
      `);
    case 'frame_quad_5in':
      return wrap(`
        <line x1="22" y1="14" x2="98" y2="62" stroke="#27272a" stroke-width="9" stroke-linecap="round"/>
        <line x1="98" y1="14" x2="22" y2="62" stroke="#27272a" stroke-width="9" stroke-linecap="round"/>
        <rect x="44" y="24" width="32" height="28" rx="4" fill="#3f3f46" stroke="#18181b" stroke-width="2"/>
        <circle cx="49" cy="29" r="2.5" fill="#dc2626"/><circle cx="71" cy="29" r="2.5" fill="#dc2626"/>
        <circle cx="49" cy="47" r="2.5" fill="#dc2626"/><circle cx="71" cy="47" r="2.5" fill="#dc2626"/>
      `);
    case 'vtx_antenna':
      return wrap(`
        <rect x="48" y="44" width="24" height="20" rx="3" fill="#f97316"/>
        <line x1="60" y1="44" x2="60" y2="20" stroke="#1e293b" stroke-width="4"/>
        <polygon points="51,10 69,10 65,24 55,24" fill="#0f172a"/>
      `);
    case 'cad_box':
      return wrap(`<rect x="34" y="18" width="52" height="40" rx="3" fill="#64748b" stroke="#334155" stroke-width="2"/>`);
    case 'cad_cylinder':
      return wrap(`<ellipse cx="60" cy="22" rx="22" ry="8" fill="#cbd5e1"/><rect x="38" y="22" width="44" height="34" fill="#94a3b8"/><ellipse cx="60" cy="56" rx="22" ry="8" fill="#64748b"/>`);
    case 'cad_standoff':
      return wrap(`<rect x="52" y="12" width="16" height="52" rx="3" fill="#dc2626" stroke="#991b1b" stroke-width="2"/>`);
    case 'cad_plate':
      return wrap(`<polygon points="22,42 50,22 98,34 70,54" fill="#27272a" stroke="#52525b" stroke-width="2"/>`);
  }
}
