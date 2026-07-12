import DesktopTableClient from "./DesktopTableClient";
import { AREA_CONFIG } from "@/lib/config";

/**
 * Desktop `/table/[id]/` — server wrapper that pre-renders every
 * `${area}-${tableNumber}` shell via `generateStaticParams` so the
 * APK_BUILD=1 static export ships a real `out/table/<id>/index.html`
 * per table. IDs come from `lib/config.ts` (single source of truth —
 * the AREA_CONFIG the dashboard's area-settings panel can edit at
 * runtime; reflected in the next APK rebuild).
 *
 * The actual UI lives in the sibling client shell, which receives
 * the validated `id` via prop instead of `useParams()`.
 */
export function generateStaticParams() {
  const ids: Array<{ id: string }> = [];
  for (const cfg of AREA_CONFIG) {
    for (let i = 1; i <= cfg.tableCount; i++) {
      ids.push({ id: `${cfg.area}-${i}` });
    }
  }
  return ids;
}

export default function DesktopTablePage({
  params,
}: {
  params: { id: string };
}) {
  return <DesktopTableClient id={params.id} />;
}
