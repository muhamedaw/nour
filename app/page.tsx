import SnookerArea from "@/components/SnookerArea";
import CardsArea from "@/components/CardsArea";
import PlaystationArea from "@/components/PlaystationArea";

export default function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-6">Coffee Shop Floor</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SnookerArea />
        <CardsArea />
        <PlaystationArea />
      </div>
    </main>
  );
}
