import DashboardView from "@/components/dashboard/DashboardView";

export const metadata = {
  title: "لوحة التحكم | Coffee Shop",
};

export default function DashboardPage() {
  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto">
      <DashboardView />
    </main>
  );
}
