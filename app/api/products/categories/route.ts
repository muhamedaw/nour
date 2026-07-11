import { NextRequest, NextResponse } from "next/server";
import { createCategory } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, order } = body as { name: string; order: number };
  if (!name || typeof order !== "number") {
    return NextResponse.json({ error: "name and order are required" }, { status: 400 });
  }
  const category = createCategory(name, order);
  return NextResponse.json(category, { status: 201 });
}
