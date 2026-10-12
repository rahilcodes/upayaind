import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { env, integrations } from "@/env";
import { db } from "@/server/db";
import { randomToken } from "@/server/crypto";

/**
 * File storage (SPEC §10): private Cloudflare R2 bucket; every download goes
 * through /api/files/[id] which checks permission and redirects to a signed URL
 * valid for 5 minutes. Uploads are type-checked by magic number. In development
 * without R2 credentials, files live in ./.local-storage and are streamed by the
 * same route.
 */

export const ALLOWED_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
} as const;
export type AllowedKind = keyof typeof ALLOWED_MIME;

export const LIMITS = { resume: 5 * 1024 * 1024, proof: 3 * 1024 * 1024, attachment: 10 * 1024 * 1024, image: 5 * 1024 * 1024, leave: 5 * 1024 * 1024 } as const;

const s3 = integrations.storage
  ? new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    })
  : null;
const LOCAL_ROOT = path.join(process.cwd(), ".local-storage");

export class FileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileError";
  }
}

/** Detect the real type from bytes. DOCX is a ZIP, so we also check for word/document.xml. */
export async function sniff(buf: Buffer): Promise<{ kind: AllowedKind; mime: string } | null> {
  const t = await fileTypeFromBuffer(buf);
  if (!t) return null;
  if (t.mime === "application/pdf") return { kind: "pdf", mime: ALLOWED_MIME.pdf };
  if (t.mime === "image/png") return { kind: "png", mime: ALLOWED_MIME.png };
  if (t.mime === "image/jpeg") return { kind: "jpg", mime: ALLOWED_MIME.jpg };
  if (t.ext === "docx" || (t.mime === "application/zip" && buf.includes(Buffer.from("word/document.xml")))) {
    return { kind: "docx", mime: ALLOWED_MIME.docx };
  }
  return null;
}

async function putObject(key: string, body: Buffer, mime: string) {
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.R2_BUCKET, Key: key, Body: body, ContentType: mime }));
    return;
  }
  const p = path.join(LOCAL_ROOT, key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
}

export async function readObject(key: string): Promise<Buffer> {
  if (s3) {
    const r = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  const p = path.join(LOCAL_ROOT, key);
  if (!p.startsWith(LOCAL_ROOT)) throw new FileError("Invalid key");
  return fs.readFile(p);
}

export async function deleteObject(key: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
  else await fs.rm(path.join(LOCAL_ROOT, key), { force: true });
}

/** Signed GET URL (5 min) — or null in local mode (stream through the route instead). */
export async function signedUrl(key: string, filename?: string, inline = false) {
  if (!s3) return null;
  const disposition = filename ? `${inline ? "inline" : "attachment"}; filename="${filename.replace(/"/g, "")}"` : undefined;
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key, ResponseContentDisposition: disposition }), { expiresIn: 300 });
}

/**
 * Validate (size + magic number) and store an upload, recording a FileObject.
 * `allowed` lists which kinds this purpose accepts.
 */
export async function storeUpload(input: {
  buffer: Buffer;
  filename?: string;
  ownerUserId: string;
  studentId?: string | null;
  purpose: string;
  allowed: AllowedKind[];
  maxBytes: number;
  keyPrefix: string;
}) {
  if (input.buffer.length === 0) throw new FileError("The file is empty.");
  if (input.buffer.length > input.maxBytes) throw new FileError(`The file is larger than ${Math.round(input.maxBytes / 1024 / 1024)} MB.`);
  const t = await sniff(input.buffer);
  if (!t || !input.allowed.includes(t.kind)) {
    throw new FileError(`Unsupported file type. Allowed: ${input.allowed.map((k) => k.toUpperCase()).join(", ")}.`);
  }
  const key = `${input.keyPrefix.replace(/\/+$/, "")}/${Date.now()}-${randomToken(9)}.${t.kind}`;
  await putObject(key, input.buffer, t.mime);
  const file = await db.fileObject.create({
    data: {
      key,
      ownerUserId: input.ownerUserId,
      studentId: input.studentId ?? null,
      purpose: input.purpose,
      mime: t.mime,
      size: input.buffer.length,
      filename: input.filename?.slice(0, 200) ?? null,
    },
    select: { id: true, key: true, mime: true, size: true, filename: true },
  });
  return file;
}

/** Store generated output (PDF/DOCX/invoices) — trusted content, no sniffing. */
export async function storeGenerated(input: { key: string; buffer: Buffer; mime: string; ownerUserId: string; studentId?: string | null; purpose: string; filename?: string }) {
  await putObject(input.key, input.buffer, input.mime);
  return db.fileObject.upsert({
    where: { key: input.key },
    update: { size: input.buffer.length, mime: input.mime, filename: input.filename ?? null },
    create: { key: input.key, ownerUserId: input.ownerUserId, studentId: input.studentId ?? null, purpose: input.purpose, mime: input.mime, size: input.buffer.length, filename: input.filename ?? null },
    select: { id: true, key: true },
  });
}

/** Convert a File from FormData into a Buffer (server actions). */
export async function fileToBuffer(f: File | null | undefined) {
  if (!f || typeof f === "string" || f.size === 0) return null;
  return { buffer: Buffer.from(await f.arrayBuffer()), filename: f.name };
}
