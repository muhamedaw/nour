import { NextRequest, NextResponse } from "next/server";
import { closeSession, getSessionById } from "@/lib/db";
import { computeBill } from "@/lib/billing";
import { getAreaConfig } from "@/lib/config";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionById(params.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "closed") {
    return NextResponse.json({ error: "Session already closed" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const closedAt = body?.closedAt ? new Date(body.closedAt) : new Date();

  const area = getAreaConfig(session.area);
  const bill = computeBill(session, area, closedAt);
  const updated = closeSession(session.id, closedAt.toISOString(), bill.total);

  return NextResponse.json({ session: updated, bill });
}
