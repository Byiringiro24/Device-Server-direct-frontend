import { useCallback, useEffect, useState } from "react";
import { Activity, LoaderCircle, RefreshCw, Send, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/api";

type DirectDevice = { id: string; device_uid?: string; name: string; is_online: boolean; last_seen_at?: string | null; last_status_message?: string | null };
type DeviceLog = { id: string; first_name?: string | null; last_name?: string | null; student_id_number?: string | null; event_type?: string | null; scan_method?: string | null; scanned_at?: string | null };
type DeviceUser = { userId: string; name?: string | null; biometricMethods?: string[]; lastPulledAt?: string | null };

export default function DeviceManagement() {
  const [devices, setDevices] = useState<DirectDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [users, setUsers] = useState<DeviceUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pullingUsers, setPullingUsers] = useState(false);
  const [pullingLogs, setPullingLogs] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<DirectDevice[]>("/devices/live-status", { auth: "school" });
      const list = Array.isArray(result) ? result : [];
      setDevices(list);
      setSelectedId(current => list.some(device => device.id === current) ? current : list[0]?.id ?? "");
    } catch (error: any) { toast.error(error?.message ?? "Could not load direct devices"); }
    finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async (id: string) => {
    if (!id) { setLogs([]); return; }
    try {
      const result = await apiRequest<{ data?: DeviceLog[] } | DeviceLog[]>(
        "/devices/" + encodeURIComponent(id) + "/logs?limit=50&page=1",
        { auth: "school", returnMeta: true }
      );
      setLogs(Array.isArray(result) ? result : result.data ?? []);
    } catch (error: any) { setLogs([]); toast.error(error?.message ?? "Could not load device attendance"); }
  }, []);

  const loadUsers = useCallback(async (id: string) => {
    if (!id) { setUsers([]); return; }
    try {
      const result = await apiRequest<DeviceUser[]>("/devices/" + encodeURIComponent(id) + "/users", { auth: "school" });
      setUsers(Array.isArray(result) ? result : []);
    } catch { setUsers([]); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    void loadLogs(selectedId);
    void loadUsers(selectedId);
    if (!selectedId) return;
    const timer = window.setInterval(() => { void loadLogs(selectedId); void loadUsers(selectedId); }, 15000);
    return () => window.clearInterval(timer);
  }, [selectedId, loadLogs, loadUsers]);

  const pushAllStudents = async () => {
    if (!selectedId || !window.confirm("Push all active students to this directly connected FK device?")) return;
    setPushing(true);
    try {
      const result = await apiRequest<any>("/devices/" + encodeURIComponent(selectedId) + "/push-students", {
        method: "POST", auth: "school", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "all" }),
      });
      toast.success("Push finished: " + (result.pushed_count ?? 0) + " sent, " + (result.failed_count ?? 0) + " failed");
    } catch (error: any) { toast.error(error?.message ?? "Could not push students to the FK device"); }
    finally { setPushing(false); }
  };

  const pullUsers = async () => {
    if (!selectedId) return;
    setPullingUsers(true);
    try {
      await apiRequest("/devices/" + encodeURIComponent(selectedId) + "/users/pull", { method: "POST", auth: "school" });
      toast.success("Device user and biometric refresh queued. The list updates as the terminal responds.");
    } catch (error: any) { toast.error(error?.message ?? "Could not queue user refresh"); }
    finally { setPullingUsers(false); }
  };

  const pullLogs = async () => {
    if (!selectedId) return;
    setPullingLogs(true);
    try {
      await apiRequest("/devices/" + encodeURIComponent(selectedId) + "/logs/pull", { method: "POST", auth: "school" });
      toast.success("Full attendance log pull queued. New records will appear after the terminal responds.");
    } catch (error: any) { toast.error(error?.message ?? "Could not queue log pull"); }
    finally { setPullingLogs(false); }
  };

  const selected = devices.find(device => device.id === selectedId);
  return <AppLayout title="Direct Devices" subtitle="FK terminals connect directly to the server over WAN">
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Devices are discovered from their server polls. Attendance records sync through the direct server connection.</p>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh
        </button>
      </div>
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 font-semibold">School devices</h2>
        {devices.length === 0 ? <p className="text-sm text-muted-foreground">No direct FK devices are assigned to this school yet.</p> :
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{devices.map(device =>
            <button key={device.id} type="button" onClick={() => setSelectedId(device.id)} className={"rounded-lg border p-4 text-left " + (selectedId === device.id ? "border-primary ring-2 ring-primary/20" : "")}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{device.name}</span>{device.is_online ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}</div>
              <div className="mt-2 text-xs text-muted-foreground">{device.device_uid ?? device.id}</div>
              <div className="mt-1 text-xs">{device.is_online ? "Online via WAN" : "Offline"}{device.last_seen_at ? " · " + new Date(device.last_seen_at).toLocaleString() : ""}</div>
            </button>
          )}</div>}
      </section>
      {selected && <section className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold">{selected.name}</h2><p className="text-xs text-muted-foreground">{selected.last_status_message ?? (selected.is_online ? "Direct FK WAN connection" : "Waiting for next device poll")}</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void pullUsers()} disabled={!selected.is_online || pullingUsers} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
              {pullingUsers ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Pull users and biometrics
            </button>
            <button type="button" onClick={() => void pullLogs()} disabled={!selected.is_online || pullingLogs} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
              {pullingLogs ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} Pull all logs
            </button>
            <button type="button" onClick={() => void pushAllStudents()} disabled={!selected.is_online || pushing} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              {pushing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Push active students
            </button>
          </div>
        </div>
        <div className="mb-5">
          <h3 className="mb-2 text-sm font-semibold">Device users and biometric methods ({users.length})</h3>
          {users.length ? <div className="max-h-64 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-card"><tr className="border-b text-muted-foreground"><th className="px-3 py-2">Device user ID</th><th>Name</th><th>Biometric methods</th></tr></thead><tbody>{users.map(user => <tr className="border-b last:border-0" key={user.userId}><td className="px-3 py-2 font-mono">{user.userId}</td><td>{user.name || "—"}</td><td>{user.biometricMethods?.length ? user.biometricMethods.join(", ") : "None reported"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No device user cache yet. Pull users while the terminal is online to populate it.</p>}
        </div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" /> Recent attendance</h3>
        {logs.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2">Student</th><th>Event</th><th>Method</th><th>Time</th></tr></thead><tbody>{logs.map(log => <tr className="border-b last:border-0" key={log.id}><td className="py-2">{[log.first_name, log.last_name].filter(Boolean).join(" ") || log.student_id_number || "Unknown user"}</td><td>{log.event_type ?? "Attendance"}</td><td>{log.scan_method ?? "—"}</td><td>{log.scanned_at ? new Date(log.scanned_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No attendance records yet. The server stores scans as the terminal sends them.</p>}
      </section>}
    </div>
  </AppLayout>;
}
