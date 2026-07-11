import { NextRequest, NextResponse } from "next/server";
import { getSessionById, replaceSessionItemsAndLabel } from "@/lib/db";
import type { SessionItem } from "@/lib/types";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = getSessionById(params.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(session);
}

/**
 * Bulk sync used by the session-detail UI: it holds `items`/`label` as local
 * state and debounces a single PATCH with the full items array, rather than
 * calling the granular add/remove-item endpoints one at a time.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const { items, label } = body as { items?: SessionItem[]; label?: string };

  const updated = replaceSessionItemsAndLabel(params.id, items, label);
  if (!updated) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(updated);
}
