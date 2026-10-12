import { useTranslations } from "next-intl";
import type { ApplicationStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";

/** Status pill colours (SPEC §13). */
export const STATUS_TONE: Record<ApplicationStatus, "blue" | "violet" | "amber" | "cyan" | "green" | "green-solid" | "red" | "grey" | "slate"> = {
  DRAFT: "grey",
  APPLIED: "blue",
  VIEWED: "violet",
  RECRUITER_REPLIED: "amber",
  ASSESSMENT: "cyan",
  INTERVIEW_SCHEDULED: "green",
  INTERVIEWING: "green",
  OFFER: "green-solid",
  HIRED: "green-solid",
  REJECTED: "red",
  NO_RESPONSE: "grey",
  WITHDRAWN: "slate",
  ON_HOLD: "slate",
};

export function StatusPill({ status, className }: { status: ApplicationStatus; className?: string }) {
  const t = useTranslations("status");
  return (
    <Badge tone={STATUS_TONE[status]} className={className}>
      {t(status)}
    </Badge>
  );
}
