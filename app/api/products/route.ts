import { NextRequest, NextResponse } from "next/server";
import { createProduct, deleteProduct, listCategories, listProducts, updateProduct } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ categories: listCategories(), products: listProducts() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { categoryId, name, price } = body as { categoryId: string; name: string; price: number };
  if (!categoryId || !name || typeof price !== "number") {
    return NextResponse.json({ error: "categoryId, name and price are required" }, { status: 400 });
  }
  const product = createProduct(categoryId, name, price);
  return NextResponse.json(product, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, price, categoryId } = body as {
    id: string;
    name?: string;
    price?: number;
    categoryId?: string;
  };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = updateProduct(id, { name, price, categoryId });
  if (!updated) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const { id } = body as { id: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  deleteProduct(id);
  return NextResponse.json({ ok: true });
}
