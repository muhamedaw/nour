import EndOfDayReport from "@/components/dashboard/EndOfDayReport";

export const metadata = {
  title: "تقرير نهاية اليوم | Coffee Shop",
};

export default function ReportPage() {
  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto">
      <EndOfDayReport />
    </main>
  );
}
