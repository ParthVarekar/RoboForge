import { useEffect, useState } from 'react';
import type React from 'react';
import { ArrowRight } from 'lucide-react';
import { ArenaWorldsShowcase } from './ArenaWorldsShowcase';
import { CircuitGuardDemo } from './CircuitGuardDemo';
import { HardwareLedgerSection } from './HardwareLedgerSection';
import { HeroBenchStage, type HeroPresetKey } from './HeroBenchStage';
import { RealityGapInteractive } from './RealityGapInteractive';
import './landing.css';

export interface LaunchStudioOptions {
  presetId?: string;
  mode?: 'workbench' | 'arena';
}

export interface LandingPageProps {
  onLaunchStudio: (opts?: LaunchStudioOptions) => void;
}

/**
 * RoboForge Studio public landing page tailored to precision hardware engineering:
 * live interactive 3D workbench hero stage, real netlist fault checker, customizable
 * 3D arena showcase, interactive reality-gap simulator, and hardware build ledger.
 */
export function LandingPage({ onLaunchStudio }: LandingPageProps): React.ReactElement {
  const [scrolled, setScrolled] = useState(false);
  const [heroPreset, setHeroPreset] = useState<HeroPresetKey>('roboforge_rover');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="lp-root">
      {/* Single-line borderless top bar bleeding cleanly over y = 0 */}
      <header className={`lp-header${scrolled ? ' scrolled' : ''}`}>
        <div className="lp-header-inner">
          <a href="#top" className="lp-brand">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" fill="#0b7a72" />
              <rect x="6.5" y="7" width="11" height="9" rx="1.5" stroke="#ffffff" strokeWidth="1.8" />
              <circle cx="10" cy="11.5" r="1.2" fill="#ffffff" />
              <circle cx="14" cy="11.5" r="1.2" fill="#ffffff" />
              <path d="M9 19v-3M15 19v-3M9 7V4.5M15 7V4.5" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>RoboForge</span>
          </a>

          <nav className="lp-nav" aria-label="Primary navigation">
            <a href="#workbench">Workbench</a>
            <a href="#wiring">Circuit checks</a>
            <a href="#arenas">Arenas</a>
            <a href="#hardware">Hardware</a>
          </nav>

          <button
            type="button"
            className="lp-cta lp-cta-nav"
            onClick={() => onLaunchStudio({ presetId: heroPreset, mode: 'workbench' })}
          >
            Open Studio
          </button>
        </div>
      </header>

      <main id="top">
        {/* Opening Screen: Monumental Centered Display Headline + Live Interactive 3D Hardware Stage */}
        <section id="workbench" className="lp-hero">
          <div className="lp-hero-inner">
            <h1 className="lp-h1">Wire, code, and fly real hardware in one bench.</h1>
            <p className="lp-hero-copy">
              Assemble pin-accurate ESP32 rovers and freestyle quadcopters, verify circuits before smoke happens,
              and test autonomous code in customizable 3D arenas.
            </p>
            <div className="lp-hero-action">
              <button
                type="button"
                className="lp-cta"
                onClick={() => onLaunchStudio({ presetId: heroPreset, mode: 'workbench' })}
              >
                Launch 3D Studio
                <ArrowRight size={18} />
              </button>
            </div>

            <HeroBenchStage activePreset={heroPreset} onSelectPreset={setHeroPreset} />
          </div>
        </section>

        {/* Section 2: Interactive Netlist & Circuit Fault Checker on Deep Carbon */}
        <CircuitGuardDemo onOpenFaultLab={() => onLaunchStudio({ presetId: 'fault_lab', mode: 'workbench' })} />

        {/* Section 3: Customizable 3D Arena Worlds & Drone Space Showcase */}
        <ArenaWorldsShowcase
          onLaunchPreset={(presetId, mode) => onLaunchStudio({ presetId, mode })}
        />

        {/* Section 4: Interactive Reality-Gap & Heading-Hold Simulator */}
        <RealityGapInteractive
          onLaunchRoomMapper={() => onLaunchStudio({ presetId: 'room_mapper', mode: 'arena' })}
        />

        {/* Section 5: Hardware Build Ledger & Macro Studio Photography */}
        <HardwareLedgerSection onOpenStudio={() => onLaunchStudio({ presetId: 'roboforge_rover', mode: 'workbench' })} />

        {/* Section 6: Closing Architectural Band */}
        <section className="lp-closing">
          <div className="lp-closing-inner">
            <h2 className="lp-h2">Build your next robot before buying a part.</h2>
            <p className="lp-body">
              Start from the wired 2WD ESP32 rover, the 5-inch freestyle quadcopter, the OLED display lab, or a
              blank drafting bench.
            </p>
            <button
              type="button"
              className="lp-cta lp-cta-dark"
              onClick={() => onLaunchStudio({ presetId: 'roboforge_rover', mode: 'workbench' })}
            >
              Launch 3D Studio
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <span>
            RoboForge Studio runs circuits, sketches, and 3D physics in simulation. Verify continuity and polarity
            physically before applying battery power.
          </span>
          <div className="lp-footer-links">
            <button type="button" onClick={() => onLaunchStudio({ presetId: 'roboforge_rover', mode: 'workbench' })}>
              2WD Rover
            </button>
            <button type="button" onClick={() => onLaunchStudio({ presetId: 'room_mapper', mode: 'arena' })}>
              Room Mapper
            </button>
            <button type="button" onClick={() => onLaunchStudio({ presetId: 'quad_5in', mode: 'arena' })}>
              Pine Forest Quad
            </button>
            <button type="button" onClick={() => onLaunchStudio({ presetId: 'display_lab', mode: 'workbench' })}>
              Display Lab
            </button>
            <button type="button" onClick={() => onLaunchStudio({ presetId: 'fault_lab', mode: 'workbench' })}>
              Fault Lab
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
