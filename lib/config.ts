import { AreaConfig, Category, Product } from "./types";

const SNOOKER_TABLE_COUNT = 15;
const CARDS_TABLE_COUNT = 6;
const PLAYSTATION_TABLE_COUNT = 4;

export const AREA_CONFIG: AreaConfig[] = [
  { area: "snooker", label: "Snooker", tableCount: SNOOKER_TABLE_COUNT, hourlyRate: 10 },
  { area: "cards", label: "Cards", tableCount: CARDS_TABLE_COUNT, hourlyRate: null },
  { area: "playstation", label: "PlayStation", tableCount: PLAYSTATION_TABLE_COUNT, hourlyRate: 8 },
];

export function getAreaConfig(area: AreaConfig["area"]): AreaConfig {
  const config = AREA_CONFIG.find((c) => c.area === area);
  if (!config) throw new Error(`No config found for area: ${area}`);
  return config;
}

export const SEED_CATEGORIES: Category[] = [
  { id: "cat-drinks", name: "Drinks", order: 1 },
  { id: "cat-snacks", name: "Snacks", order: 2 },
  { id: "cat-extras", name: "Extras", order: 3 },
];

export const SEED_PRODUCTS: Product[] = [
  { id: "prod-coffee", categoryId: "cat-drinks", name: "Coffee", price: 2.5 },
  { id: "prod-tea", categoryId: "cat-drinks", name: "Tea", price: 2 },
  { id: "prod-water", categoryId: "cat-drinks", name: "Water", price: 1 },
  { id: "prod-soda", categoryId: "cat-drinks", name: "Soda", price: 2 },
  { id: "prod-chips", categoryId: "cat-snacks", name: "Chips", price: 1.5 },
  { id: "prod-sandwich", categoryId: "cat-snacks", name: "Sandwich", price: 4 },
  { id: "prod-chocolate", categoryId: "cat-snacks", name: "Chocolate Bar", price: 1.5 },
  { id: "prod-shisha", categoryId: "cat-extras", name: "Shisha", price: 6 },
  { id: "prod-cards-deck", categoryId: "cat-extras", name: "New Card Deck", price: 3 },
];
