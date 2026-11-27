import { useState } from 'react';
import type React from 'react';
import { ArrowRight } from 'lucide-react';

type WorldShowcaseId = 'forest' | 'slam' | 'builder' | 'hardware';

interface WorldSlide {
  id: WorldShowcaseId;
  label: string;
  imageSrc: string;
  imageAlt: string;
  heading: string;
  description: string;
  launchPreset: string;
  launchMode: 'workbench' | 'arena';
  ctaLabel: string;
}

const WORLD_SLIDES: WorldSlide[] = [
  {
    id: 'forest',
    label: 'Pine forest',
    imageSrc: '/landing/forest-drone.jpg',
    imageAlt:
      'Carbon-fiber 5-inch freestyle quadcopter banking through a glowing teal FPV racing gate in a sunlit pine forest',
    heading: 'Fly a 5-inch quadcopter through pine trees and open gates',
    description:
      'Switch to the 18 by 18 meter woodland clearing with 23 multi-tier conifer trees, boulders, open-center fly-through FPV archway colliders, altitude controls, and a live first-person camera feed.',
    launchPreset: 'quad_5in',
    launchMode: 'arena',
    ctaLabel: 'Open Pine Forest Arena',
  },
  {
    id: 'slam',
    label: 'Indoor SLAM lab',
    imageSrc: '/landing/03_room_mapper_live_arena.webp',
    imageAlt:
      '2WD rover mapping an enclosed 3D arena room with live ultrasonic scan points and a synchronized 2D occupancy map',
    heading: 'Map a room automatically with zero obstacle hits',
    description:
      'Run the built-in 360 degree ultrasonic and gyro explorer inside the 4 by 6.4 meter robotics lab while watching orange 3D scan points and the 2D occupancy grid fill in live.',
    launchPreset: 'room_mapper',
    launchMode: 'arena',
    ctaLabel: 'Open Room Mapper',
  },
  {
    id: 'builder',
    label: 'Custom wall builder',
    imageSrc: '/landing/05_custom_arena_builder.webp',
    imageAlt:
      'Custom 14 by 12 meter sandbox arena with a drawn partition wall, pine tree, racing gate, and boulders with 3D drag gizmo',
    heading: 'Draw partition walls and reshape the room to fit your test',
    description:
      'Resize floor width and length up to 26 meters, draw angled walls by clicking two corners on the floor, and drop trees, gates, crates, cylinders, or boulders anywhere with live drag handles.',
    launchPreset: 'quad_5in',
    launchMode: 'arena',
    ctaLabel: 'Open Arena Builder',
  },
  {
    id: 'hardware',
    label: 'Wiring workbench',
    imageSrc: '/landing/01b_rover_closeup_wiring.webp',
    imageAlt:
      'Close-up 3D workbench view of ESP32 silkscreen, DRV8833 driver, hourglass resistors, and flat orthogonal wire harness bundles',
    heading: 'Lay flat harness bundles across 26 detailed 3D components',
    description:
      'Route wires automatically around PCB silhouettes in parallel 2.54 mm lanes with hop-overs, square DuPont housings, soldered heat-shrink splices, or click the deck to place custom tie points by hand.',
    launchPreset: 'roboforge_rover',
    launchMode: 'workbench',
    ctaLabel: 'Open 3D Workbench',
  },
];

export interface ArenaWorldsShowcaseProps {
  onLaunchPreset: (presetId: string, mode: 'workbench' | 'arena') => void;
}

/**
 * Full-width interactive visual showcase letting visitors step through the customizable
 * 3D Arena worlds and the high-detail wiring workbench before opening the studio.
 */
export function ArenaWorldsShowcase({ onLaunchPreset }: ArenaWorldsShowcaseProps): React.ReactElement {
  const [activeId, setActiveId] = useState<WorldShowcaseId>('forest');
  const active = WORLD_SLIDES.find((s) => s.id === activeId) ?? WORLD_SLIDES[0]!;

  return (
    <section id="arenas" className="lp-section lp-section-paper">
      <div className="lp-container">
        <div className="lp-arena-header">
          <div>
            <h2 className="lp-h2">Shape any room, maze, or pine forest</h2>
            <p className="lp-body">
              Test ground rovers and flying quadcopters inside five ready-made environments, or draw walls and
              place obstacles from scratch.
            </p>
          </div>

          <div className="lp-segmented" role="tablist" aria-label="Choose arena showcase view">
            {WORLD_SLIDES.map((slide) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={activeId === slide.id}
                className="lp-seg-tab"
                onClick={() => setActiveId(slide.id)}
              >
                {slide.label}
              </button>
            ))}
          </div>
        </div>

        <div className="lp-media-stage">
          <img src={active.imageSrc} alt={active.imageAlt} />
        </div>

        <div className="lp-arena-meta">
          <div>
            <h3 className="lp-h3">{active.heading}</h3>
            <p className="lp-body">{active.description}</p>
          </div>
          <button
            type="button"
            className="lp-cta"
            onClick={() => onLaunchPreset(active.launchPreset, active.launchMode)}
          >
            {active.ctaLabel}
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
