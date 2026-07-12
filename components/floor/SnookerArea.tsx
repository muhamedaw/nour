"use client";

import { useEffect, useMemo, useState } from "react";
import { getAreaConfig } from "@/lib/config";
import type { AreaConfig, GroupSession } from "@/lib/types";
import { fetchAreasConfig, fetchSessions } from "./api-client";
import FloorHeader from "./FloorHeader";
import FloorTableButton from "./FloorTableButton";

const POLL_MS = 5_000;
const STATIC_CFG = getAreaConfig("snooker");

/**
 * Snooker floor screen. Polls `GET /api/sessions?area=snooker&status=open`
 * every 5s — the locked team's API is the source of truth for cross-tablet
 * state. Local open/close actions go through `/api/sessions` so the next
 * poll reflects them automatically. Area settings (hourly rate) poll on the
 * same cadence so a dashboard edit shows up here without a refresh.
 */
export default function SnookerArea() {
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
        fetchSessions({ area: "snooker", status: "open" }),
        fetchAreasConfig(),
      ]);
      if (cancelled) return;
      if (list === null) {
        setLoadStatus("error");
      } else {
        setOpen(list);
        setLoadStatus("ok");
      }
      const match = settings?.find((a) => a.area === "snooker");
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
      aria-label="Snooker floor"
      className="bg-espresso-950/60 border border-espresso-800 rounded-3xl p-5 md:p-6"
    >
      <FloorHeader
        area="snooker"
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
              area="snooker"
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
