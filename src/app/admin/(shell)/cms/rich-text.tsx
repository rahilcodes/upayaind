"use client";
import * as React from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useTranslations } from "next-intl";
import {
  Bold, Code, Heading2, Heading3, Heading4, ImagePlus, Italic, Link2, Link2Off, List, ListOrdered, Minus, Pilcrow, Quote, Redo2, Strikethrough, Underline, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, fieldA11y } from "@/components/ui/input";
import { ImageUploadForm, type Uploaded } from "./image-upload";

/**
 * Tiptap editor for CMS bodies. The schema here MUST match cmsExtensions() in
 * src/server/services/cms.ts — the server re-renders HTML from the JSON with
 * an allow-list, so anything else is dropped on save.
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { target: null, rel: null, class: null } },
    codeBlock: { HTMLAttributes: { class: null } },
    trailingNode: false,
  }),
  Image.configure({ inline: false, allowBase64: false }),
];

function validLink(v: string) {
  const s = v.trim();
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(s)) return s;
  try {
    const u = new URL(/^[a-z]+:/i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function Tool({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-[8px] text-muted-foreground hover:bg-surface-muted hover:text-foreground disabled:opacity-40",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, onLink, onImage }: { editor: Editor; onLink: () => void; onImage: () => void }) {
  const t = useTranslations("cms.toolbar");
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      p: e.isActive("paragraph"),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();
  const ic = "h-[18px] w-[18px]";
  return (
    <div role="toolbar" aria-label={t("label")} className="flex flex-wrap items-center gap-0.5 border-b border-border bg-surface px-2 py-1.5">
      <Tool label={t("paragraph")} active={s.p} onClick={() => c().setParagraph().run()}>
        <Pilcrow className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("h2")} active={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
        <Heading2 className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("h3")} active={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
        <Heading3 className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("h4")} active={s.h4} onClick={() => c().toggleHeading({ level: 4 }).run()}>
        <Heading4 className={ic} aria-hidden="true" />
      </Tool>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Tool label={t("bold")} active={s.bold} onClick={() => c().toggleBold().run()}>
        <Bold className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("italic")} active={s.italic} onClick={() => c().toggleItalic().run()}>
        <Italic className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("underline")} active={s.underline} onClick={() => c().toggleUnderline().run()}>
        <Underline className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("strike")} active={s.strike} onClick={() => c().toggleStrike().run()}>
        <Strikethrough className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("code")} active={s.code} onClick={() => c().toggleCode().run()}>
        <Code className={ic} aria-hidden="true" />
      </Tool>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Tool label={t("bulletList")} active={s.ul} onClick={() => c().toggleBulletList().run()}>
        <List className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("orderedList")} active={s.ol} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("blockquote")} active={s.quote} onClick={() => c().toggleBlockquote().run()}>
        <Quote className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("hr")} onClick={() => c().setHorizontalRule().run()}>
        <Minus className={ic} aria-hidden="true" />
      </Tool>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Tool label={t("link")} active={s.link} onClick={onLink}>
        <Link2 className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("unlink")} disabled={!s.link} onClick={() => c().extendMarkRange("link").unsetLink().run()}>
        <Link2Off className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("image")} onClick={onImage}>
        <ImagePlus className={ic} aria-hidden="true" />
      </Tool>
      <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
      <Tool label={t("undo")} disabled={!s.canUndo} onClick={() => c().undo().run()}>
        <Undo2 className={ic} aria-hidden="true" />
      </Tool>
      <Tool label={t("redo")} disabled={!s.canRedo} onClick={() => c().redo().run()}>
        <Redo2 className={ic} aria-hidden="true" />
      </Tool>
    </div>
  );
}

export function RichTextEditor({ value, onChange, labelId, invalid }: { value: unknown; onChange: (doc: unknown) => void; labelId: string; invalid?: boolean }) {
  const t = useTranslations("cms");
  const tc = useTranslations("common");
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [imageOpen, setImageOpen] = React.useState(false);
  const [link, setLink] = React.useState("");
  const [linkErr, setLinkErr] = React.useState<string | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: editorExtensions,
    content: (value as object) ?? "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "cms-editor min-h-[320px] px-5 py-4 focus:outline-none",
        "aria-labelledby": labelId,
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
  });

  // External resets (restore revision) replace the content.
  const last = React.useRef<string>("");
  React.useEffect(() => {
    if (!editor) return;
    const json = JSON.stringify(value);
    if (json !== last.current && json !== JSON.stringify(editor.getJSON())) editor.commands.setContent(value as object, { emitUpdate: false });
    last.current = json;
  }, [editor, value]);

  function openLink() {
    if (!editor) return;
    setLink((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkErr(null);
    setLinkOpen(true);
  }
  function applyLink(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    if (!link.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = validLink(link);
    if (!href) {
      setLinkErr(t("toolbar.linkInvalid"));
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkOpen(false);
  }
  function insertImage(img: Uploaded) {
    editor?.chain().focus().setImage({ src: img.src, alt: img.alt, ...(img.width ? { width: img.width, height: img.height ?? undefined } : {}) } as never).run();
    setImageOpen(false);
  }

  return (
    <div className={cn("overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] bg-surface focus-within:border-primary focus-within:ring-[3px] focus-within:ring-ring", invalid ? "border-danger" : "border-border-strong")}>
      {editor ? <Toolbar editor={editor} onLink={openLink} onImage={() => setImageOpen(true)} /> : <div className="h-[53px] border-b border-border" />}
      <EditorContent editor={editor} />
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent title={t("toolbar.link")}>
          <form onSubmit={applyLink} className="flex flex-col gap-4">
            <Field id="cms-link" label={t("toolbar.linkPrompt")} error={linkErr}>
              <Input {...fieldA11y("cms-link", linkErr)} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" autoFocus inputMode="url" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setLinkOpen(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit">{t("toolbar.link")}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent title={t("image.dialogTitle")}>
          <ImageUploadForm submitLabel={t("image.insert")} onUploaded={insertImage} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
