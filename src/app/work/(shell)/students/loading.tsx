import { FiltersSkeleton, HeaderSkeleton, LoadingPage, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={0} />
      <FiltersSkeleton count={2} />
      <TableSkeleton rows={8} cols={6} />
    </LoadingPage>
  );
}
