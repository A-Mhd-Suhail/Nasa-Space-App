import { expect, test, type Browser, type Page } from "@playwright/test";
import { enableMfa, pool, registerVerified, setRole, signIn, testPassword, uniq } from "./helpers";

/**
 * Deletion of scenarios, projects and workspaces: who may do it, the safety checks, the confirmation dialogs,
 * and the administrator option. Runs on the isolated stack only (it registers users).
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const tag = uniq();
const u = (n: string) => ({ email: `del-${n}-${tag}@example.test`, pw: testPassword(), name: `Del ${n}` });
const owner = u("owner");
const editor = u("editor");
const viewer = u("viewer");
const admin = u("admin");
const pages: Record<string, Page> = {};
let wsId = "";
let wsName = "";
let p1 = "";
let sOwner = "";
let sEditor = "";

/** Click until the dialog opens (the first click can land before React has hydrated the page). */
async function openDialog(page: Page, trigger: string) {
  const dlg = page.locator(`[data-testid="confirm-dialog"][open]`);
  await expect(async () => {
    if (!(await dlg.isVisible())) await page.getByTestId(trigger).click();
    await expect(dlg).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 30_000 });
  return dlg;
}
const scenarioBody = (projectId: string, name: string) => ({ projectId, name, site: { mode: "catalog", siteId: "mons-malapert" }, startUtc: "2026-11-15T00:00:00Z", endUtc: "2026-11-16T00:00:00Z", stepSeconds: 3600 });
async function newUser(browser: Browser, key: string, who: ReturnType<typeof u>) {
  const page = await (await browser.newContext()).newPage();
  await registerVerified(page, who.name, who.email, who.pw);
  pages[key] = page;
  return page;
}
async function id(email: string) {
  return (await pool.query(`select id from "user" where email = $1`, [email])).rows[0].id as string;
}

test("set up: shared workspace with an owner, an editor and a viewer", async ({ browser }) => {
  const o = await newUser(browser, "owner", owner);
  const e = await newUser(browser, "editor", editor);
  const v = await newUser(browser, "viewer", viewer);
  wsName = `Team ${tag}`;
  const ws = await (await o.request.post("/api/v1/workspaces", { data: { name: wsName } })).json();
  wsId = ws.workspace.id;
  for (const [pg, who, role] of [[e, editor, "editor"], [v, viewer, "viewer"]] as const) {
    expect((await o.request.post(`/api/v1/workspaces/${wsId}/members`, { data: { email: who.email, role } })).ok()).toBeTruthy();
    expect((await pg.request.post(`/api/v1/workspaces/${wsId}/switch`)).ok()).toBeTruthy();
  }
  expect((await o.request.post(`/api/v1/workspaces/${wsId}/switch`)).ok()).toBeTruthy();
  p1 = (await (await o.request.post("/api/v1/projects", { data: { name: `Study ${tag}` } })).json()).project.id;
  const so = await o.request.post("/api/v1/scenarios", { data: scenarioBody(p1, "Owner scenario") });
  expect(so.status(), await so.text()).toBe(201);
  sOwner = (await so.json()).scenario.id;
  const se = await e.request.post("/api/v1/scenarios", { data: scenarioBody(p1, "Editor scenario") });
  expect(se.status(), await se.text()).toBe(201);
  sEditor = (await se.json()).scenario.id;
});

test("permissions: viewers delete nothing, editors only what they created, outsiders cannot even see it", async ({ browser }) => {
  const [o, e, v] = [pages.owner, pages.editor, pages.viewer];
  expect((await v.request.delete(`/api/v1/scenarios/${sEditor}`)).status()).toBe(403);
  expect((await v.request.delete(`/api/v1/projects/${p1}`, { data: { confirmName: `Study ${tag}` } })).status()).toBe(403);
  expect((await v.request.delete(`/api/v1/workspaces/${wsId}`, { data: { confirmName: wsName } })).status()).toBe(403);
  // editor: not the owner's scenario, not the owner's project, not the workspace
  expect((await e.request.delete(`/api/v1/scenarios/${sOwner}`)).status()).toBe(403);
  expect((await e.request.delete(`/api/v1/projects/${p1}`, { data: { confirmName: `Study ${tag}` } })).status()).toBe(403);
  expect((await e.request.delete(`/api/v1/workspaces/${wsId}`, { data: { confirmName: wsName } })).status()).toBe(403);
  // a signed-in user outside the workspace gets 404 (existence is not revealed); an account role does not bypass it
  const out = await newUser(browser, "admin", admin);
  expect((await out.request.delete(`/api/v1/scenarios/${sOwner}`)).status()).toBe(404);
  expect((await out.request.delete(`/api/v1/projects/${p1}`, { data: { confirmName: `Study ${tag}` } })).status()).toBe(404);
  expect((await out.request.delete(`/api/v1/workspaces/${wsId}`, { data: { confirmName: wsName } })).status()).toBe(404);
  // anonymous
  expect((await (await browser.newContext()).request.delete(`/api/v1/scenarios/${sOwner}`)).status()).toBe(401);
  // the editor may delete a scenario they created; the owner's still exists
  const del = await e.request.delete(`/api/v1/scenarios/${sEditor}`);
  expect(del.status(), await del.text()).toBe(200);
  expect((await o.request.get(`/api/v1/scenarios/${sOwner}`)).status()).toBe(200);
  expect((await e.request.get(`/api/v1/scenarios/${sEditor}`)).status()).toBe(404);
  // the deletion was audited
  const aud = await pool.query(`select metadata from audit_events where action = 'scenario.delete' and object_id = $1`, [sEditor]);
  expect(aud.rowCount).toBe(1);
  expect(aud.rows[0].metadata.name).toBe("Editor scenario");
});

test("safety: nothing is deleted while an analysis is running; the project and workspace need the exact name; personal workspaces are protected", async () => {
  const o = pages.owner;
  const aid = `ana_${tag}`;
  const oid = await id(owner.email);
  await pool.query(`insert into analyses (id, workspace_id, scenario_id, status, created_by) values ($1, $2, $3, 'running', $4)`, [aid, wsId, sOwner, oid]);
  await pool.query(`insert into analysis_jobs (id, analysis_id, workspace_id, idempotency_key, status, created_by, lease_expires_at) values ($1, $2, $3, $4, 'running', $5, now() + interval '1 hour')`, [`job_${tag}`, aid, wsId, `k-${tag}`, oid]);
  const busy = await o.request.delete(`/api/v1/scenarios/${sOwner}`);
  expect(busy.status()).toBe(409);
  expect((await busy.json()).error.code).toBe("has_active_jobs");
  expect((await o.request.delete(`/api/v1/projects/${p1}`, { data: { confirmName: `Study ${tag}` } })).status()).toBe(409);
  expect((await o.request.delete(`/api/v1/workspaces/${wsId}`, { data: { confirmName: wsName } })).status()).toBe(409);
  expect((await o.request.get(`/api/v1/scenarios/${sOwner}`)).status()).toBe(200); // still there
  await pool.query(`update analysis_jobs set status = 'cancelled' where id = $1`, [`job_${tag}`]);
  await pool.query(`update analyses set status = 'cancelled' where id = $1`, [aid]);
  // exact name required
  expect((await o.request.delete(`/api/v1/projects/${p1}`, { data: { confirmName: "nope" } })).status()).toBe(422);
  expect((await o.request.delete(`/api/v1/workspaces/${wsId}`, { data: { confirmName: "nope" } })).status()).toBe(422);
  // personal workspace
  const mine = await (await o.request.get("/api/v1/workspaces")).json();
  const personal = (mine.workspaces as { id: string; personal: boolean }[]).find((w) => w.personal)!;
  expect((await o.request.delete(`/api/v1/workspaces/${personal.id}`, { data: { confirmName: "x" } })).status()).toBe(409);
  // the scenario can now be deleted and reports what it removed
  const ok = await o.request.delete(`/api/v1/scenarios/${sOwner}`);
  expect(ok.status(), await ok.text()).toBe(200);
  expect((await ok.json()).removed.analyses).toBe(1);
  expect((await pool.query(`select 1 from analyses where id = $1`, [aid])).rowCount).toBe(0);
});

test("UI: scenario and project deletion use a confirmation dialog; cancel keeps everything", async () => {
  const o = pages.owner;
  const sc = await (await o.request.post("/api/v1/scenarios", { data: scenarioBody(p1, "UI scenario") })).json();
  await o.goto(`/app/projects/${p1}`);
  const dlg = await openDialog(o, `scenario-delete-${sc.scenario.id}`);
  await expect(dlg).toContainText("UI scenario");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toBeHidden();
  expect((await o.request.get(`/api/v1/scenarios/${sc.scenario.id}`)).status()).toBe(200);
  await openDialog(o, `scenario-delete-${sc.scenario.id}`);
  await o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-delete").click();
  await expect(o.getByText("Scenario “UI scenario” deleted.")).toBeVisible();
  expect((await o.request.get(`/api/v1/scenarios/${sc.scenario.id}`)).status()).toBe(404);
  // project: the button stays disabled until the exact name is typed
  await openDialog(o, "project-delete");
  await expect(o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-delete")).toBeDisabled();
  await o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-typed").fill("wrong name");
  await expect(o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-delete")).toBeDisabled();
  await o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-typed").fill(`Study ${tag}`);
  await o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-delete").click();
  await expect(o).toHaveURL(/\/app\/projects$/);
  expect((await o.request.get(`/api/v1/projects/${p1}`)).status()).toBe(404);
  // a viewer sees no delete buttons at all
  const p2 = (await (await o.request.post("/api/v1/projects", { data: { name: `Second ${tag}` } })).json()).project.id;
  const v = pages.viewer;
  await v.goto(`/app/projects/${p2}`);
  await expect(v.getByRole("heading", { name: `Second ${tag}` })).toBeVisible();
  await expect(v.getByTestId("project-delete")).toHaveCount(0);
});

test("UI: an owner deletes a shared workspace through the dialog; the personal one has no delete control", async () => {
  const o = pages.owner;
  const w2 = await (await o.request.post("/api/v1/workspaces", { data: { name: `Disposable ${tag}` } })).json();
  await o.request.post(`/api/v1/workspaces/${w2.workspace.id}/switch`);
  await o.goto("/app/workspaces");
  await openDialog(o, "workspace-delete");
  await o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-typed").fill(`Disposable ${tag}`);
  await o.locator(`[data-testid="confirm-dialog"][open]`).getByTestId("confirm-delete").click();
  await expect(o.getByText(`Workspace “Disposable ${tag}” deleted.`)).toBeVisible();
  expect((await pool.query(`select 1 from workspaces where id = $1`, [w2.workspace.id])).rowCount).toBe(0);
  const aud = await pool.query(`select metadata from audit_events where action = 'workspace.delete' and object_id = $1`, [w2.workspace.id]);
  expect(aud.rowCount).toBe(1);
  await o.goto("/app/workspaces");
  await expect(o.getByTestId("workspace-delete")).toHaveCount(0); // now on the personal field book
});

test("admin: MFA is required; a reason and the exact name are required; personal workspaces are refused; the action is audited", async () => {
  const a = pages.admin;
  await setRole(admin.email, "admin");
  await signIn(a, admin.email, admin.pw);
  await a.waitForURL(/\/app/);
  // members' workspace owner is not an admin: the admin endpoint is closed to them
  expect((await pages.owner.request.delete(`/api/v1/admin/workspaces/${wsId}`, { data: { confirmName: wsName, reason: "because" } })).status()).toBe(403);
  // admin without MFA
  const noMfa = await a.request.delete(`/api/v1/admin/workspaces/${wsId}`, { data: { confirmName: wsName, reason: "cleanup" } });
  expect(noMfa.status()).toBe(403);
  expect((await noMfa.json()).error.code).toBe("mfa_required");
  await enableMfa(a.request, admin.pw);
  expect((await a.request.delete(`/api/v1/admin/workspaces/${wsId}`, { data: { confirmName: wsName } })).status()).toBe(422); // no reason
  expect((await a.request.delete(`/api/v1/admin/workspaces/${wsId}`, { data: { confirmName: "wrong", reason: "cleanup" } })).status()).toBe(422);
  const personalId = (await pool.query(`select w.id from workspaces w join "user" u on u.id = w.owner_user_id where u.email = $1 and w.personal`, [owner.email])).rows[0].id;
  expect((await a.request.delete(`/api/v1/admin/workspaces/${personalId}`, { data: { confirmName: "x", reason: "cleanup" } })).status()).toBe(409);
  expect((await a.request.delete(`/api/v1/admin/workspaces/ws_does_not_exist`, { data: { confirmName: "x", reason: "cleanup" } })).status()).toBe(404);
  // through the Administration page
  await a.goto("/admin/workspaces");
  await expect(a.getByRole("heading", { name: "Workspaces", level: 1 })).toBeVisible();
  await expect(a.getByTestId(`admin-ws-${personalId}`)).toContainText("Not deletable here");
  const dlg = await openDialog(a, `admin-ws-delete-${wsId}`);
  await expect(a.getByTestId("confirm-delete")).toBeDisabled();
  await a.getByTestId("confirm-typed").fill(wsName);
  await expect(a.getByTestId("confirm-delete")).toBeDisabled(); // still needs a reason
  await a.getByTestId("confirm-reason").fill("test cleanup by administrator");
  await a.getByTestId("confirm-delete").click();
  await expect(a.getByText(`Workspace “${wsName}” deleted.`)).toBeVisible();
  await expect(dlg).toBeHidden();
  expect((await pool.query(`select 1 from workspaces where id = $1`, [wsId])).rowCount).toBe(0);
  const aud = await pool.query(`select actor_user_id, metadata from audit_events where action = 'workspace.admin_delete' and object_id = $1`, [wsId]);
  expect(aud.rowCount).toBe(1);
  expect(aud.rows[0].metadata.reason).toBe("test cleanup by administrator");
  expect(aud.rows[0].metadata.via).toBe("admin");
});
