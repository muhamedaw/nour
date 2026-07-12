import BackupRestore from "@/components/settings/BackupRestore";
import SettingsView from "@/components/settings/SettingsView";

export const metadata = {
  title: "إعدادات المناطق | Coffee Shop",
};

export default function SettingsPage() {
  return (
    <main className="p-4 md:p-6 max-w-4xl mx-auto flex flex-col gap-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold">إعدادات المناطق</h1>
        <p className="text-espresso-300 mt-1">
          تحكم في عدد الطاولات، السعر بالساعة، واسم كل منطقة (سنوكر،
          Cards، بلايستيشن).
        </p>
      </header>
      <SettingsView />
      <BackupRestore />
    </main>
  );
}
