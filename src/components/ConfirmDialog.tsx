"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, Field, Input, Notice } from "./ui";

/**
 * Modal confirmation for destructive actions. Uses the native <dialog> (focus trap, Esc to close, inert page behind it).
 * Focus starts on Cancel so an accidental Enter never deletes. `requireText` makes the user type an exact name;
 * `askReason` collects a short audited reason (administrators).
 */
export function ConfirmDialog({ open, title, children, confirmLabel, requireText, askReason, busy, error, onConfirm, onClose }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  requireText?: string;
  askReason?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: (v: { typed: string; reason: string }) => void | Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTyped("");
      setReason("");
      d.showModal();
      cancelRef.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  const ok = (!requireText || typed.trim() === requireText.trim()) && (!askReason || reason.trim().length >= 3);
  return (
    <dialog ref={ref} aria-labelledby={`${id}-t`} role="alertdialog" onClose={onClose} onCancel={(e) => { if (busy) e.preventDefault(); }} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[8px] border border-line bg-panel p-0 text-text shadow-xl backdrop:bg-black/50" data-testid="confirm-dialog">
      {open && <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (ok && !busy) void onConfirm({ typed, reason }); }} className="space-y-4 p-5">
        <h2 id={`${id}-t`} className="text-base font-semibold">{title}</h2>
        <div className="space-y-2 text-sm text-text-2">{children}</div>
        {requireText && <Field label={<>Type <strong className="font-semibold text-text">{requireText}</strong> to confirm</>} htmlFor={`${id}-c`}><Input id={`${id}-c`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" data-testid="confirm-typed" /></Field>}
        {askReason && <Field label="Reason (audited)" htmlFor={`${id}-r`}><Input id={`${id}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoComplete="off" data-testid="confirm-reason" /></Field>}
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef as never} type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="danger" disabled={!ok || busy} data-testid="confirm-delete">{busy ? "Deleting…" : confirmLabel}</Button>
        </div>
      </form>}
    </dialog>
  );
}
