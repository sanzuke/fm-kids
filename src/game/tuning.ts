// Tunable values, editable live from the Tune panel (public/tuning.json).
// The game reads the current value every time one is used, so a change from
// the panel applies at once without restarting. English is the fallback key;
// defaults match the numbers the game was balanced with.
export interface Tunable {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
}

export const TUNABLES: Tunable[] = [
  { id: 'match.duration', label: 'Durasi pertandingan (detik)', value: 180, min: 90, max: 360, step: 10 },
  { id: 'match.playerSpeed', label: 'Kecepatan pemain', value: 1, min: 0.5, max: 2, step: 0.05 },
  { id: 'match.shootChance', label: 'Seringnya menembak', value: 1, min: 0.2, max: 3, step: 0.05 },
  { id: 'match.keeperSkill', label: 'Kemampuan kiper', value: 0.56, min: 0.2, max: 0.9, step: 0.02 },
  { id: 'match.yellowCard', label: 'Frekuensi kartu kuning', value: 1, min: 0, max: 5, step: 0.1 },
  { id: 'match.redCard', label: 'Frekuensi kartu merah', value: 1, min: 0, max: 5, step: 0.1 },
  { id: 'match.injuryRisk', label: 'Risiko cedera', value: 1, min: 0, max: 5, step: 0.1 },
  { id: 'training.weeklyProgress', label: 'Kemajuan latihan per pekan', value: 7, min: 2, max: 20, step: 1 },
  { id: 'academy.growthChance', label: 'Kemajuan akademi', value: 0.14, min: 0, max: 0.5, step: 0.02 },
  { id: 'reward.winCoins', label: 'Hadiah kemenangan (koin)', value: 120, min: 20, max: 500, step: 10 },
];

const values: Record<string, number> = Object.fromEntries(TUNABLES.map((t) => [t.id, t.value]));

/** Current value of a tunable (falls back to the built-in default). */
export const tv = (id: string): number => values[id] ?? 0;

/** Set a value from code (used by headless tests; the Tune panel uses the browser hook). */
export function setTuning(id: string, v: number) {
  if (id in values) values[id] = v;
}

// Tune panel hook: defined as soon as the module loads in a browser, so the panel
// can connect even before (or without) the tuning.json fetch finishing.
if (typeof window !== 'undefined') {
  (window as unknown as { __OHMYGAME_TUNING__: { set: (id: string, v: number) => void } }).__OHMYGAME_TUNING__ = {
    set(id: string, v: number) {
      if (id in values) values[id] = v;
    },
  };
}

/** Fetch the saved tuning file. Fire-and-forget: the game keeps its defaults if it fails. */
export async function loadTuning() {
  try {
    const res = await fetch('tuning.json');
    if (!res.ok) return;
    const file = await res.json();
    for (const item of file.values ?? []) {
      if (typeof item.value === 'number' && item.id in values) values[item.id] = item.value;
    }
  } catch {
    // headless test or blocked file: the defaults keep the game playable
  }
}
