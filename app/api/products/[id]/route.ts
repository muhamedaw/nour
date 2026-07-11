import { NextRequest, NextResponse } from "next/server";
import { deleteProduct, updateProduct } from "@/lib/db";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const { name, price, categoryId } = body as { name?: string; price?: number; categoryId?: string };

  const updated = updateProduct(params.id, { name, price, categoryId });
  if (!updated) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  deleteProduct(params.id);
  return new NextResponse(null, { status: 204 });
}
