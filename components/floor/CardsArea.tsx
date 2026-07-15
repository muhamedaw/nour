"use client";

import { useEffect, useMemo, useState } from "react";
import { getAreaConfig } from "@/lib/config";
import type { AreaConfig, GroupSession } from "@/lib/types";
import { fetchAreasConfig, fetchSessions } from "./api-client";
import FloorHeader from "./FloorHeader";
import FloorTableButton from "./FloorTableButton";

const POLL_MS = 5_000;
const STATIC_CFG = getAreaConfig("cards");

/** Cards floor (rate=null → product-only). Same polling as the timed floors. */
export default function CardsArea() {
  const [cfg, setCfg] = useState<AreaConfig>(STATIC_CFG);
  const { tableCount, hourlyRate, label } = cfg;
  const [open, setOpen] = useState<GroupSession[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [list, settings] = await Promise.all([
        fetchSessions({ area: "cards", status: "open" }),
        fetchAreasConfig(),
      ]);
      if (cancelled) return;
      if (list === null) {
        setLoadStatus("error");
      } else {
        setOpen(list);
        setLoadStatus("ok");
      }
      const match = settings?.find((a) => a.area === "cards");
      if (match) setCfg(match);
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const openByTable = useMemo(
    () => new Map(open.map((g) => [g.tableNumber, g])),
    [open],
  );

  return (
    <section
      aria-label="Cards floor"
      className="bg-espresso-950/60 border border-espresso-800 rounded-3xl p-5 md:p-6"
    >
      <FloorHeader
        area="cards"
        openCount={open.length}
        tableCount={tableCount}
        hourlyRate={hourlyRate}
        areaLabel={label}
        loadStatus={loadStatus}
      />
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4">
        {Array.from({ length: tableCount }, (_, i) => i + 1).map((t) => {
          const g = openByTable.get(t);
          return (
            <FloorTableButton
              key={t}
              area="cards"
              tableNumber={t}
              busy={!!g}
              openedAt={g?.openedAt}
              label={g?.label}
            />
          );
        })}
      </div>
    </section>
  );
}
