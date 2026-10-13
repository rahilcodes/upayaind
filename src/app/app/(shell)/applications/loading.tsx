import { FiltersSkeleton, HeaderSkeleton, LoadingPage, StatsSkeleton, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={1} />
      <StatsSkeleton count={3} className="mb-6" />
      <FiltersSkeleton count={2} />
      <TableSkeleton rows={10} cols={6} />
    </LoadingPage>
  );
}
