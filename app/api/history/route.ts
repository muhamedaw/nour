import { NextRequest, NextResponse } from "next/server";
import { listHistory } from "@/lib/db";
import { AreaType } from "@/lib/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const area = searchParams.get("area") as AreaType | null;
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const history = listHistory({
    area: area ?? undefined,
    from: from ?? undefined,
    to: to ?? undefined,
  });
  return NextResponse.json(history);
}
