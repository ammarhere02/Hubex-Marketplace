import { GridSkeleton } from "@/app/_components/skeletons";

export default function Loading() {
  return (
    <div className="container">
      <div className="mm-skel mm-skel-line mb-4" style={{ width: 320, height: 30 }} />
      <GridSkeleton />
    </div>
  );
}
