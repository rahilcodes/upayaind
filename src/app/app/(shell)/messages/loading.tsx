import { HeaderSkeleton, LoadingPage, MessagesSkeleton } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={0} />
      <MessagesSkeleton />
    </LoadingPage>
  );
}
