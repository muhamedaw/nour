import HistoryList from "@/components/history/HistoryList";

export const metadata = {
  title: "سجل الفواتير | Coffee Shop",
};

export default function HistoryPage() {
  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold">سجل الفواتير</h1>
        <p className="text-espresso-300 mt-1">
          كل الجلسات المغلقة، قابلة للتوسيع لعرض التفاصيل.
        </p>
      </header>
      <HistoryList />
    </main>
  );
}
