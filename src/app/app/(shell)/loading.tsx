import { CardSkeleton, ChartSkeleton, HeaderSkeleton, LoadingPage, StatsSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={0} />
      <StatsSkeleton count={5} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <ChartSkeleton />
        <CardSkeleton lines={5} />
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={4} />
      </div>
    </LoadingPage>
  );
}
