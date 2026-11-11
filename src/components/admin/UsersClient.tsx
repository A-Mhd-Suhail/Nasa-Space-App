"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../workspace/api";
import { Button, Card, Input, Notice, Select } from "../ui";

type U = { id: string; name: string; email: string; role: string; mfa: boolean; verified: boolean; status: string; createdAt: string };

export function UsersClient({ users, meId }: { users: U[]; meId: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Record<string, { role: string; reason: string }>>({});
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  return (
    <div className="space-y-3">
      {msg && <Notice tone={msg.tone}>{msg.t}</Notice>}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-xs text-muted"><tr>{["User", "Status", "MFA", "Role", "Change role (reason required)"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {users.map((u) => {
                const e = edit[u.id] ?? { role: u.role, reason: "" };
                return (
                  <tr key={u.id} className="border-t border-line">
                    <td className="px-3 py-2"><div className="font-medium">{u.name}</div><div className="text-xs text-muted">{u.email}{!u.verified && " · unverified"}</div></td>
                    <td className="px-3 py-2 text-xs capitalize">{u.status}</td>
                    <td className="px-3 py-2 text-xs">{u.mfa ? "on" : "off"}</td>
                    <td className="px-3 py-2 capitalize">{u.role}</td>
                    <td className="px-3 py-2">
                      {u.id === meId ? <span className="text-xs text-muted">You cannot change your own role</span> : (
                        <div className="flex flex-wrap items-center gap-2">
                          <Select aria-label={`New role for ${u.name}`} value={e.role} onChange={(ev) => setEdit({ ...edit, [u.id]: { ...e, role: ev.target.value } })} className="w-32">{["user", "analyst", "curator", "admin"].map((r) => <option key={r} value={r}>{r}</option>)}</Select>
                          <Input aria-label="Reason" placeholder="Reason" value={e.reason} onChange={(ev) => setEdit({ ...edit, [u.id]: { ...e, reason: ev.target.value } })} className="w-48" />
                          <Button s="sm" disabled={e.role === u.role || e.reason.trim().length < 3} onClick={async () => {
                            try {
                              await api(`/api/v1/admin/users/${u.id}/role`, { method: "PATCH", body: { role: e.role, reason: e.reason } });
                              setMsg({ tone: "ok", t: `${u.email}: ${u.role} → ${e.role}` });
                              router.refresh();
                            } catch (err) {
                              setMsg({ tone: "bad", t: (err as Error).message });
                            }
                          }}>Apply</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
