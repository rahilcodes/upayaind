import { CardSkeleton, HeaderSkeleton, ListSkeleton, LoadingPage } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={1} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} lines={3} />
        ))}
      </div>
      <div className="mt-6">
        <ListSkeleton rows={5} />
      </div>
    </LoadingPage>
  );
}
