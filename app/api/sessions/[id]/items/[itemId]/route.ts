import { NextRequest, NextResponse } from "next/server";
import { deleteSessionItem, getSessionById, updateSessionItemQty } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = getSessionById(params.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const body = await req.json();
  const { qty } = body as { qty: number };
  if (typeof qty !== "number") {
    return NextResponse.json({ error: "qty is required" }, { status: 400 });
  }

  const updated = updateSessionItemQty(params.id, params.itemId, qty);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  const session = getSessionById(params.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const updated = deleteSessionItem(params.id, params.itemId);
  return NextResponse.json(updated);
}
