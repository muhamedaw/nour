export type AreaType = "snooker" | "cards" | "playstation";

export interface GroupSession {
  id: string;
  area: AreaType;
  tableNumber: number;
  openedAt: string; // ISO timestamp
  status: "open" | "closed";
}

export interface AreaConfig {
  area: AreaType;
  label: string;
  tableCount: number;
}
