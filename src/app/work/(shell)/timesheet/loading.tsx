import { HeaderSkeleton, LoadingPage, StatsSkeleton, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={1} />
      <StatsSkeleton count={4} className="mb-6" />
      <TableSkeleton rows={10} cols={6} />
    </LoadingPage>
  );
}
