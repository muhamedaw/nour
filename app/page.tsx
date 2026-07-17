import SnookerArea from "@/components/floor/SnookerArea";
import CardsArea from "@/components/floor/CardsArea";
import PlaystationArea from "@/components/floor/PlaystationArea";

// OTA test marker — no behavior change, forces a fresh build/version for
// verifying the update-check pipeline end-to-end on a real device.

export default function Home() {
  return (
    <main className="p-4 md:p-6 max-w-7xl mx-auto flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight text-espresso-50">
          شاشة الأرضية
        </h1>
        <p className="text-espresso-300">
          اضغط على أي طاوية لفتح أو إكمال الجلسة.
        </p>
      </header>
      <SnookerArea />
      <CardsArea />
      <PlaystationArea />
    </main>
  );
}
