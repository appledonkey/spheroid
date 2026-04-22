import { useEffect, useState } from 'react';
import type { Settings } from '../types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settings';

export type UpdateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => void;

export function useSettings(): [Settings, UpdateSetting] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSetting: UpdateSetting = (key, value) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  };

  return [settings, updateSetting];
}
