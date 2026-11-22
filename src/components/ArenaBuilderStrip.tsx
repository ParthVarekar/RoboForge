import type React from 'react';
import {
  Box,
  Circle,
  Columns3,
  Copy,
  Cylinder,
  Flag,
  MousePointer2,
  Package,
  PenTool,
  RotateCw,
  Trash2,
  Trees,
  Triangle,
  Warehouse,
} from 'lucide-react';
import { ARENA_TEMPLATES } from '../catalog/arenaPresets';
import type { ArenaEnvironment, ArenaObstacleKind } from '../schema/projectSchema';
import type { ArenaEditTool } from '../viewport/ArenaScene';

export interface ArenaBuilderStripProps {
  activeEnv: ArenaEnvironment;
  editTool: ArenaEditTool;
  hasSelection: boolean;
  onApplyTemplate: (env: ArenaEnvironment) => void;
  onSelectEditTool: (tool: ArenaEditTool) => void;
  onRotateSelected: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
}

const ELEMENT_BUTTONS: Array<{ kind: ArenaObstacleKind; label: string; icon: React.ReactElement }> = [
  { kind: 'wall', label: 'Wall', icon: <Warehouse size={14} /> },
  { kind: 'tree', label: 'Tree', icon: <Trees size={14} /> },
  { kind: 'gate', label: 'Gate', icon: <Flag size={14} /> },
  { kind: 'box', label: 'Box', icon: <Box size={14} /> },
  { kind: 'cylinder', label: 'Cylinder', icon: <Cylinder size={14} /> },
  { kind: 'sphere', label: 'Boulder', icon: <Circle size={14} /> },
  { kind: 'pillar', label: 'Pillar', icon: <Columns3 size={14} /> },
  { kind: 'cone', label: 'Cone', icon: <Triangle size={14} /> },
  { kind: 'bag', label: 'Bag', icon: <Package size={14} /> },
];

/**
 * Interactive 3D Arena Builder ribbon placed above the Arena viewport:
 * switch full environment worlds (Lab, Forest, Maze, Airfield, Blank),
 * draw custom walls by clicking two corners, drop in trees/gates/shapes, or move & rotate elements.
 */
export function ArenaBuilderStrip({
  activeEnv,
  editTool,
  hasSelection,
  onApplyTemplate,
  onSelectEditTool,
  onRotateSelected,
  onDuplicateSelected,
  onDeleteSelected,
}: ArenaBuilderStripProps): React.ReactElement {
  return (
    <div className="cad-strip" aria-label="Arena Environment Builder">
      {ARENA_TEMPLATES.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          className={`cad-tool-btn ${activeEnv === tpl.id ? 'active' : ''}`}
          title={tpl.description}
          onClick={() => onApplyTemplate(tpl.id)}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700 }}>{tpl.shortLabel}</span>
          <span style={{ fontSize: 9, opacity: 0.72 }}>World</span>
        </button>
      ))}

      <div className="cad-divider" />

      <button
        type="button"
        className={`cad-tool-btn ${editTool === 'select' ? 'active' : ''}`}
        title="Select and drag obstacles in the 3D Arena"
        onClick={() => onSelectEditTool('select')}
      >
        <MousePointer2 size={14} />
        <span>Select</span>
      </button>
      <button
        type="button"
        className={`cad-tool-btn ${editTool === 'draw_wall' ? 'active' : ''}`}
        title="Click start and end points on the floor to draw a custom wall"
        onClick={() => onSelectEditTool('draw_wall')}
      >
        <PenTool size={14} />
        <span>Draw Wall</span>
      </button>

      <div className="cad-divider" />

      {ELEMENT_BUTTONS.map((item) => (
        <button
          key={item.kind}
          type="button"
          className={`cad-tool-btn ${editTool === item.kind ? 'active' : ''}`}
          title={`Click floor in 3D Arena to place a ${item.label}`}
          onClick={() => onSelectEditTool(editTool === item.kind ? 'select' : item.kind)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}

      <div className="cad-divider" />

      <button
        type="button"
        className="cad-tool-btn"
        disabled={!hasSelection}
        title="Rotate selected obstacle by +15 deg"
        onClick={onRotateSelected}
      >
        <RotateCw size={14} />
        <span>+15°</span>
      </button>
      <button
        type="button"
        className="cad-tool-btn"
        disabled={!hasSelection}
        title="Duplicate selected obstacle"
        onClick={onDuplicateSelected}
      >
        <Copy size={14} />
        <span>Copy</span>
      </button>
      <button
        type="button"
        className="cad-tool-btn"
        disabled={!hasSelection}
        title="Delete selected obstacle"
        onClick={onDeleteSelected}
      >
        <Trash2 size={14} />
        <span>Delete</span>
      </button>
    </div>
  );
}
