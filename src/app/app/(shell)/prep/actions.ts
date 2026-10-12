"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { bookMockInterview, cancelMockInterview } from "@/server/services/prep";

const id = z.string().min(1).max(40);

export async function bookMockAction(slotId: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await bookMockInterview(user, id.parse(slotId));
    return null;
  }, "Mock interview booked. See you there!");
}

export async function cancelMockAction(mockId: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await cancelMockInterview(user, id.parse(mockId));
    return null;
  }, "Mock interview cancelled");
}
