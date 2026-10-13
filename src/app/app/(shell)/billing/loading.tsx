import { CardSkeleton, HeaderSkeleton, LoadingPage, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={1} />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={4} />
      </div>
      <div className="mt-6">
        <TableSkeleton rows={5} cols={5} />
      </div>
    </LoadingPage>
  );
}
