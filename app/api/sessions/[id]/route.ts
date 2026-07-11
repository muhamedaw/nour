import { NextResponse } from "next/server";
import { getSessionById } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = getSessionById(params.id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  return NextResponse.json(session);
}
