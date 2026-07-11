import ProductManager from "@/components/products/ProductManager";

export const metadata = {
  title: "إدارة المنتجات | Coffee Shop",
};

export default function ProductsPage() {
  return (
    <main className="p-4 md:p-8 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl md:text-4xl font-extrabold">إدارة المنتجات</h1>
        <p className="text-neutral-400 mt-1">
          أضف، عدّل أسعار، أو احذف المنتجات. تتزامن التغييرات لاحقًا مع
          الـ API.
        </p>
      </header>
      <ProductManager />
    </main>
  );
}
