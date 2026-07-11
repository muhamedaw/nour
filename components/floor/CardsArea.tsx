"use client";

import { useEffect, useMemo, useState } from "react";
import { getAreaConfig } from "@/lib/config";
import type { GroupSession } from "@/lib/types";
import { fetchSessions } from "./api-client";
import FloorHeader from "./FloorHeader";
import FloorTableButton from "./FloorTableButton";

const POLL_MS = 5_000;

/** Cards floor (rate=null → product-only). Same polling as the timed floors. */
export default function CardsArea() {
  const { tableCount, hourlyRate, label } = getAreaConfig("cards");
  const [open, setOpen] = useState<GroupSession[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await fetchSessions({ area: "cards", status: "open" });
      if (cancelled) return;
      if (list === null) {
        setLoadStatus("error");
      } else {
        setOpen(list);
        setLoadStatus("ok");
      }
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
      className="bg-neutral-950/60 border border-neutral-800 rounded-3xl p-5 md:p-6"
    >
      <FloorHeader
        area="cards"
        openCount={open.length}
        tableCount={tableCount}
        hourlyRate={hourlyRate}
        areaLabel={label}
        loadStatus={loadStatus}
      />
      <div
        className="grid gap-3 md:gap-4"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        }}
      >
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
