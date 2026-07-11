import { NextRequest, NextResponse } from "next/server";
import { addSessionItem, getSessionById } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSessionById(params.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const body = await req.json();
  const { productId, qty } = body as { productId: string; qty?: number };
  if (!productId) {
    return NextResponse.json({ error: "productId is required" }, { status: 400 });
  }

  try {
    const updated = addSessionItem(params.id, productId, qty ?? 1);
    return NextResponse.json(updated, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
