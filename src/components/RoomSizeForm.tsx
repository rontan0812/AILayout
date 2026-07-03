"use client";

export type RoomSize = {
  widthCm: number;
  depthCm: number;
};

type RoomSizeFormProps = {
  value: RoomSize;
  onChange: (value: RoomSize) => void;
};

const MIN_CM = 1;
const MAX_CM = 5000;

export default function RoomSizeForm({ value, onChange }: RoomSizeFormProps) {
  const handleChange = (key: keyof RoomSize) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [key]: e.target.valueAsNumber });
  };

  return (
    <form className="flex items-end gap-4" onSubmit={(e) => e.preventDefault()}>
      <label className="flex flex-col gap-1 text-sm text-stone-600">
        横（cm）
        <input
          type="number"
          min={MIN_CM}
          max={MAX_CM}
          value={Number.isFinite(value.widthCm) ? value.widthCm : ""}
          onChange={handleChange("widthCm")}
          className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:border-blue-500 focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-stone-600">
        縦（cm）
        <input
          type="number"
          min={MIN_CM}
          max={MAX_CM}
          value={Number.isFinite(value.depthCm) ? value.depthCm : ""}
          onChange={handleChange("depthCm")}
          className="w-32 rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-800 focus:border-blue-500 focus:outline-none"
        />
      </label>
    </form>
  );
}
