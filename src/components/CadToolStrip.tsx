import type React from 'react';
import {
  ArrowUpDown,
  Box,
  Cable,
  Circle,
  Copy,
  Crosshair,
  Cylinder,
  Layers,
  MousePointer2,
  Move,
  RotateCw,
  Ruler,
  Trash2,
} from 'lucide-react';
import type { ComponentKind } from '../schema/projectSchema';
import type { WorkbenchTool } from '../viewport/WorkbenchScene';

export interface CadToolStripProps {
  tool: WorkbenchTool;
  showCom: boolean;
  hasSelection: boolean;
  hasComponentSelection: boolean;
  onSelectTool: (tool: WorkbenchTool) => void;
  onAddShape: (kind: ComponentKind) => void;
  onRotateStep: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleCom: () => void;
}

/**
 * Horizontal CAD ribbon above the 3D Workbench viewport providing quick shape primitives,
 * transform gizmos (Move, Lift, Rotate), Wire Routing, 3D Tape Measure, and Center-of-Mass toggle.
 */
export function CadToolStrip({
  tool,
  showCom,
  hasSelection,
  hasComponentSelection,
  onSelectTool,
  onAddShape,
  onRotateStep,
  onDuplicate,
  onDelete,
  onToggleCom,
}: CadToolStripProps): React.ReactElement {
  return (
    <div className="cad-strip" role="toolbar" aria-label="CAD Workbench Tools">
      <button type="button" className="cad-tool-btn" onClick={() => onAddShape('cad_box')}>
        <Box size={15} />
        <span>Box</span>
      </button>
      <button type="button" className="cad-tool-btn" onClick={() => onAddShape('cad_cylinder')}>
        <Cylinder size={15} />
        <span>Cylinder</span>
      </button>
      <button type="button" className="cad-tool-btn" onClick={() => onAddShape('cad_standoff')}>
        <Circle size={15} />
        <span>Standoff</span>
      </button>
      <button type="button" className="cad-tool-btn" onClick={() => onAddShape('cad_plate')}>
        <Layers size={15} />
        <span>CF Plate</span>
      </button>

      <div className="cad-divider" />

      <button
        type="button"
        className={`cad-tool-btn ${tool === 'select' ? 'active' : ''}`}
        onClick={() => onSelectTool('select')}
      >
        <MousePointer2 size={15} />
        <span>Select</span>
      </button>
      <button
        type="button"
        className={`cad-tool-btn ${tool === 'wire' ? 'active' : ''}`}
        onClick={() => onSelectTool('wire')}
      >
        <Cable size={15} />
        <span>Wire</span>
      </button>
      <button
        type="button"
        className={`cad-tool-btn ${tool === 'move' ? 'active' : ''}`}
        onClick={() => onSelectTool('move')}
      >
        <Move size={15} />
        <span>Move</span>
      </button>
      <button
        type="button"
        className={`cad-tool-btn ${tool === 'lift' ? 'active' : ''}`}
        onClick={() => onSelectTool('lift')}
      >
        <ArrowUpDown size={15} />
        <span>Lift</span>
      </button>
      <button
        type="button"
        className={`cad-tool-btn ${tool === 'rotate' ? 'active' : ''}`}
        onClick={() => onSelectTool('rotate')}
      >
        <RotateCw size={15} />
        <span>Turn</span>
      </button>

      <div className="cad-divider" />

      <button type="button" className="cad-tool-btn" disabled={!hasComponentSelection} onClick={onRotateStep}>
        <RotateCw size={15} />
        <span>+15°</span>
      </button>
      <button type="button" className="cad-tool-btn" disabled={!hasComponentSelection} onClick={onDuplicate}>
        <Copy size={15} />
        <span>Copy</span>
      </button>
      <button type="button" className="cad-tool-btn" disabled={!hasSelection} onClick={onDelete}>
        <Trash2 size={15} />
        <span>Delete</span>
      </button>

      <div className="cad-divider" />

      <button
        type="button"
        className={`cad-tool-btn ${tool === 'measure' ? 'active' : ''}`}
        onClick={() => onSelectTool('measure')}
      >
        <Ruler size={15} />
        <span>Measure</span>
      </button>
      <button
        type="button"
        className={`cad-tool-btn ${showCom ? 'active' : ''}`}
        title="Show 3D Center-of-Mass (CoM) balance target"
        onClick={onToggleCom}
      >
        <Crosshair size={15} />
        <span>CoM</span>
      </button>
    </div>
  );
}
