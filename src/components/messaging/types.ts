import type { ApplicationStatus } from "@/generated/prisma/enums";

/** JSON shapes exchanged with /api/messages (dates as ISO strings). */
export type MessageJson = {
  id: string;
  body: string;
  mine: boolean;
  fromStudent: boolean;
  senderName: string;
  createdAt: string;
  readAt: string | null;
  isBroadcast: boolean;
  attachments: { id: string; filename: string; mime: string; size: number }[];
  application: { id: string; companyName: string; jobTitle: string; status: ApplicationStatus | string; companyDomain: string | null } | null;
};

export type ThreadJson = {
  id: string;
  studentId: string;
  isActive: boolean;
  canWrite: boolean;
  side: "student" | "staff" | "observer";
  counterpart: string;
  studentName: string;
  employeeName: string;
  messages: MessageJson[];
  hasMore: boolean;
};

export type ThreadListItemJson = {
  id: string;
  studentId: string;
  title: string;
  subtitle: string | null;
  isActive: boolean;
  canWrite: boolean;
  unread: number;
  last: { preview: string; at: string; mine: boolean; hasAttachment: boolean } | null;
};

export type MessengerMode = "staff" | "student" | "observer";
