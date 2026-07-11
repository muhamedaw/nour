import { NextRequest, NextResponse } from "next/server";
import { createProduct, listCategories, listProducts } from "@/lib/db";

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
