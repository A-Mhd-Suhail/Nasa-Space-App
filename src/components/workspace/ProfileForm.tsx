"use client";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Button, Card, CardHeader, Field, Input, Notice, Select } from "../ui";
import { api } from "./api";

const noopSubscribe = () => () => {};
const serverZones: string[] = [];
const getServerZones = () => serverZones;
let cachedZones: string[] | null = null;
const browserZones = () => (cachedZones ??= "supportedValuesOf" in Intl ? (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone") : []);

export function ProfileForm({ user }: { user: { name: string; email: string; preferredMode: string; displayTimezone: string; role: string } }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; t: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  // The browser's own zone list differs between engines (Firefox and Safari differ from Node and Chromium), so it must
  // not be used while hydrating: React renders the server snapshot first, then switches to the browser's list.
  const zones = useSyncExternalStore(noopSubscribe, browserZones, getServerZones);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Profile" subtitle={`${user.email} · role ${user.role}`} />
        <form className="grid gap-4 p-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            await api("/api/v1/me", { method: "PATCH", body: { name: String(f.get("name")), preferredMode: String(f.get("mode")), displayTimezone: String(f.get("tz")) } });
            setMsg({ tone: "ok", t: "Saved." });
            router.refresh();
          } catch (e2) {
            setMsg({ tone: "bad", t: (e2 as Error).message });
          }
        }}>
          <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={user.name} maxLength={80} /></Field>
          <Field label="Preferred mode" htmlFor="mode"><Select id="mode" name="mode" defaultValue={user.preferredMode}><option value="planning">Mission planning</option><option value="learn">Learn</option><option value="explore">Public exploration</option></Select></Field>
          <Field label="Display time zone" htmlFor="tz" hint="Analyses and exports always use UTC."><Select id="tz" name="tz" defaultValue={user.displayTimezone}>{["UTC", ...new Set([...zones, user.displayTimezone].filter((z) => z !== "UTC"))].map((z) => <option key={z} value={z}>{z}</option>)}</Select></Field>
          <div className="flex items-end"><Button type="submit" variant="primary">Save</Button></div>
          {msg && <div className="sm:col-span-2"><Notice tone={msg.tone}>{msg.t}</Notice></div>}
        </form>
      </Card>
      <Card>
        <CardHeader title="Your data" />
        <div className="flex flex-wrap items-center gap-3 p-4 text-sm text-text-2">
          <a href="/api/v1/me/export" className="inline-flex h-9 items-center rounded-md border border-line-2 bg-panel-2 px-3 text-text hover:bg-panel-3">Export my data (JSON)</a>
          <span>Projects, scenarios, analysis metadata, reports and share-link records.</span>
        </div>
      </Card>
      <Card className="border-bad/40">
        <CardHeader title="Delete account" subtitle="Removes your workspaces, credentials and sessions and anonymises your user record. Audit history and public source provenance are retained." />
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label='Type "DELETE" to confirm' htmlFor="del"><Input id="del" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <Button variant="danger" disabled={confirm !== "DELETE"} onClick={async () => { await api("/api/v1/me", { method: "DELETE", body: { confirm: "DELETE" } }); router.push("/"); router.refresh(); }}>Delete my account</Button>
        </div>
      </Card>
    </div>
  );
}
