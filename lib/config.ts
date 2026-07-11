import { AreaConfig } from "./types";

const SNOOKER_TABLE_COUNT = 15;
const CARDS_TABLE_COUNT = 6;
const PLAYSTATION_TABLE_COUNT = 4;

export const AREA_CONFIG: AreaConfig[] = [
  { area: "snooker", label: "Snooker", tableCount: SNOOKER_TABLE_COUNT },
  { area: "cards", label: "Cards", tableCount: CARDS_TABLE_COUNT },
  { area: "playstation", label: "PlayStation", tableCount: PLAYSTATION_TABLE_COUNT },
];

export function getAreaConfig(area: AreaConfig["area"]): AreaConfig {
  const config = AREA_CONFIG.find((c) => c.area === area);
  if (!config) throw new Error(`No config found for area: ${area}`);
  return config;
}
