import { useCallback, useEffect, useState } from 'react';
import type React from 'react';
import { App } from './App';
import type { StudioViewMode } from './components/Toolbar';
import { LandingPage, type LaunchStudioOptions } from './landing/LandingPage';

interface AppRouteState {
  view: 'landing' | 'app';
  presetId?: string;
  mode?: StudioViewMode;
  launchKey: number;
}

function parseHashRoute(hash: string): Omit<AppRouteState, 'launchKey'> {
  if (!hash.startsWith('#app')) {
    return { view: 'landing' };
  }
  const queryIdx = hash.indexOf('?');
  if (queryIdx < 0) {
    return { view: 'app' };
  }
  const params = new URLSearchParams(hash.slice(queryIdx + 1));
  const presetId = params.get('preset') ?? undefined;
  const rawMode = params.get('mode');
  const mode: StudioViewMode | undefined =
    rawMode === 'arena' || rawMode === 'workbench' ? rawMode : undefined;
  return { view: 'app', presetId, mode };
}

/**
 * Top-level client router switching cleanly between the RoboForge Studio landing page (`/`)
 * and the full 3D Workbench & Arena application (`/#app`).
 */
export function RootRouter(): React.ReactElement {
  const [route, setRoute] = useState<AppRouteState>(() => ({
    ...parseHashRoute(window.location.hash),
    launchKey: 0,
  }));

  useEffect(() => {
    const syncFromUrl = () => {
      const next = parseHashRoute(window.location.hash);
      setRoute((prev) => ({
        ...next,
        launchKey: prev.launchKey + 1,
      }));
      if (next.view === 'landing') {
        window.scrollTo({ top: 0 });
      }
    };
    window.addEventListener('hashchange', syncFromUrl);
    window.addEventListener('popstate', syncFromUrl);
    return () => {
      window.removeEventListener('hashchange', syncFromUrl);
      window.removeEventListener('popstate', syncFromUrl);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [route.view, route.launchKey]);

  const handleLaunchStudio = useCallback((opts?: LaunchStudioOptions) => {
    const params = new URLSearchParams();
    if (opts?.presetId) params.set('preset', opts.presetId);
    if (opts?.mode) params.set('mode', opts.mode);
    const qs = params.toString();
    const targetHash = qs ? `#app?${qs}` : '#app';
    if (window.location.hash !== targetHash) {
      window.history.pushState(null, '', targetHash);
    }
    window.scrollTo({ top: 0, left: 0 });
    setRoute((prev) => ({
      view: 'app',
      presetId: opts?.presetId,
      mode: opts?.mode,
      launchKey: prev.launchKey + 1,
    }));
  }, []);

  const handleOpenHome = useCallback(() => {
    if (window.location.hash) {
      window.history.pushState(null, '', window.location.pathname + window.location.search);
    }
    setRoute((prev) => ({
      view: 'landing',
      launchKey: prev.launchKey + 1,
    }));
    window.scrollTo({ top: 0 });
  }, []);

  if (route.view === 'app') {
    return (
      <App
        key={route.launchKey}
        initialPresetId={route.presetId}
        initialMode={route.mode}
        onOpenHome={handleOpenHome}
      />
    );
  }

  return <LandingPage onLaunchStudio={handleLaunchStudio} />;
}
