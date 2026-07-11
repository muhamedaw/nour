import { create } from "zustand";
import { AreaType, GroupSession } from "./types";

interface FloorStore {
  openGroups: GroupSession[];
  openSession: (area: AreaType, tableNumber: number) => void;
  closeSession: (id: string) => void;
  getOpenCountByArea: (area: AreaType) => number;
}

export const useFloorStore = create<FloorStore>((set, get) => ({
  openGroups: [],

  openSession: (area, tableNumber) =>
    set((state) => ({
      openGroups: [
        ...state.openGroups,
        {
          id: crypto.randomUUID(),
          area,
          tableNumber,
          openedAt: new Date().toISOString(),
          status: "open",
        },
      ],
    })),

  closeSession: (id) =>
    set((state) => ({
      openGroups: state.openGroups.filter((g) => g.id !== id),
    })),

  getOpenCountByArea: (area) =>
    get().openGroups.filter((g) => g.area === area && g.status === "open").length,
}));
