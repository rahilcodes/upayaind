"use server";
import { z } from "zod";
import { requireStudent } from "@/server/auth/guards";
import { safeAction } from "@/server/errors";
import { addCredential, deleteCredential, revealOwnCredential, updateCredential } from "@/server/services/vault";
import { credentialSchema, credentialUpdateSchema, type CredentialInput, type CredentialUpdateInput } from "@/lib/schemas/student";

const id = z.string().min(1).max(40);

export async function addCredentialAction(input: CredentialInput) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    return addCredential(user, credentialSchema.parse(input));
  }, "Login saved securely");
}

export async function updateCredentialAction(credentialId: string, input: CredentialUpdateInput) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    const r = await updateCredential(user, id.parse(credentialId), credentialUpdateSchema.parse(input));
    return r;
  }, "Login updated");
}

export async function deleteCredentialAction(credentialId: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    await deleteCredential(user, id.parse(credentialId));
    return null;
  }, "Login deleted");
}

/** The student's own values (never cached, never sent with the page). */
export async function revealOwnCredentialAction(credentialId: string) {
  return safeAction(async () => {
    const { user } = await requireStudent();
    return revealOwnCredential(user, id.parse(credentialId));
  });
}
