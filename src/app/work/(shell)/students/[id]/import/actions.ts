"use server";
import { z } from "zod";
import { requireRole } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { commitCsvImport, previewCsvImport } from "@/server/services/applications";

const STAFF = ["EMPLOYEE", "MANAGER", "ADMIN"] as const;
const Input = z.object({ studentId: z.string().min(1).max(64), csv: z.string().min(1, "Choose a CSV file first.").max(2_000_000, "The CSV is too large (max 2 MB).") });

export async function previewImportAction(studentId: string, csv: string) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const i = Input.parse({ studentId, csv });
    return previewCsvImport(user, i.studentId, i.csv);
  });
}

export async function commitImportAction(studentId: string, csv: string, confirmWarnings: boolean) {
  return safeAction(async () => {
    const user = await requireRole(STAFF);
    const i = Input.parse({ studentId, csv });
    return commitCsvImport(user, i.studentId, i.csv, { confirmWarnings: z.boolean().parse(confirmWarnings) });
  });
}
