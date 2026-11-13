"use client";
import { Check, LogOut, Trash2, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, CardHeader, cx, Field, Input, Notice, Select, StatusBadge } from "../ui";
import { ConfirmDialog } from "../ConfirmDialog";
import { api } from "./api";

type W = { id: string; name: string; role: string; personal: boolean; members: number };
type M = { userId: string; name: string; email: string; role: string; since: string };
type Inv = { id: string; email: string; role: string; expiresAt: string; createdAt: string };

export function WorkspacesClient({ workspaces, currentId, me }: { workspaces: W[]; currentId: string; me: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const joined = search.get("joined");
  const [sel, setSel] = useState(currentId);
  const [members, setMembers] = useState<M[] | null>(null);
  const [invitations, setInvitations] = useState<Inv[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);
  const w = workspaces.find((x) => x.id === sel) ?? workspaces[0];
  const owner = w.role === "owner";

  useEffect(() => {
    let live = true;
    api<{ members: M[] }>(`/api/v1/workspaces/${w.id}/members`).then((d) => live && setMembers(d.members)).catch(() => live && setMembers([]));
    api<{ invitations: Inv[] }>(`/api/v1/workspaces/${w.id}/invitations`).then((d) => live && setInvitations(d.invitations)).catch(() => live && setInvitations([]));
    return () => { live = false; };
  }, [w.id]);
  const reload = async () => {
    const [m, i] = await Promise.all([
      api<{ members: M[] }>(`/api/v1/workspaces/${w.id}/members`),
      api<{ invitations: Inv[] }>(`/api/v1/workspaces/${w.id}/invitations`),
    ]);
    setMembers(m.members);
    setInvitations(i.invitations);
  };
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: "ok", t: ok }); await reload(); router.refresh(); } catch (e) { setMsg({ tone: "bad", t: (e as Error).message }); }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
      <div className="space-y-4">
        {joined && <Notice tone="ok">You joined “{joined}”. Make it current to start working in it.</Notice>}
        <Card>
          <CardHeader title="Your workspaces" />
          <ul className="p-1.5">
            {workspaces.map((x) => (
              <li key={x.id}>
                <button type="button" onClick={() => setSel(x.id)} aria-pressed={x.id === sel} className={cx("flex w-full items-center gap-2 rounded-[4px] px-3 py-2.5 text-left text-sm", x.id === sel ? "bg-accent-soft" : "hover:bg-panel-3/60")}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{x.name}</span>
                    <span className="block text-xs capitalize text-muted">{x.personal ? "Personal" : `Shared · ${x.members} members`} · {x.role}</span>
                  </span>
                  {x.id === currentId && <span title="Current workspace"><Check size={15} className="text-accent" /></span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="New shared workspace" />
          <form className="space-y-3 p-4" onSubmit={async (e) => { e.preventDefault(); await act(async () => { const r = await api<{ workspace: { id: string } }>("/api/v1/workspaces", { method: "POST", body: { name: newName } }); setSel(r.workspace.id); setNewName(""); }, "Workspace created."); }}>
            <Field label="Name" htmlFor="wsname"><Input id="wsname" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} placeholder="e.g. Artemis traverse study" /></Field>
            <Button type="submit" variant="primary" className="w-full" disabled={!newName.trim()}>Create workspace</Button>
          </form>
        </Card>
      </div>
      <div className="space-y-4">
        {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
        <Card>
          <CardHeader
            title={w.name}
            tag={<StatusBadge status={w.id === currentId ? "active" : "queued"} className={w.id === currentId ? "" : "hidden"} />}
            subtitle={w.personal ? "Personal field book — private to you." : `Your role: ${w.role}`}
            actions={w.id !== currentId ? <Button s="sm" variant="primary" onClick={() => act(() => api(`/api/v1/workspaces/${w.id}/switch`, { method: "POST" }), `Switched to ${w.name}.`)}>Make current</Button> : null}
          />
          {owner && (
            <form className="flex flex-wrap items-end gap-3 border-b border-line p-5" onSubmit={async (e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("rename") ?? ""); await act(() => api(`/api/v1/workspaces/${w.id}`, { method: "PATCH", body: { name } }), "Renamed."); }}>
              <div className="min-w-60 flex-1"><Field label="Rename" htmlFor="rename"><Input id="rename" name="rename" defaultValue={w.name} key={w.id} maxLength={80} /></Field></div>
              <Button type="submit">Save name</Button>
            </form>
          )}
          <div className="p-5">
            <h3 className="mb-3 text-[13px] font-semibold">Members</h3>
            {members === null ? <div className="h-16 animate-pulse rounded bg-panel-2" /> : (
              <ul className="divide-y divide-line rounded-[5px] border border-line">
                {members.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1"><span className="block font-medium">{m.name}{m.userId === me && <span className="ml-1.5 text-xs text-muted">(you)</span>}</span><span className="block truncate text-xs text-muted">{m.email}</span></span>
                    {owner && m.role !== "owner" ? (
                      <Select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => act(() => api(`/api/v1/workspaces/${w.id}/members/${m.userId}`, { method: "PATCH", body: { role: e.target.value } }), "Role updated.")} className="w-28"><option value="editor">editor</option><option value="viewer">viewer</option></Select>
                    ) : <span className="text-xs capitalize text-muted">{m.role}</span>}
                    {owner && m.role !== "owner" && <Button s="sm" variant="ghost" aria-label={`Remove ${m.name}`} onClick={() => act(() => api(`/api/v1/workspaces/${w.id}/members/${m.userId}`, { method: "DELETE" }), "Member removed.")}><Trash2 size={14} /></Button>}
                    {!owner && m.userId === me && !w.personal && <Button s="sm" variant="ghost" onClick={() => act(() => api(`/api/v1/workspaces/${w.id}/members/${me}`, { method: "DELETE" }), "You left the workspace.")}><LogOut size={14} /> Leave</Button>}
                  </li>
                ))}
              </ul>
            )}
            {owner && !w.personal && (
              <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); await act(async () => { const r = await api<{ message: string; invitation?: { token: string; email: string } }>(`/api/v1/workspaces/${w.id}/invitations`, { method: "POST", body: { email: String(f.get("email")), role: String(f.get("role")) } }); setMsg({ tone: "ok", t: r.invitation ? `${r.message} Share link: ${location.origin}/invite/${r.invitation.token}` : r.message }); }, "Invitation sent."); (e.target as HTMLFormElement).reset(); }}>
                <div className="min-w-60 flex-1"><Field label="Invite by email" htmlFor="memail" hint="They get a 7-day invitation link. New users can register from the link. Existing verified users are added directly."><Input id="memail" name="email" type="email" required /></Field></div>
                <Field label="Role" htmlFor="mrole"><Select id="mrole" name="role" defaultValue="editor" className="w-28"><option value="editor">editor</option><option value="viewer">viewer</option></Select></Field>
                <Button type="submit" variant="primary"><UserPlus size={15} /> Invite</Button>
              </form>
            )}
            {owner && !w.personal && invitations && invitations.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-2 text-[13px] font-semibold">Pending invitations</h4>
                <ul className="divide-y divide-line rounded-[5px] border border-line">
                  {invitations.map((inv) => (
                    <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1"><span className="block truncate">{inv.email}</span><span className="block text-xs text-muted capitalize">{inv.role} · expires {new Date(inv.expiresAt).toLocaleDateString()}</span></span>
                      <Button s="sm" variant="ghost" onClick={() => act(() => api(`/api/v1/workspaces/${w.id}/invitations/${inv.id}`, { method: "DELETE" }), "Invitation revoked.")}>Revoke</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {w.personal && <p className="mt-4 text-sm text-muted">Personal field books cannot be shared. Create a shared workspace to collaborate.</p>}
          </div>
          {owner && !w.personal && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bad-soft/40 p-5">
              <p className="min-w-60 flex-1 text-sm text-text-2">Deleting a workspace permanently removes its projects, scenarios, analyses, reports, share links and saved locations for every member.</p>
              <Button variant="danger" data-testid="workspace-delete" onClick={() => { setDelErr(null); setDelOpen(true); }}><Trash2 size={15} /> Delete workspace</Button>
            </div>
          )}
          <ConfirmDialog open={delOpen} title="Delete this workspace?" confirmLabel="Delete workspace" requireText={w.name} busy={delBusy} error={delErr} onClose={() => !delBusy && setDelOpen(false)}
            onConfirm={async () => {
              setDelBusy(true); setDelErr(null);
              try {
                await api(`/api/v1/workspaces/${w.id}`, { method: "DELETE", body: { confirmName: w.name } });
                setDelOpen(false);
                setSel(currentId === w.id ? workspaces.find((x) => x.personal)?.id ?? workspaces.find((x) => x.id !== w.id)?.id ?? currentId : currentId);
                setMsg({ tone: "ok", t: `Workspace “${w.name}” deleted.` });
                router.refresh();
              } catch (e) { setDelErr((e as Error).message); } finally { setDelBusy(false); }
            }}>
            <p><strong className="text-text">{w.name}</strong> has {w.members} member{w.members === 1 ? "" : "s"}. Everything inside it will be permanently deleted for all of them.</p>
            <p>This cannot be undone. It is refused while any analysis in it is still queued or running. The audit record is kept.</p>
          </ConfirmDialog>
        </Card>
      </div>
    </div>
  );
}
