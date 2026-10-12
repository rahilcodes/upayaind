"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Award, BookOpen, Briefcase, ChevronDown, FolderGit2, GraduationCap, Languages, Plus, Trash2, User, Wrench, FileText } from "lucide-react";
import type { ResumeData } from "@/resume/schema";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TagInput } from "./tag-input";

/**
 * Structured master-profile editor (SPEC F3 step 1 review + /app/profile).
 * Pure client state: the parent owns `value` and saves it with a server
 * action (validated again on the server by cleanMasterProfile).
 */

type Exp = ResumeData["experience"][number];
type Edu = ResumeData["education"][number];
type Proj = ResumeData["projects"][number];

const newId = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function move<T>(list: T[], i: number, dir: -1 | 1) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

function Section({ id, icon, title, count, children, defaultOpen = true }: { id: string; icon: React.ReactNode; title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-[18px] border border-border bg-surface">
      <h3 id={`${id}-h`} className="m-0">
        <button type="button" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center gap-3 px-4 text-left sm:px-5">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
            {icon}
          </span>
          <span className="flex-1 text-base font-bold">{title}</span>
          {count !== undefined ? <span className="tabular rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span> : null}
          <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h3>
      <div id={`${id}-body`} hidden={!open} className="border-t border-border px-4 pb-5 pt-4 sm:px-5">
        {children}
      </div>
    </section>
  );
}

function ItemCard({ title, onUp, onDown, onRemove, children, labels }: { title: string; onUp?: () => void; onDown?: () => void; onRemove: () => void; children: React.ReactNode; labels: { up: string; down: string; remove: string } }) {
  return (
    <div className="rounded-[14px] border border-border bg-canvas/60 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-1">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">{title}</p>
        {onUp ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onUp} aria-label={labels.up}>
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
        {onDown ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={onDown} aria-label={labels.down}>
            <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label={labels.remove} className="text-danger hover:bg-danger/10">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid [&>*]:min-w-0 gap-3">{children}</div>
    </div>
  );
}

export function MasterProfileEditor({ value, onChange, idPrefix = "mp" }: { value: ResumeData; onChange: (v: ResumeData) => void; idPrefix?: string }) {
  const t = useTranslations("student.editor");
  const v = value;
  const set = (patch: Partial<ResumeData>) => onChange({ ...v, ...patch });
  const id = (s: string) => `${idPrefix}-${s}`;
  const itemLabels = (name: string) => ({ up: t("moveUp", { item: name }), down: t("moveDown", { item: name }), remove: t("remove", { item: name }) });

  const setExp = (i: number, patch: Partial<Exp>) => set({ experience: v.experience.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setEdu = (i: number, patch: Partial<Edu>) => set({ education: v.education.map((e, k) => (k === i ? { ...e, ...patch } : e)) });
  const setProj = (i: number, patch: Partial<Proj>) => set({ projects: v.projects.map((e, k) => (k === i ? { ...e, ...patch } : e)) });

  return (
    <div className="grid [&>*]:min-w-0 min-w-0 grid-cols-1 gap-4">
      {/* Contact */}
      <Section id={id("basics")} icon={<User className="h-[18px] w-[18px]" />} title={t("basics")}>
        <div className="grid [&>*]:min-w-0 gap-4 sm:grid-cols-2">
          <Field id={id("name")} label={t("name")}>
            <Input id={id("name")} value={v.basics.name} onChange={(e) => set({ basics: { ...v.basics, name: e.target.value } })} autoComplete="name" />
          </Field>
          <Field id={id("headline")} label={t("headline")} hint={t("headlineHint")}>
            <Input id={id("headline")} value={v.basics.headline ?? ""} onChange={(e) => set({ basics: { ...v.basics, headline: e.target.value } })} aria-describedby={`${id("headline")}-hint`} />
          </Field>
          <Field id={id("email")} label={t("email")}>
            <Input id={id("email")} type="email" value={v.basics.email} onChange={(e) => set({ basics: { ...v.basics, email: e.target.value } })} autoComplete="email" />
          </Field>
          <Field id={id("phone")} label={t("phone")}>
            <Input id={id("phone")} type="tel" value={v.basics.phone} onChange={(e) => set({ basics: { ...v.basics, phone: e.target.value } })} autoComplete="tel" />
          </Field>
          <Field id={id("city")} label={t("city")}>
            <Input id={id("city")} value={v.basics.location.city} onChange={(e) => set({ basics: { ...v.basics, location: { ...v.basics.location, city: e.target.value } } })} autoComplete="address-level2" />
          </Field>
          <div className="grid [&>*]:min-w-0 grid-cols-2 gap-3">
            <Field id={id("region")} label={t("region")}>
              <Input id={id("region")} value={v.basics.location.region ?? ""} onChange={(e) => set({ basics: { ...v.basics, location: { ...v.basics.location, region: e.target.value } } })} autoComplete="address-level1" />
            </Field>
            <Field id={id("country")} label={t("country")}>
              <Input id={id("country")} value={v.basics.location.country} onChange={(e) => set({ basics: { ...v.basics, location: { ...v.basics.location, country: e.target.value } } })} autoComplete="country-name" />
            </Field>
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          <p className="text-sm font-semibold">{t("links")}</p>
          {v.basics.links.map((l, i) => (
            <div key={i} className="grid [&>*]:min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
              <Input aria-label={t("linkLabel", { n: i + 1 })} placeholder={t("linkLabelPh")} value={l.label} onChange={(e) => set({ basics: { ...v.basics, links: v.basics.links.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) } })} className="col-span-2 sm:col-span-1" />
              <Input aria-label={t("linkUrl", { n: i + 1 })} placeholder="https://" inputMode="url" value={l.url} onChange={(e) => set({ basics: { ...v.basics, links: v.basics.links.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)) } })} />
              <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { item: l.label || t("link") })} onClick={() => set({ basics: { ...v.basics, links: v.basics.links.filter((_, k) => k !== i) } })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ basics: { ...v.basics, links: [...v.basics.links, { label: "", url: "" }] } })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addLink")}
          </Button>
        </div>
      </Section>

      {/* Summary */}
      <Section id={id("summary")} icon={<FileText className="h-[18px] w-[18px]" />} title={t("summary")}>
        <Field id={id("summaryText")} label={t("summaryLabel")} hint={t("summaryHint", { n: (v.summary ?? "").length })}>
          <Textarea id={id("summaryText")} maxLength={800} rows={4} value={v.summary ?? ""} onChange={(e) => set({ summary: e.target.value })} aria-describedby={`${id("summaryText")}-hint`} />
        </Field>
      </Section>

      {/* Skills */}
      <Section id={id("skills")} icon={<Wrench className="h-[18px] w-[18px]" />} title={t("skills")} count={v.skills.reduce((n, g) => n + g.items.length, 0)}>
        <div className="grid [&>*]:min-w-0 gap-3">
          {v.skills.map((g, i) => (
            <ItemCard key={i} title={g.group || t("skillGroup")} labels={itemLabels(g.group || t("skillGroup"))} onUp={i > 0 ? () => set({ skills: move(v.skills, i, -1) }) : undefined} onDown={i < v.skills.length - 1 ? () => set({ skills: move(v.skills, i, 1) }) : undefined} onRemove={() => set({ skills: v.skills.filter((_, k) => k !== i) })}>
              <Field id={id(`sg${i}`)} label={t("groupName")}>
                <Input id={id(`sg${i}`)} value={g.group} placeholder={t("groupPh")} onChange={(e) => set({ skills: v.skills.map((x, k) => (k === i ? { ...x, group: e.target.value } : x)) })} />
              </Field>
              <Field id={id(`si${i}`)} label={t("skillItems")} hint={t("chipsHint")}>
                <TagInput id={id(`si${i}`)} value={g.items} onChange={(items) => set({ skills: v.skills.map((x, k) => (k === i ? { ...x, items } : x)) })} max={40} describedBy={`${id(`si${i}`)}-hint`} />
              </Field>
            </ItemCard>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ skills: [...v.skills, { group: "", items: [] }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addSkillGroup")}
          </Button>
        </div>
      </Section>

      {/* Experience */}
      <Section id={id("exp")} icon={<Briefcase className="h-[18px] w-[18px]" />} title={t("experience")} count={v.experience.length}>
        <div className="grid [&>*]:min-w-0 gap-3">
          {v.experience.map((e, i) => {
            const name = [e.title, e.company].filter(Boolean).join(" · ") || t("newRole");
            return (
              <ItemCard key={e.id} title={name} labels={itemLabels(name)} onUp={i > 0 ? () => set({ experience: move(v.experience, i, -1) }) : undefined} onDown={i < v.experience.length - 1 ? () => set({ experience: move(v.experience, i, 1) }) : undefined} onRemove={() => set({ experience: v.experience.filter((_, k) => k !== i) })}>
                <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
                  <Field id={id(`et${i}`)} label={t("jobTitle")}>
                    <Input id={id(`et${i}`)} value={e.title} onChange={(x) => setExp(i, { title: x.target.value })} />
                  </Field>
                  <Field id={id(`ec${i}`)} label={t("company")}>
                    <Input id={id(`ec${i}`)} value={e.company} onChange={(x) => setExp(i, { company: x.target.value })} />
                  </Field>
                  <Field id={id(`el${i}`)} label={t("location")}>
                    <Input id={id(`el${i}`)} value={e.location ?? ""} onChange={(x) => setExp(i, { location: x.target.value })} />
                  </Field>
                  <div className="grid [&>*]:min-w-0 grid-cols-2 gap-3">
                    <Field id={id(`es${i}`)} label={t("start")}>
                      <Input id={id(`es${i}`)} type="month" value={e.startDate} onChange={(x) => setExp(i, { startDate: x.target.value })} />
                    </Field>
                    <Field id={id(`ee${i}`)} label={t("end")}>
                      <Input id={id(`ee${i}`)} type="month" value={e.endDate ?? ""} disabled={e.endDate === null} onChange={(x) => setExp(i, { endDate: x.target.value })} />
                    </Field>
                  </div>
                </div>
                <label className="inline-flex min-h-11 items-center gap-2.5 text-sm font-medium">
                  <Checkbox checked={e.endDate === null} onChange={(x) => setExp(i, { endDate: x.target.checked ? null : "" })} />
                  {t("current")}
                </label>
                <fieldset className="grid [&>*]:min-w-0 gap-2">
                  <legend className="mb-2 text-sm font-semibold">{t("bullets")}</legend>
                  {e.bullets.map((b, bi) => (
                    <div key={b.id} className="flex items-start gap-2">
                      <span aria-hidden="true" className="mt-[22px] h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                      <Textarea aria-label={t("bulletN", { n: bi + 1 })} rows={2} className="min-h-14 flex-1" value={b.text} onChange={(x) => setExp(i, { bullets: e.bullets.map((y, k) => (k === bi ? { ...y, text: x.target.value } : y)) })} />
                      <div className="flex flex-col">
                        <Button type="button" variant="ghost" size="icon-sm" disabled={bi === 0} aria-label={t("moveUp", { item: t("bulletN", { n: bi + 1 }) })} onClick={() => setExp(i, { bullets: move(e.bullets, bi, -1) })}>
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("remove", { item: t("bulletN", { n: bi + 1 }) })} onClick={() => setExp(i, { bullets: e.bullets.filter((_, k) => k !== bi) })}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" className="justify-self-start text-primary" onClick={() => setExp(i, { bullets: [...e.bullets, { id: newId("b"), text: "" }] })}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    {t("addBullet")}
                  </Button>
                </fieldset>
                <Field id={id(`etech${i}`)} label={t("technologies")} hint={t("chipsHint")}>
                  <TagInput id={id(`etech${i}`)} value={e.technologies} onChange={(technologies) => setExp(i, { technologies })} max={30} describedBy={`${id(`etech${i}`)}-hint`} />
                </Field>
              </ItemCard>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ experience: [...v.experience, { id: newId("exp"), company: "", title: "", startDate: "", endDate: null, bullets: [{ id: newId("b"), text: "" }], technologies: [] }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addExperience")}
          </Button>
        </div>
      </Section>

      {/* Education */}
      <Section id={id("edu")} icon={<GraduationCap className="h-[18px] w-[18px]" />} title={t("education")} count={v.education.length}>
        <div className="grid [&>*]:min-w-0 gap-3">
          {v.education.map((e, i) => {
            const name = [e.degree, e.institution].filter(Boolean).join(" · ") || t("newEducation");
            return (
              <ItemCard key={e.id} title={name} labels={itemLabels(name)} onUp={i > 0 ? () => set({ education: move(v.education, i, -1) }) : undefined} onDown={i < v.education.length - 1 ? () => set({ education: move(v.education, i, 1) }) : undefined} onRemove={() => set({ education: v.education.filter((_, k) => k !== i) })}>
                <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
                  <Field id={id(`ei${i}`)} label={t("institution")}>
                    <Input id={id(`ei${i}`)} value={e.institution} onChange={(x) => setEdu(i, { institution: x.target.value })} />
                  </Field>
                  <Field id={id(`ed${i}`)} label={t("degree")}>
                    <Input id={id(`ed${i}`)} value={e.degree} onChange={(x) => setEdu(i, { degree: x.target.value })} />
                  </Field>
                  <Field id={id(`ef${i}`)} label={t("field")}>
                    <Input id={id(`ef${i}`)} value={e.field ?? ""} onChange={(x) => setEdu(i, { field: x.target.value })} />
                  </Field>
                  <Field id={id(`eg${i}`)} label={t("grade")}>
                    <Input id={id(`eg${i}`)} value={e.grade ?? ""} onChange={(x) => setEdu(i, { grade: x.target.value })} />
                  </Field>
                  <Field id={id(`eds${i}`)} label={t("start")}>
                    <Input id={id(`eds${i}`)} type="month" value={e.startDate ?? ""} onChange={(x) => setEdu(i, { startDate: x.target.value || undefined })} />
                  </Field>
                  <Field id={id(`ede${i}`)} label={t("endOrExpected")}>
                    <Input id={id(`ede${i}`)} type="month" value={e.endDate ?? ""} onChange={(x) => setEdu(i, { endDate: x.target.value || undefined })} />
                  </Field>
                </div>
              </ItemCard>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ education: [...v.education, { id: newId("edu"), institution: "", degree: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addEducation")}
          </Button>
        </div>
      </Section>

      {/* Projects */}
      <Section id={id("proj")} icon={<FolderGit2 className="h-[18px] w-[18px]" />} title={t("projects")} count={v.projects.length} defaultOpen={v.projects.length > 0}>
        <div className="grid [&>*]:min-w-0 gap-3">
          {v.projects.map((p, i) => (
            <ItemCard key={p.id} title={p.name || t("newProject")} labels={itemLabels(p.name || t("newProject"))} onUp={i > 0 ? () => set({ projects: move(v.projects, i, -1) }) : undefined} onDown={i < v.projects.length - 1 ? () => set({ projects: move(v.projects, i, 1) }) : undefined} onRemove={() => set({ projects: v.projects.filter((_, k) => k !== i) })}>
              <div className="grid [&>*]:min-w-0 gap-3 sm:grid-cols-2">
                <Field id={id(`pn${i}`)} label={t("projectName")}>
                  <Input id={id(`pn${i}`)} value={p.name} onChange={(x) => setProj(i, { name: x.target.value })} />
                </Field>
                <Field id={id(`pl${i}`)} label={t("projectLink")}>
                  <Input id={id(`pl${i}`)} inputMode="url" placeholder="https://" value={p.link ?? ""} onChange={(x) => setProj(i, { link: x.target.value })} />
                </Field>
              </div>
              <Field id={id(`pd${i}`)} label={t("projectDescription")}>
                <Textarea id={id(`pd${i}`)} rows={2} className="min-h-16" value={p.description} onChange={(x) => setProj(i, { description: x.target.value })} />
              </Field>
              <fieldset className="grid [&>*]:min-w-0 gap-2">
                <legend className="mb-2 text-sm font-semibold">{t("bullets")}</legend>
                {p.bullets.map((b, bi) => (
                  <div key={bi} className="flex items-start gap-2">
                    <Input aria-label={t("bulletN", { n: bi + 1 })} value={b} onChange={(x) => setProj(i, { bullets: p.bullets.map((y, k) => (k === bi ? x.target.value : y)) })} />
                    <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { item: t("bulletN", { n: bi + 1 }) })} onClick={() => setProj(i, { bullets: p.bullets.filter((_, k) => k !== bi) })}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="ghost" size="sm" className="justify-self-start text-primary" onClick={() => setProj(i, { bullets: [...p.bullets, ""] })}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t("addBullet")}
                </Button>
              </fieldset>
            </ItemCard>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ projects: [...v.projects, { id: newId("proj"), name: "", description: "", bullets: [] }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addProject")}
          </Button>
        </div>
      </Section>

      {/* Certifications */}
      <Section id={id("cert")} icon={<Award className="h-[18px] w-[18px]" />} title={t("certifications")} count={v.certifications.length} defaultOpen={v.certifications.length > 0}>
        <div className="grid [&>*]:min-w-0 gap-3">
          {v.certifications.map((c, i) => (
            <div key={i} className="grid [&>*]:min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_150px_auto]">
              <Input aria-label={t("certName", { n: i + 1 })} placeholder={t("certNamePh")} value={c.name} onChange={(x) => set({ certifications: v.certifications.map((y, k) => (k === i ? { ...y, name: x.target.value } : y)) })} className="col-span-2 sm:col-span-1" />
              <Input aria-label={t("certIssuer", { n: i + 1 })} placeholder={t("certIssuerPh")} value={c.issuer ?? ""} onChange={(x) => set({ certifications: v.certifications.map((y, k) => (k === i ? { ...y, issuer: x.target.value } : y)) })} />
              <Input aria-label={t("certDate", { n: i + 1 })} type="month" value={c.date ?? ""} onChange={(x) => set({ certifications: v.certifications.map((y, k) => (k === i ? { ...y, date: x.target.value || undefined } : y)) })} className="hidden sm:block" />
              <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { item: c.name || t("certification") })} onClick={() => set({ certifications: v.certifications.filter((_, k) => k !== i) })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ certifications: [...v.certifications, { name: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addCertification")}
          </Button>
        </div>
      </Section>

      {/* Languages */}
      <Section id={id("lang")} icon={<Languages className="h-[18px] w-[18px]" />} title={t("languages")} count={v.languages.length} defaultOpen={v.languages.length > 0}>
        <div className="grid [&>*]:min-w-0 gap-3">
          {v.languages.map((l, i) => (
            <div key={i} className="grid [&>*]:min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
              <Input aria-label={t("languageName", { n: i + 1 })} placeholder={t("languagePh")} value={l.name} onChange={(x) => set({ languages: v.languages.map((y, k) => (k === i ? { ...y, name: x.target.value } : y)) })} />
              <Input aria-label={t("languageLevel", { n: i + 1 })} placeholder={t("levelPh")} value={l.level} onChange={(x) => set({ languages: v.languages.map((y, k) => (k === i ? { ...y, level: x.target.value } : y)) })} />
              <Button type="button" variant="ghost" size="icon" aria-label={t("remove", { item: l.name || t("language") })} onClick={() => set({ languages: v.languages.filter((_, k) => k !== i) })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => set({ languages: [...v.languages, { name: "", level: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("addLanguage")}
          </Button>
        </div>
      </Section>

      {/* Awards */}
      <Section id={id("awards")} icon={<BookOpen className="h-[18px] w-[18px]" />} title={t("awards")} count={v.awards.length} defaultOpen={v.awards.length > 0}>
        <TagInput id={id("awardsInput")} value={v.awards} onChange={(awards) => set({ awards })} max={20} placeholder={t("awardsPh")} />
      </Section>
    </div>
  );
}
