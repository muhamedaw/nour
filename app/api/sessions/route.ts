import { NextRequest, NextResponse } from "next/server";
import { createSession, listOpenSessions } from "@/lib/db";
import { AreaType } from "@/lib/types";

const VALID_AREAS: AreaType[] = ["snooker", "cards", "playstation"];

export async function GET() {
  return NextResponse.json(listOpenSessions());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { area, tableNumber } = body as { area: AreaType; tableNumber: number };

  if (!VALID_AREAS.includes(area) || typeof tableNumber !== "number") {
    return NextResponse.json({ error: "area and tableNumber are required" }, { status: 400 });
  }

  const session = createSession(area, tableNumber);
  return NextResponse.json(session, { status: 201 });
}
