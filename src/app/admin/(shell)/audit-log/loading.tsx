import { FiltersSkeleton, HeaderSkeleton, LoadingPage, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={1} />
      <FiltersSkeleton count={3} />
      <TableSkeleton rows={10} cols={5} />
    </LoadingPage>
  );
}
