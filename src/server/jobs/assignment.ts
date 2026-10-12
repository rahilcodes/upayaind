import "server-only";
import { autoAssign, rehomeEmployeeStudents } from "@/server/services/assignment";
import { defineJob } from "./client";

/** F1 step 5: a newly activated subscription triggers auto-assignment (F2). */
export const onSubscriptionActivated = defineJob<{ studentId: string }>({
  id: "assignment-on-activation",
  event: "subscription.activated",
  concurrencyKey: "studentId",
  run: async ({ studentId }) => autoAssign(studentId),
});

/** Deactivating an employee re-homes all their students. */
export const onEmployeeDeactivated = defineJob<{ employeeId: string; actorId?: string }>({
  id: "assignment-rehome",
  event: "employee.deactivated",
  run: async ({ employeeId, actorId }) => rehomeEmployeeStudents(employeeId, actorId ?? null),
});
