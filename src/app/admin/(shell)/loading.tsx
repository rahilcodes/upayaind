import { ChartSkeleton, HeaderSkeleton, LoadingPage, StatsSkeleton, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={0} />
      <StatsSkeleton count={4} className="mb-4" />
      <StatsSkeleton count={4} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <TableSkeleton rows={5} cols={4} />
      </div>
    </LoadingPage>
  );
}
