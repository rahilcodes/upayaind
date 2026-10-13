import { CardSkeleton, HeaderSkeleton, LoadingPage, StatsSkeleton, TableSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={2} />
      <StatsSkeleton count={4} className="mb-6" />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <CardSkeleton lines={6} />
          <TableSkeleton rows={5} cols={4} />
        </div>
        <div className="space-y-6">
          <CardSkeleton lines={4} />
          <CardSkeleton lines={3} />
        </div>
      </div>
    </LoadingPage>
  );
}
