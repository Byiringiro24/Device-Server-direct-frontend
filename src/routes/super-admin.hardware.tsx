import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Cpu, KeyRound, RefreshCw, Save, Search, School, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { SuperAdminLayout } from "@/components/layout/SuperAdminLayout";
import { SuperAdminBreadcrumbs } from "@/components/layout/SuperAdminBreadcrumbs";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/super-admin/hardware")({ component: DirectWanDevicesPage });

type SchoolOption = { id: string; name: string };
type DirectDevice = {
  device_uid: string;
  device_name: string;
  assigned_name: string;
  school_id: string | null;
  school: { id: string; name: string } | null;
  remote_address: string | null;
  firmware_version: string | null;
  last_seen_at: string | null;
  is_online: boolean;
};
type Draft = { schoolId: string; assignedName: string };
type CredentialStatus = { configured: boolean; source: "superadmin" | "environment" | "none" };

function DirectWanDevicesPage() {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [devices, setDevices] = useState<DirectDevice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [credentialStatus, setCredentialStatus] = useState<CredentialStatus>({ configured: false, source: "none" });
  const [credentialInput, setCredentialInput] = useState("");
  const [savingCredential, setSavingCredential] = useState(false);

  const load = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    setLoadError("");
    const [schoolResult, deviceResult, credentialResult] = await Promise.allSettled([
        apiRequest<{ data: SchoolOption[] }>("/platform/schools?limit=500", { auth: "platform", returnMeta: true }),
        apiRequest<DirectDevice[]>("/platform/hardware/direct-devices", { auth: "platform" }),
        apiRequest<CredentialStatus>("/platform/hardware/direct-server-credentials", { auth: "platform" }),
    ]);

    if (schoolResult.status === "fulfilled") setSchools(schoolResult.value.data ?? []);
    else if (!quiet) setLoadError((schoolResult.reason as any)?.message || "Could not load schools");

    if (credentialResult.status === "fulfilled") setCredentialStatus(credentialResult.value);
    else if (!quiet) setLoadError(current => current || (credentialResult.reason as any)?.message || "Could not load credential settings");

    if (deviceResult.status === "fulfilled") {
      const discovered = deviceResult.value ?? [];
      setDevices(discovered);
      setDrafts(previous => {
        const next = { ...previous };
        for (const device of discovered) {
          if (!next[device.device_uid]) {
            next[device.device_uid] = {
              schoolId: device.school_id ?? "",
              assignedName: device.assigned_name || device.device_name || "FK device",
            };
          }
        }
        return next;
      });
    } else {
      const message = (deviceResult.reason as any)?.message || "Could not reach the FK Device-Server";
      setLoadError(current => current || message);
      if (quiet) toast.error(message);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  const saveCredential = async (token: string) => {
    setSavingCredential(true);
    try {
      const result = await apiRequest<CredentialStatus>("/platform/hardware/direct-server-credentials", {
        method: "PATCH", auth: "platform", body: JSON.stringify({ token }),
      });
      setCredentialStatus(result);
      setCredentialInput("");
      toast.success(token ? "FK Device-Server credential saved securely" : "Super Admin credential removed");
    } catch (error: any) {
      toast.error(error?.message || "Could not update FK Device-Server credential");
    } finally {
      setSavingCredential(false);
    }
  };

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter(device => [device.device_uid, device.device_name, device.assigned_name, device.school?.name]
      .some(value => String(value || "").toLowerCase().includes(q)));
  }, [devices, search]);

  const saveAssignment = async (device: DirectDevice) => {
    const draft = drafts[device.device_uid];
    if (!draft?.schoolId) { toast.error("Select a school first"); return; }
    if (!draft.assignedName.trim()) { toast.error("Enter a display name for this device"); return; }
    setSaving(device.device_uid);
    try {
      await apiRequest(`/platform/hardware/direct-devices/${encodeURIComponent(device.device_uid)}/assignment`, {
        method: "PATCH",
        auth: "platform",
        body: JSON.stringify({ school_id: draft.schoolId, assigned_name: draft.assignedName.trim() }),
      });
      toast.success("Device assigned to the school");
      await load(true);
    } catch (error: any) {
      toast.error(error?.message || "Could not assign device");
    } finally {
      setSaving(null);
    }
  };

  const onlineCount = devices.filter(device => device.is_online).length;
  const unassignedCount = devices.filter(device => !device.school_id).length;

  return <SuperAdminLayout
    title="Direct WAN Devices"
    subtitle="Discover FK terminals, set clear names, and assign them to schools"
    breadcrumbs={<SuperAdminBreadcrumbs items={[{ label: "Super Admin", to: "/super-admin" }, { label: "Direct WAN Devices" }]} />}
  >
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <Metric label="Discovered devices" value={devices.length} icon={<Cpu className="h-4 w-4" />} />
      <Metric label="Online now" value={onlineCount} icon={<Wifi className="h-4 w-4" />} tone="green" />
      <Metric label="Awaiting school assignment" value={unassignedCount} icon={<School className="h-4 w-4" />} tone="amber" />
    </div>

    <section className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><KeyRound className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base font-bold">FK Device-Server authorization</h2>
          <p className="mt-1 text-sm text-muted-foreground">Set the bearer token used by this backend to call the direct device server. The secret is encrypted in the database and never sent back to the browser.</p>
          <p className="mt-2 text-xs font-medium text-muted-foreground">
            {credentialStatus.configured
              ? credentialStatus.source === "superadmin" ? "A Super Admin managed token is active." : "A server environment token is active."
              : "No token is configured; this works only if the device server allows trusted localhost access without authentication."}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input type="password" autoComplete="new-password" value={credentialInput} onChange={event => setCredentialInput(event.target.value)}
              aria-label="FK Device-Server bearer token" placeholder="Enter a new bearer token" className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
            <button type="button" onClick={() => void saveCredential(credentialInput)} disabled={savingCredential || !credentialInput.trim()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              <Save className="h-4 w-4" />{savingCredential ? "Saving…" : "Save token"}
            </button>
            {credentialStatus.source === "superadmin" && <button type="button" onClick={() => void saveCredential("")} disabled={savingCredential}
              className="h-10 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">Remove</button>}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">JWT signing secrets remain server-managed in `.env`; they are not exposed or editable here.</p>
        </div>
      </div>
    </section>

    <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <label className="relative block w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search ID, device name, or school"
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      </label>
      <button onClick={() => void load(true)} disabled={refreshing || loading}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} /> Refresh
      </button>
    </div>

    {loadError && <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{loadError}</div>}
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-display text-lg font-bold">FK terminals</h2>
        <p className="mt-1 text-sm text-muted-foreground">The device ID is learned automatically from its WAN connection. Use a distinct label to recognize each terminal.</p>
      </div>
      {loading ? <div className="px-5 py-14 text-center text-sm text-muted-foreground">Loading devices…</div>
        : visibleDevices.length === 0 ? <div className="px-5 py-14 text-center">
          <Cpu className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="font-semibold">{search ? "No matching devices" : "No FK terminals discovered yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Set the terminal to WAN mode and point it to the direct Device-Server.</p>
        </div> : <div className="divide-y divide-border">
          {visibleDevices.map(device => {
            const draft = drafts[device.device_uid] ?? { schoolId: device.school_id ?? "", assignedName: device.assigned_name || device.device_name };
            const unchanged = draft.schoolId === (device.school_id ?? "") && draft.assignedName.trim() === device.assigned_name;
            return <div key={device.device_uid} className="grid gap-4 px-5 py-5 xl:grid-cols-[minmax(240px,1.2fr)_minmax(220px,1fr)_minmax(220px,1fr)_auto] xl:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", device.is_online ? "bg-emerald-500" : "bg-slate-300")} /><p className="truncate font-semibold">{device.assigned_name || device.device_name}</p></div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{device.device_uid}</p>
                <p className="mt-1 text-xs text-muted-foreground">Terminal name: {device.device_name || "Unknown"}</p>
              </div>
              <div className="text-sm">
                <p className={cn("inline-flex items-center gap-1.5 font-semibold", device.is_online ? "text-emerald-700" : "text-muted-foreground")}>{device.is_online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{device.is_online ? "Online" : "Offline"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Last contact: {device.last_seen_at ? new Date(device.last_seen_at).toLocaleString() : "Never seen"}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{device.firmware_version || "Firmware not reported"}{device.remote_address ? ` · ${device.remote_address}` : ""}</p>
                <p className="mt-1 text-xs text-muted-foreground">School: {device.school?.name || "Unassigned"}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <input value={draft.assignedName} maxLength={100} onChange={event => setDrafts(current => ({ ...current, [device.device_uid]: { ...draft, assignedName: event.target.value } }))}
                  aria-label={`Ecareafrica name for ${device.device_uid}`} placeholder="Distinct device name" className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
                <select value={draft.schoolId} onChange={event => setDrafts(current => ({ ...current, [device.device_uid]: { ...draft, schoolId: event.target.value } }))}
                  aria-label={`School for ${device.device_uid}`} className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                  <option value="">Choose a school</option>{schools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
              </div>
              <button onClick={() => void saveAssignment(device)} disabled={saving === device.device_uid || unchanged || !draft.schoolId}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">
                {saving === device.device_uid ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{device.school ? "Save assignment" : "Assign to school"}
              </button>
            </div>;
          })}
        </div>}
    </div>
  </SuperAdminLayout>;
}

function Metric({ label, value, icon, tone = "blue" }: { label: string; value: number; icon: ReactNode; tone?: "blue" | "green" | "amber" }) {
  const styles = tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700";
  return <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-4"><div className={cn("grid h-10 w-10 place-items-center rounded-lg", styles)}>{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></div>;
}
