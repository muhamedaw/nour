export type AreaType = "snooker" | "cards" | "playstation";

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
}

export interface SessionItem {
  productId: string;
  name: string; // snapshot at time of add, survives later price edits
  price: number; // snapshot
  qty: number;
}

export interface GroupSession {
  id: string;
  area: AreaType;
  tableNumber: number;
  label?: string; // optional customer name override
  openedAt: string; // ISO timestamp
  closedAt?: string;
  status: "open" | "closed";
  items: SessionItem[];
  billedTotal?: number; // set on close
  mergedInto?: string; // set when this session was merged into another (closed, billedTotal=0)
}

export interface AreaConfig {
  area: AreaType;
  label: string;
  tableCount: number;
  hourlyRate: number | null; // null = no time-based billing (Cards)
}
