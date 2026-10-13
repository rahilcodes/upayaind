import { ChartSkeleton, FiltersSkeleton, HeaderSkeleton, LoadingPage, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={2} />
      <FiltersSkeleton count={3} />
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </LoadingPage>
  );
}
