"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, ExternalLink, KeyRound, Lock, Mail, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useServerAction } from "@/components/portal/action-form";
import { CREDENTIAL_KINDS, CREDENTIAL_LOGIN_URLS, type CredentialKind } from "@/lib/schemas/student";
import { addCredentialAction, deleteCredentialAction, revealOwnCredentialAction, updateCredentialAction } from "@/app/app/(shell)/vault/actions";
import { cn } from "@/lib/utils";

export type VaultItem = { id: string; kind: string; label: string; loginUrl: string | null; hasNotes: boolean; updatedAt: string };

const KIND_TONE: Record<string, string> = {
  EMAIL: "bg-[#FCEAE8] text-[#A82A21]",
  LINKEDIN: "bg-[#E8EFFE] text-[#0A35D6]",
  INDEED: "bg-[#E1F6FD] text-[#0B6C8F]",
  DICE: "bg-[#FDF3E1] text-[#7A4E0E]",
  GLASSDOOR: "bg-[#E6F4EC] text-[#1E7B4F]",
  ZIPRECRUITER: "bg-[#E6F4EC] text-[#1E7B4F]",
  HANDSHAKE: "bg-[#F0EAFE] text-[#5B2BC4]",
  OTHER: "bg-[#EEF0F5] text-[#4A5578]",
};

function KindIcon({ kind }: { kind: string }) {
  return (
    <span aria-hidden="true" className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]", KIND_TONE[kind] ?? KIND_TONE.OTHER)}>
      {kind === "EMAIL" ? <Mail className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
    </span>
  );
}

type FormState = { kind: CredentialKind; label: string; loginUrl: string; username: string; password: string; notes: string };

function CredentialForm({ initial, editing, onDone }: { initial?: VaultItem; editing?: boolean; onDone: () => void }) {
  const t = useTranslations("student.vault");
  const tk = useTranslations("student.vault.kinds");
  const [f, setF] = React.useState<FormState>(() => ({
    kind: (initial?.kind as CredentialKind) ?? "EMAIL",
    label: initial?.label ?? tk("EMAIL"),
    loginUrl: initial?.loginUrl ?? "",
    username: "",
    password: "",
    notes: "",
  }));
  const [show, setShow] = React.useState(false);
  const [loadingCurrent, setLoadingCurrent] = React.useState(Boolean(editing));
  const add = useServerAction(addCredentialAction, { onSuccess: onDone });
  const upd = useServerAction((input: Parameters<typeof updateCredentialAction>[1]) => updateCredentialAction(initial!.id, input), { onSuccess: onDone });
  const pending = add.pending || upd.pending;
  const errors = editing ? upd.fieldErrors : add.fieldErrors;

  // Editing: prefill the username (the student's own data) without exposing the password.
  React.useEffect(() => {
    if (!editing || !initial) return;
    let cancelled = false;
    revealOwnCredentialAction(initial.id).then((r) => {
      if (cancelled) return;
      if (r.ok) setF((x) => ({ ...x, username: r.data.username, notes: r.data.notes ?? "" }));
      setLoadingCurrent(false);
    });
    return () => {
      cancelled = true;
    };
  }, [editing, initial]);

  const set = (p: Partial<FormState>) => setF((x) => ({ ...x, ...p }));
  const err = (k: string) => errors[k]?.[0];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload = { kind: f.kind, label: f.label, loginUrl: f.loginUrl || null, username: f.username, notes: f.notes || null };
        if (editing) upd.run({ ...payload, password: f.password || null, keepNotes: false });
        else add.run({ ...payload, password: f.password });
      }}
      className="grid gap-4"
      aria-busy={loadingCurrent || undefined}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="v-kind" label={t("kind")}>
          <Select
            id="v-kind"
            value={f.kind}
            onChange={(e) => {
              const kind = e.target.value as CredentialKind;
              const wasDefaultLabel = CREDENTIAL_KINDS.some((k) => tk(k) === f.label) || !f.label;
              const wasDefaultUrl = !f.loginUrl || Object.values(CREDENTIAL_LOGIN_URLS).includes(f.loginUrl);
              set({ kind, label: wasDefaultLabel ? tk(kind) : f.label, loginUrl: wasDefaultUrl ? (CREDENTIAL_LOGIN_URLS[kind] ?? "") : f.loginUrl });
            }}
          >
            {CREDENTIAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {tk(k)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="v-label" label={t("label")} error={err("label")}>
          <Input id="v-label" value={f.label} onChange={(e) => set({ label: e.target.value })} maxLength={80} required />
        </Field>
      </div>
      <Field id="v-url" label={t("loginUrl")} hint={t("optional")} error={err("loginUrl")}>
        <Input id="v-url" inputMode="url" placeholder="https://" value={f.loginUrl} onChange={(e) => set({ loginUrl: e.target.value })} />
      </Field>
      <Field id="v-username" label={f.kind === "EMAIL" ? t("emailAddress") : t("username")} error={err("username")}>
        <Input id="v-username" value={f.username} onChange={(e) => set({ username: e.target.value })} autoComplete="off" spellCheck={false} required disabled={loadingCurrent} />
      </Field>
      <Field id="v-password" label={editing ? t("newPassword") : t("password")} hint={editing ? t("keepPasswordHint") : undefined} error={err("password")}>
        <div className="relative">
          <Input id="v-password" type={show ? "text" : "password"} value={f.password} onChange={(e) => set({ password: e.target.value })} autoComplete="new-password" spellCheck={false} required={!editing} className="pr-12" aria-describedby={editing ? "v-password-hint" : undefined} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? t("hidePassword") : t("showPassword")} aria-pressed={show} className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted">
            {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </Field>
      <Field id="v-notes" label={t("notes")} hint={t("notesHint")} error={err("notes")}>
        <Textarea id="v-notes" rows={3} maxLength={1000} value={f.notes} onChange={(e) => set({ notes: e.target.value })} disabled={loadingCurrent} aria-describedby="v-notes-hint" />
      </Field>
      <p className="flex items-start gap-2 rounded-[12px] bg-accent/60 px-3.5 py-3 text-[13px] text-accent-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t("encryptedNote")}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {t("cancel")}
          </Button>
        </DialogClose>
        <Button type="submit" loading={pending} disabled={loadingCurrent}>
          {editing ? t("saveChanges") : t("saveLogin")}
        </Button>
      </div>
    </form>
  );
}

function Revealed({ id, onHide }: { id: string; onHide: () => void }) {
  const t = useTranslations("student.vault");
  const [data, setData] = React.useState<{ username: string; password: string; notes: string | null } | null>(null);
  const [left, setLeft] = React.useState(30);
  React.useEffect(() => {
    let alive = true;
    revealOwnCredentialAction(id).then((r) => {
      if (!alive) return;
      if (r.ok) setData(r.data);
      else {
        toast.error(r.error);
        onHide();
      }
    });
    const timer = window.setInterval(() => setLeft((s) => s - 1), 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id, onHide]);
  React.useEffect(() => {
    if (left <= 0) onHide();
  }, [left, onHide]);
  async function copy(v: string) {
    try {
      await navigator.clipboard.writeText(v);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }
  if (!data) return <p className="mt-3 text-sm text-muted-foreground">{t("revealing")}</p>;
  return (
    <div className="mt-3 grid gap-2 rounded-[12px] border border-border bg-canvas/70 p-3">
      {(
        [
          ["username", data.username],
          ["password", data.password],
        ] as const
      ).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[13px] text-muted-foreground">{t(k)}</span>
          <code className="min-w-0 flex-1 truncate rounded-[8px] bg-surface px-2 py-1.5 font-mono text-sm">{v}</code>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => copy(v)} aria-label={t("copyX", { what: t(k) })}>
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {data.notes ? <p className="whitespace-pre-wrap text-sm text-muted-foreground">{data.notes}</p> : null}
      <p className="text-xs text-subtle-foreground" aria-live="polite">
        {t("hidesIn", { s: Math.max(0, left) })}
      </p>
    </div>
  );
}

export function VaultManager({ items, compact = false }: { items: VaultItem[]; compact?: boolean }) {
  const t = useTranslations("student.vault");
  const tk = useTranslations("student.vault.kinds");
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<VaultItem | null>(null);
  const [deleting, setDeleting] = React.useState<VaultItem | null>(null);
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const del = useServerAction(deleteCredentialAction, { onSuccess: () => setDeleting(null) });
  const hide = React.useCallback(() => setRevealed(null), []);
  const hasEmail = items.some((i) => i.kind === "EMAIL");

  return (
    <div className="grid gap-4">
      {items.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-6 w-6" aria-hidden="true" />} title={t("emptyTitle")} body={t("emptyBody")} action={<Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden="true" />{t("addFirst")}</Button>} className="bg-surface" />
      ) : (
        <ul className={cn("grid gap-3", !compact && "lg:grid-cols-2")}>
          {items.map((c) => (
            <li key={c.id} className="rounded-[16px] border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <KindIcon kind={c.kind} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{c.label}</p>
                  {tk(c.kind as CredentialKind) !== c.label || c.hasNotes ? (
                    <p className="text-[13px] text-muted-foreground">{[tk(c.kind as CredentialKind) !== c.label ? tk(c.kind as CredentialKind) : null, c.hasNotes ? t("hasNotes") : null].filter(Boolean).join(" · ")}</p>
                  ) : null}
                  {revealed !== c.id ? (
                    <p className="mt-1 font-mono text-sm tracking-[0.2em] text-subtle-foreground" aria-label={t("hiddenValues")}>
                      ••••••••••
                    </p>
                  ) : null}
                </div>
                {c.loginUrl ? (
                  <a href={c.loginUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-muted-foreground hover:bg-surface-muted" aria-label={t("openLogin", { label: c.label })}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
              {revealed === c.id ? <Revealed id={c.id} onHide={hide} /> : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setRevealed(revealed === c.id ? null : c.id)} aria-expanded={revealed === c.id}>
                  {revealed === c.id ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                  {revealed === c.id ? t("hide") : t("reveal")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(c)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t("editRotate")}
                </Button>
                <Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setDeleting(c)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("add")}
          </Button>
          {!hasEmail ? <p className="text-sm text-muted-foreground">{t("emailTip")}</p> : null}
        </div>
      ) : null}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={t("addTitle")} description={t("addDescription")}>
          {adding ? <CredentialForm onDone={() => setAdding(false)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={t("editTitle")} description={t("editDescription")}>
          {editing ? <CredentialForm key={editing.id} initial={editing} editing onDone={() => setEditing(null)} /> : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent title={t("deleteTitle", { label: deleting?.label ?? "" })} description={t("deleteBody")}>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button variant="danger" loading={del.pending} onClick={() => deleting && del.run(deleting.id)}>
              {t("deleteConfirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Plain-language ToS notice (SPEC §10). */
export function VaultNotice({ className }: { className?: string }) {
  const t = useTranslations("student.vault");
  return (
    <div className={cn("rounded-[14px] border border-[#F0D9AE] bg-[#FDF3E1] px-4 py-3 text-sm text-[#5E3C08]", className)}>
      <p className="font-semibold">{t("noticeTitle")}</p>
      <p className="mt-1">{t("noticeBody")}</p>
    </div>
  );
}

