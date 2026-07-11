"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getAreaConfig } from "@/lib/config";
import type { AreaType, GroupSession } from "@/lib/types";
import TimedSessionView from "@/components/session/TimedSessionView";
import ProductOnlySessionView from "@/components/session/ProductOnlySessionView";
import { viewItems } from "@/components/domain";
import { fetchSessions, openSessionRemote } from "@/components/floor/api-client";

const ALLOWED: AreaType[] = ["snooker", "cards", "playstation"];

/** Decoder for `${area}-${tableNumber}`. */
function decodeId(
  raw: string,
): { area: AreaType; tableNumber: number } | null {
  const idx = raw.lastIndexOf("-");
  if (idx <= 0 || idx >= raw.length - 1) return null;
  const area = raw.slice(0, idx) as AreaType;
  const tableNumber = Number(raw.slice(idx + 1));
  if (!ALLOWED.includes(area)) return null;
  if (!Number.isInteger(tableNumber) || tableNumber < 1) return null;
  return { area, tableNumber };
}

type Status =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; session: GroupSession };

export default function TablePage() {
  const params = useParams<{ id: string }>();
  const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id ?? "";
  const decoded = useMemo(() => decodeId(rawId), [rawId]);
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    if (!decoded) {
      setStatus({ kind: "error", message: "معرّف طاولة غير صالح." });
      return;
    }
    let cancelled = false;
    setStatus({ kind: "loading" });

    (async () => {
      // 1) Look for an existing open session on this table.
      const list = await fetchSessions({
        area: decoded.area,
        status: "open",
      });
      if (cancelled) return;
      if (list !== null) {
        const existing = list.find(
          (g) => g.tableNumber === decoded.tableNumber,
        );
        if (existing) {
          setStatus({ kind: "ready", session: existing });
          return;
        }
        // 2) Otherwise, ask the API to open a new one.
        const created = await openSessionRemote(
          decoded.area,
          decoded.tableNumber,
        );
        if (cancelled) return;
        if (created) {
          setStatus({ kind: "ready", session: created });
          return;
        }
      }
      // Fall-through: either the listing call failed, or the open POST failed.
      // Try once more — maybe the listing endpoint is flaky but open works.
      if (!cancelled) {
        const created = await openSessionRemote(
          decoded.area,
          decoded.tableNumber,
        );
        if (cancelled) return;
        if (created) {
          setStatus({ kind: "ready", session: created });
          return;
        }
        setStatus({
          kind: "error",
          message: "تعذّر فتح الجلسة. تأكّد من الاتصال وحاول مرة أخرى.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [decoded]);

  if (!decoded) {
    return <ErrorScreen message="معرّف طاولة غير صالح." />;
  }
  const { area, tableNumber } = decoded;
  const cfg = getAreaConfig(area);
  const { tableCount, hourlyRate, label: areaLabel } = cfg;

  if (tableNumber > tableCount) {
    return (
      <ErrorScreen
        message={`لا توجد طاولة رقم ${tableNumber} في ${areaLabel}.`}
      />
    );
  }

  if (status.kind === "loading") {
    return (
      <main className="p-8 text-center" dir="rtl">
        <p className="text-2xl text-emerald-400 animate-pulse">
          جاري فتح الجلسة…
        </p>
      </main>
    );
  }
  if (status.kind === "error") {
    return <ErrorScreen message={status.message} />;
  }

  const session = status.session;
  const initialItems = viewItems(session);
  const initialLabel = session.label ?? "";

  if (hourlyRate === null) {
    return (
      <ProductOnlySessionView
        sessionId={session.id}
        area={area}
        tableNumber={tableNumber}
        openedAt={session.openedAt}
        initialItems={initialItems}
        initialLabel={initialLabel}
      />
    );
  }
  return (
    <TimedSessionView
      sessionId={session.id}
      area={area}
      tableNumber={tableNumber}
      openedAt={session.openedAt}
      hourlyRate={hourlyRate}
      initialItems={initialItems}
      initialLabel={initialLabel}
    />
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="p-8 text-center flex flex-col gap-4" dir="rtl">
      <p className="text-2xl text-red-400">{message}</p>
      <Link
        href="/"
        className="text-emerald-400 hover:text-emerald-300 inline-block"
      >
        ← رجوع للأرضية
      </Link>
    </main>
  );
}
