import { FiltersSkeleton, HeaderSkeleton, LoadingPage, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={2} />
      <FiltersSkeleton count={3} />
      <TableSkeleton rows={12} cols={7} />
    </LoadingPage>
  );
}
