import type React from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  Plus,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
} from 'lucide-react';
import { ARENA_TEMPLATES } from '../catalog/arenaPresets';
import type { ArenaVehicleMode } from '../engine/arenaPhysics';
import type {
  ArenaConfig,
  ArenaEnvironment,
  ArenaObstacle,
  ArenaObstacleKind,
  TwinFaultConfig,
  Vec3,
} from '../schema/projectSchema';

const OBSTACLE_SWATCHES = ['#475569', '#15803d', '#06b6d4', '#f97316', '#d97706', '#64748b', '#78716c', '#a855f7'];

export interface ArenaControlsPanelProps {
  arenaConfig: ArenaConfig;
  vehicleMode: ArenaVehicleMode;
  faults: TwinFaultConfig;
  obstacles: ArenaObstacle[];
  selectedObstacleId: string | null;
  onChangeArenaConfig: (next: ArenaConfig) => void;
  onApplyArenaTemplate: (env: ArenaEnvironment) => void;
  onChangeVehicleMode: (mode: ArenaVehicleMode) => void;
  onChangeFaults: (next: TwinFaultConfig) => void;
  onAddObstacle: (kind: ArenaObstacleKind) => void;
  onSelectObstacle: (id: string | null) => void;
  onUpdateObstacle: (id: string, patch: Partial<ArenaObstacle>) => void;
  onDuplicateObstacle: (id: string) => void;
  onRemoveObstacle: (id: string) => void;
  onResetObstacles: () => void;
  onClearObstacles: () => void;
  onResetRover: () => void;
  onManualDrive: (left: number, right: number) => void;
  onManualDroneControl: (patch: { forward?: number; strafe?: number; climb?: number; yaw?: number }) => void;
}

/**
 * Right-dock panel for shaping the customizable 3D Arena (environment worlds, dimensions,
 * perimeter walls, selected obstacle editor), piloting Rover/Drone manually, and injecting
 * Reality-Gap hardware faults.
 */
export function ArenaControlsPanel({
  arenaConfig,
  vehicleMode,
  faults,
  obstacles,
  selectedObstacleId,
  onChangeArenaConfig,
  onApplyArenaTemplate,
  onChangeVehicleMode,
  onChangeFaults,
  onAddObstacle,
  onSelectObstacle,
  onUpdateObstacle,
  onDuplicateObstacle,
  onRemoveObstacle,
  onResetObstacles,
  onClearObstacles,
  onResetRover,
  onManualDrive,
  onManualDroneControl,
}: ArenaControlsPanelProps): React.ReactElement {
  const updateFault = (patch: Partial<TwinFaultConfig>) => onChangeFaults({ ...faults, ...patch });
  const updateArena = (patch: Partial<ArenaConfig>) => onChangeArenaConfig({ ...arenaConfig, ...patch });
  const selectedObs = obstacles.find((o) => o.id === selectedObstacleId) ?? null;

  const updateObsPos = (obs: ArenaObstacle, axis: 0 | 2, val: number) => {
    const next: Vec3 = [...obs.position];
    next[axis] = Number(val.toFixed(2));
    onUpdateObstacle(obs.id, { position: next });
  };

  const updateObsSize = (obs: ArenaObstacle, axis: 0 | 1 | 2, val: number) => {
    const next: Vec3 = [...obs.size];
    next[axis] = Math.max(0.1, Number(val.toFixed(2)));
    onUpdateObstacle(obs.id, { size: next });
  };

  return (
    <div className="panel-scroll">
      {/* Arena World & Dimensions Builder */}
      <div className="budget-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-strong)' }}>
            CUSTOM ARENA &amp; ENVIRONMENT
          </span>
          <button type="button" className="btn btn-sm" onClick={onResetRover}>
            <RotateCcw size={11} /> Reset Rover
          </button>
        </div>

        <select
          className="select-input"
          aria-label="Arena Environment Preset"
          value={arenaConfig.environment}
          onChange={(e) => onApplyArenaTemplate(e.target.value as ArenaEnvironment)}
        >
          {ARENA_TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.label}
            </option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)' }}>VEHICLE</span>
          <button
            type="button"
            className={`btn btn-sm ${vehicleMode === 'rover' ? 'btn-accent' : ''}`}
            onClick={() => onChangeVehicleMode('rover')}
          >
            2WD Rover
          </button>
          <button
            type="button"
            className={`btn btn-sm ${vehicleMode === 'drone' ? 'btn-accent' : ''}`}
            onClick={() => onChangeVehicleMode('drone')}
          >
            5&quot; Drone
          </button>
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Arena Width (X)</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{arenaConfig.widthM.toFixed(1)} m</strong>
          </div>
          <input
            type="range"
            aria-label="Arena Width"
            min={3}
            max={26}
            step={0.5}
            value={arenaConfig.widthM}
            onChange={(e) => updateArena({ widthM: Number(e.target.value) })}
          />
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Arena Length (Z)</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{arenaConfig.lengthM.toFixed(1)} m</strong>
          </div>
          <input
            type="range"
            aria-label="Arena Length"
            min={3}
            max={26}
            step={0.5}
            value={arenaConfig.lengthM}
            onChange={(e) => updateArena({ lengthM: Number(e.target.value) })}
          />
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Perimeter Wall Height</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {arenaConfig.enclosed ? `${arenaConfig.wallHeightM.toFixed(2)} m` : 'Open'}
            </strong>
          </div>
          <input
            type="range"
            aria-label="Perimeter Wall Height"
            min={0}
            max={3.0}
            step={0.1}
            value={arenaConfig.wallHeightM}
            onChange={(e) => {
              const h = Number(e.target.value);
              updateArena({ wallHeightM: h, enclosed: h > 0.02 });
            }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={arenaConfig.enclosed}
            onChange={(e) =>
              updateArena({
                enclosed: e.target.checked,
                wallHeightM: e.target.checked ? Math.max(0.24, arenaConfig.wallHeightM) : 0,
              })
            }
          />
          <span>Enclose perimeter with boundary walls</span>
        </label>
      </div>

      {/* Selected Arena Obstacle / Wall Inspector */}
      {selectedObs && (
        <div className="budget-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}>Selected: {selectedObs.label}</strong>
            <span className="pill">{selectedObs.kind}</span>
          </div>

          <input
            type="text"
            className="search-box"
            aria-label="Obstacle Label"
            value={selectedObs.label}
            onChange={(e) => onUpdateObstacle(selectedObs.id, { label: e.target.value })}
          />

          <div className="num-grid">
            <label className="num-field">
              X (m)
              <input
                type="number"
                step={0.2}
                value={selectedObs.position[0]}
                onChange={(e) => updateObsPos(selectedObs, 0, Number(e.target.value))}
              />
            </label>
            <label className="num-field">
              Z (m)
              <input
                type="number"
                step={0.2}
                value={selectedObs.position[2]}
                onChange={(e) => updateObsPos(selectedObs, 2, Number(e.target.value))}
              />
            </label>
            <label className="num-field">
              Rot (°)
              <input
                type="number"
                step={15}
                value={Math.round(((selectedObs.rotationY ?? 0) * 180) / Math.PI)}
                onChange={(e) =>
                  onUpdateObstacle(selectedObs.id, {
                    rotationY: Number(((Number(e.target.value) * Math.PI) / 180).toFixed(3)),
                  })
                }
              />
            </label>
          </div>

          <div className="num-grid">
            <label className="num-field">
              W (m)
              <input
                type="number"
                step={0.2}
                min={0.1}
                value={selectedObs.size[0]}
                onChange={(e) => updateObsSize(selectedObs, 0, Number(e.target.value))}
              />
            </label>
            <label className="num-field">
              H (m)
              <input
                type="number"
                step={0.2}
                min={0.1}
                value={selectedObs.size[1]}
                onChange={(e) => updateObsSize(selectedObs, 1, Number(e.target.value))}
              />
            </label>
            <label className="num-field">
              D (m)
              <input
                type="number"
                step={0.2}
                min={0.1}
                value={selectedObs.size[2]}
                onChange={(e) => updateObsSize(selectedObs, 2, Number(e.target.value))}
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {OBSTACLE_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Set obstacle color ${hex}`}
                className={`swatch ${selectedObs.color === hex ? 'active' : ''}`}
                style={{ background: hex }}
                onClick={() => onUpdateObstacle(selectedObs.id, { color: hex })}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                onUpdateObstacle(selectedObs.id, {
                  rotationY: Number(((selectedObs.rotationY ?? 0) + Math.PI / 12).toFixed(3)),
                })
              }
            >
              <RotateCw size={11} /> +15°
            </button>
            <button type="button" className="btn btn-sm" onClick={() => onDuplicateObstacle(selectedObs.id)}>
              <Copy size={11} /> Duplicate
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ color: 'var(--red)', borderColor: 'rgba(220,38,38,0.4)' }}
              onClick={() => onRemoveObstacle(selectedObs.id)}
            >
              <Trash2 size={11} /> Delete
            </button>
          </div>
        </div>
      )}

      {/* Arena Elements & Quick Spawn */}
      <div className="budget-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
            ARENA OBJECTS ({obstacles.length})
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn btn-sm" onClick={onResetObstacles}>
              Reset 2 Bags
            </button>
            <button type="button" className="btn btn-sm" onClick={onClearObstacles}>
              Clear
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {(
            [
              ['wall', 'Wall'],
              ['tree', 'Tree'],
              ['gate', 'Gate'],
              ['bag', 'Bag'],
              ['box', 'Crate'],
              ['cone', 'Cone'],
              ['cylinder', 'Cylinder'],
              ['sphere', 'Boulder'],
              ['pillar', 'Pillar'],
              ['ramp', 'Ramp'],
            ] as const
          ).map(([kind, label]) => (
            <button key={kind} type="button" className="btn btn-sm" onClick={() => onAddObstacle(kind)}>
              <Plus size={11} /> {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 155, overflowY: 'auto' }}>
          {obstacles.map((obs) => (
            <div
              key={obs.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11.5,
                padding: '4px 6px',
                background: selectedObstacleId === obs.id ? 'var(--accent-soft)' : 'var(--bg-panel)',
                borderRadius: 5,
                border:
                  selectedObstacleId === obs.id
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border)',
                cursor: 'pointer',
              }}
              onClick={() => onSelectObstacle(obs.id)}
            >
              <span>
                {obs.label}{' '}
                <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                  ({obs.position[0].toFixed(1)}, {obs.position[2].toFixed(1)} m)
                </span>
              </span>
              <button
                type="button"
                className="btn btn-sm"
                aria-label={`Remove ${obs.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveObstacle(obs.id);
                }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Drive / Drone Flight Override */}
      <div className="budget-card">
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          {vehicleMode === 'drone'
            ? 'MANUAL DRONE FLIGHT (WASD + Q/E ALTITUDE)'
            : 'MANUAL DRIVE OVERRIDE (HOLD OR WASD IN ARENA)'}
        </div>
        <div className="wasd-pad">
          <div />
          <button
            type="button"
            className="btn"
            style={{ justifyContent: 'center' }}
            onPointerDown={() =>
              vehicleMode === 'drone'
                ? onManualDroneControl({ forward: 0.9 })
                : onManualDrive(0.8, 0.8)
            }
            onPointerUp={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ forward: 0 }) : onManualDrive(0, 0)
            }
            onPointerLeave={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ forward: 0 }) : onManualDrive(0, 0)
            }
          >
            <ArrowUp size={15} />
          </button>
          <div />
          <button
            type="button"
            className="btn"
            style={{ justifyContent: 'center' }}
            onPointerDown={() =>
              vehicleMode === 'drone'
                ? onManualDroneControl({ yaw: 0.85 })
                : onManualDrive(-0.7, 0.7)
            }
            onPointerUp={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ yaw: 0 }) : onManualDrive(0, 0)
            }
            onPointerLeave={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ yaw: 0 }) : onManualDrive(0, 0)
            }
          >
            <ArrowLeft size={15} />
          </button>
          <button
            type="button"
            className="btn btn-estop"
            style={{ justifyContent: 'center' }}
            onClick={() => {
              onManualDrive(0, 0);
              onManualDroneControl({ forward: 0, strafe: 0, climb: 0, yaw: 0 });
            }}
          >
            <Square size={13} />
          </button>
          <button
            type="button"
            className="btn"
            style={{ justifyContent: 'center' }}
            onPointerDown={() =>
              vehicleMode === 'drone'
                ? onManualDroneControl({ yaw: -0.85 })
                : onManualDrive(0.7, -0.7)
            }
            onPointerUp={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ yaw: 0 }) : onManualDrive(0, 0)
            }
            onPointerLeave={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ yaw: 0 }) : onManualDrive(0, 0)
            }
          >
            <ArrowRight size={15} />
          </button>
          <div />
          <button
            type="button"
            className="btn"
            style={{ justifyContent: 'center' }}
            onPointerDown={() =>
              vehicleMode === 'drone'
                ? onManualDroneControl({ forward: -0.9 })
                : onManualDrive(-0.8, -0.8)
            }
            onPointerUp={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ forward: 0 }) : onManualDrive(0, 0)
            }
            onPointerLeave={() =>
              vehicleMode === 'drone' ? onManualDroneControl({ forward: 0 }) : onManualDrive(0, 0)
            }
          >
            <ArrowDown size={15} />
          </button>
          <div />
        </div>

        {vehicleMode === 'drone' && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-sm btn-accent"
              onPointerDown={() => onManualDroneControl({ climb: 1 })}
              onPointerUp={() => onManualDroneControl({ climb: 0 })}
              onPointerLeave={() => onManualDroneControl({ climb: 0 })}
            >
              <ChevronUp size={13} /> Climb (Q)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onPointerDown={() => onManualDroneControl({ climb: -1 })}
              onPointerUp={() => onManualDroneControl({ climb: 0 })}
              onPointerLeave={() => onManualDroneControl({ climb: 0 })}
            >
              <ChevronDown size={13} /> Descend (E)
            </button>
          </div>
        )}
      </div>

      {/* Reality-Gap Fault Injector */}
      <div className="budget-card">
        <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7' }}>
          REALITY-GAP &amp; TWIN FAULT INJECTOR
        </div>
        <div className="part-meta">
          Inject weaker right motor, floor PWM deadband, and gyro drift to test hardware resilience.
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              updateFault({
                leftMotorScale: 1.0,
                rightMotorScale: 0.85,
                minStartPwm: 150,
                gyroDriftDegPerSec: 0.4,
              })
            }
          >
            Real Rover Profile (15% Weak R)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              updateFault({
                leftMotorScale: 1.0,
                rightMotorScale: 1.0,
                minStartPwm: 0,
                gyroDriftDegPerSec: 0,
                floorFriction: 0.8,
                usNoiseCm: 0,
              })
            }
          >
            Ideal Sim
          </button>
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Left Motor Gain</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {Math.round(faults.leftMotorScale * 100)}%
            </strong>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.01}
            value={faults.leftMotorScale}
            onChange={(e) => updateFault({ leftMotorScale: Number(e.target.value) })}
          />
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Right Motor Gain (Weaker = Pulls Right)</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {Math.round(faults.rightMotorScale * 100)}%
            </strong>
          </div>
          <input
            type="range"
            min={0.5}
            max={1.2}
            step={0.01}
            value={faults.rightMotorScale}
            onChange={(e) => updateFault({ rightMotorScale: Number(e.target.value) })}
          />
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Motor Start Deadband (Min PWM)</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{faults.minStartPwm} PWM</strong>
          </div>
          <input
            type="range"
            min={0}
            max={210}
            step={5}
            value={faults.minStartPwm}
            onChange={(e) => updateFault({ minStartPwm: Number(e.target.value) })}
          />
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>MPU6050 Gyro Drift</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>
              {faults.gyroDriftDegPerSec.toFixed(2)} deg/s
            </strong>
          </div>
          <input
            type="range"
            min={-3}
            max={3}
            step={0.05}
            value={faults.gyroDriftDegPerSec}
            onChange={(e) => updateFault({ gyroDriftDegPerSec: Number(e.target.value) })}
          />
        </div>

        <div className="slider-row">
          <div className="slider-head">
            <span>Floor Traction / Friction</span>
            <strong style={{ fontFamily: 'var(--font-mono)' }}>{faults.floorFriction.toFixed(2)}</strong>
          </div>
          <input
            type="range"
            min={0.15}
            max={1.2}
            step={0.05}
            value={faults.floorFriction}
            onChange={(e) => updateFault({ floorFriction: Number(e.target.value) })}
          />
        </div>
      </div>
    </div>
  );
}
