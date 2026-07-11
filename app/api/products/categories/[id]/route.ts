import { NextRequest, NextResponse } from "next/server";
import { deleteCategory } from "@/lib/db";

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  deleteCategory(params.id);
  return new NextResponse(null, { status: 204 });
}
