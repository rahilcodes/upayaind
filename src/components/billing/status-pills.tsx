import { useTranslations } from "next-intl";
import type { PaymentStatus, SubscriptionStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";

const SUB_TONE: Record<SubscriptionStatus, "green" | "amber" | "red" | "grey" | "slate" | "blue"> = {
  PENDING_PAYMENT: "amber",
  ACTIVE: "green",
  PAST_DUE: "red",
  PAUSED: "slate",
  CANCELED: "grey",
  EXPIRED: "grey",
};

const PAY_TONE: Record<PaymentStatus, "green" | "amber" | "red" | "grey" | "violet"> = {
  PENDING: "amber",
  SUCCEEDED: "green",
  FAILED: "red",
  REFUNDED: "grey",
  PARTIALLY_REFUNDED: "violet",
};

export function SubscriptionStatusPill({ status }: { status: SubscriptionStatus }) {
  const t = useTranslations("billing.subStatus");
  return (
    <Badge tone={SUB_TONE[status]} dot>
      {t(status)}
    </Badge>
  );
}

export function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  const t = useTranslations("billing.paymentStatus");
  return <Badge tone={PAY_TONE[status]}>{t(status)}</Badge>;
}
