import { HeaderSkeleton, ListSkeleton, LoadingPage } from "@/components/portal/page-skeletons";

export default function Loading() {
  return (
    <LoadingPage>
      <HeaderSkeleton actions={0} />
      <ListSkeleton rows={6} avatar />
    </LoadingPage>
  );
}
