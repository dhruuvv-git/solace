import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { ProfileSnapshot, SourceInfo } from '../shared/messaging';
import { DEFAULT_SETTINGS, getSettings, onSettingsChanged, saveSettings, type Settings } from '../shared/settings';

export type View = 'overview' | 'real' | 'kind' | 'identity' | 'safety' | 'locker' | 'game' | 'settings';

export const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'real', label: 'Is It Real?', icon: 'real' },
  { id: 'kind', label: 'Is It Kind?', icon: 'kind' },
  { id: 'identity', label: 'Is It Really Them?', icon: 'identity' },
  { id: 'safety', label: 'Am I Safe?', icon: 'safety' },
  { id: 'locker', label: 'Evidence Locker', icon: 'locker' },
  { id: 'game', label: 'Train Your Eye', icon: 'game' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export type Incoming =
  | { view: 'real'; image?: { bytes: Uint8Array; name: string }; text?: string; error?: string; source?: SourceInfo }
  | { view: 'kind'; text: string; source?: SourceInfo }
  | { view: 'safety'; text: string; source?: SourceInfo }
  | { view: 'identity'; profile: ProfileSnapshot; imageBytes?: Uint8Array; imageError?: string; source?: SourceInfo }
  | { view: 'locker'; highlightId?: string };

interface Ctx {
  mode: 'extension' | 'landing';
  view: View;
  go: (v: View, incoming?: Incoming) => void;
  incoming: Incoming | null;
  takeIncoming: <V extends Incoming['view']>(v: V) => Extract<Incoming, { view: V }> | null;
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  refreshKey: number;
  bump: () => void;
}

const AppCtx = createContext<Ctx | null>(null);
export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ mode, children }: { mode: Ctx['mode']; children: ReactNode }) {
  const [view, setView] = useState<View>('overview');
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [refreshKey, setRefresh] = useState(0);

  useEffect(() => {
    getSettings().then(setSettings);
    return onSettingsChanged(setSettings);
  }, []);

  const go = useCallback((v: View, inc?: Incoming) => {
    if (inc) setIncoming(inc);
    setView(v);
    window.scrollTo?.({ top: 0 });
  }, []);

  const takeIncoming = useCallback(<V extends Incoming['view']>(v: V) => {
    if (incoming && incoming.view === v) {
      const x = incoming as Extract<Incoming, { view: V }>;
      setIncoming(null);
      return x;
    }
    return null;
  }, [incoming]);

  const updateSettings = useCallback(async (p: Partial<Settings>) => { setSettings(await saveSettings(p)); }, []);
  const bump = useCallback(() => setRefresh((n) => n + 1), []);

  return <AppCtx.Provider value={{ mode, view, go, incoming, takeIncoming, settings, updateSettings, refreshKey, bump }}>{children}</AppCtx.Provider>;
}
