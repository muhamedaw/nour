"use client";

import { useEffect, useMemo, useState } from "react";
import { getAreaConfig } from "@/lib/config";
import type { GroupSession } from "@/lib/types";
import { fetchSessions } from "./api-client";
import FloorHeader from "./FloorHeader";
import FloorTableButton from "./FloorTableButton";

const POLL_MS = 5_000;

/** PlayStation floor — same polling pattern as SnookerArea (rate=8 → Timed). */
export default function PlaystationArea() {
  const { tableCount, hourlyRate, label } = getAreaConfig("playstation");
  const [open, setOpen] = useState<GroupSession[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const list = await fetchSessions({ area: "playstation", status: "open" });
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
      aria-label="PlayStation floor"
      className="bg-neutral-950/60 border border-neutral-800 rounded-3xl p-5 md:p-6"
    >
      <FloorHeader
        area="playstation"
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
              area="playstation"
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
