import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Activity, Clock3, LoaderCircle, RefreshCw, Send, ShieldAlert, Trash2, UserRound, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/api";

type DirectDevice = { id: string; name: string; location?: string | null; is_online: boolean; last_seen_at?: string | null };
type DeviceLog = { id: string; first_name?: string | null; last_name?: string | null; student_id_number?: string | null; event_type?: string | null; scan_method?: string | null; scanned_at?: string | null; attendance_period?: string | null; status?: string | null };
type DeviceUser = { userId: string; name?: string | null; biometricMethods?: string[]; studentId?: string | null; studentNumber?: string | null; studentName?: string | null; matchStatus?: "matched" | "unmatched" | "ambiguous" };
type CandidateStudent = { id: string; student_id_number: string; first_name: string; last_name: string };
type DangerAction = { kind: "remove-selected" | "remove-all" | "clear-logs"; count: number };

const niceName = (value?: string | null) => value?.trim() || "Unknown user";

export default function DeviceManagement() {
  const [devices, setDevices] = useState<DirectDevice[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [logs, setLogs] = useState<DeviceLog[]>([]);
  const [users, setUsers] = useState<DeviceUser[]>([]);
  const [candidates, setCandidates] = useState<CandidateStudent[]>([]);
  const [matchSelections, setMatchSelections] = useState<Record<string, string>>({});
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pullingUsers, setPullingUsers] = useState(false);
  const [pullingLogs, setPullingLogs] = useState(false);
  const [checking, setChecking] = useState(false);
  const [syncingTime, setSyncingTime] = useState(false);
  const [matchingExactIds, setMatchingExactIds] = useState(false);
  const [danger, setDanger] = useState<DangerAction | null>(null);
  const [seconds, setSeconds] = useState(5);
  const [dangerBusy, setDangerBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<DirectDevice[]>("/devices/live-status", { auth: "school" });
      const list = Array.isArray(result) ? result : [];
      setDevices(list);
      setSelectedId(current => list.some(device => device.id === current) ? current : list[0]?.id ?? "");
    } catch (error: any) { toast.error(error?.message ?? "Could not load devices"); }
    finally { setLoading(false); }
  }, []);

  const loadLogs = useCallback(async (id: string) => {
    if (!id) { setLogs([]); return; }
    try {
      const result = await apiRequest<{ data?: DeviceLog[] } | DeviceLog[]>(
        "/devices/" + encodeURIComponent(id) + "/logs?limit=50&page=1", { auth: "school", returnMeta: true }
      );
      setLogs(Array.isArray(result) ? result : result.data ?? []);
    } catch (error: any) { setLogs([]); toast.error(error?.message ?? "Could not load attendance"); }
  }, []);

  const loadUsers = useCallback(async (id: string) => {
    if (!id) { setUsers([]); setCandidates([]); return; }
    try {
      const [userRows, studentRows] = await Promise.all([
        apiRequest<DeviceUser[]>("/devices/" + encodeURIComponent(id) + "/users", { auth: "school" }),
        apiRequest<CandidateStudent[]>("/devices/" + encodeURIComponent(id) + "/users/match-candidates", { auth: "school" }),
      ]);
      setUsers(Array.isArray(userRows) ? userRows : []);
      setCandidates(Array.isArray(studentRows) ? studentRows : []);
      setSelectedUsers(current => current.filter(userId => userRows.some(user => user.userId === userId)));
    } catch { setUsers([]); setCandidates([]); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 15000); return () => window.clearInterval(timer); }, [refresh]);
  useEffect(() => {
    void loadLogs(selectedId); void loadUsers(selectedId);
    if (!selectedId) return;
    const logsTimer = window.setInterval(() => { void loadLogs(selectedId); }, 5000);
    const usersTimer = window.setInterval(() => { void loadUsers(selectedId); }, 15000);
    return () => { window.clearInterval(logsTimer); window.clearInterval(usersTimer); };
  }, [selectedId, loadLogs, loadUsers]);

  useEffect(() => {
    if (!danger) { setSeconds(5); return; }
    const deadline = Date.now() + 5000;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [danger]);

  const matchedUsers = useMemo(() => users.filter(user => user.matchStatus === "matched" && user.studentId), [users]);
  const countMethods = (pattern: RegExp) => users.reduce((count, user) => count + (user.biometricMethods ?? []).filter(method => pattern.test(method)).length, 0);
  const selected = devices.find(device => device.id === selectedId);

  const pushAllStudents = async () => {
    if (!selectedId || !window.confirm("Push the school’s active students to this device using their saved device IDs?")) return;
    setPushing(true);
    try {
      const result = await apiRequest<any>("/devices/" + encodeURIComponent(selectedId) + "/push-students", {
        method: "POST", auth: "school", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "all" }),
      });
      toast.success(`Push complete: ${result.pushed_count ?? 0} sent, ${result.failed_count ?? 0} failed`);
      await loadUsers(selectedId);
    } catch (error: any) { toast.error(error?.message ?? "Could not push students"); }
    finally { setPushing(false); }
  };

  const pullUsers = async () => {
    if (!selectedId) return;
    setPullingUsers(true);
    try {
      await apiRequest("/devices/" + encodeURIComponent(selectedId) + "/users/pull", { method: "POST", auth: "school" });
      toast.success("User and biometric pull requested. The list refreshes when the device responds.");
    } catch (error: any) { toast.error(error?.message ?? "Could not request a user pull"); }
    finally { setPullingUsers(false); }
  };

  const pullLogs = async () => {
    if (!selectedId) return;
    setPullingLogs(true);
    try {
      await apiRequest("/devices/" + encodeURIComponent(selectedId) + "/logs/pull", { method: "POST", auth: "school" });
      toast.success("Attendance log pull requested. Scans already saved on the server are kept.");
    } catch (error: any) { toast.error(error?.message ?? "Could not request attendance logs"); }
    finally { setPullingLogs(false); }
  };

  const checkStatus = async () => {
    if (!selectedId) return;
    setChecking(true);
    try {
      const result = await apiRequest<any>("/devices/" + encodeURIComponent(selectedId) + "/status/check", { method: "POST", auth: "school" });
      toast.success(`Device replied: ${result.status ?? "OK"}`);
      await refresh();
    } catch (error: any) { toast.error(error?.message ?? "Device status check failed"); }
    finally { setChecking(false); }
  };

  const syncTime = async () => {
    if (!selectedId) return;
    setSyncingTime(true);
    try {
      const result = await apiRequest<any>("/devices/" + encodeURIComponent(selectedId) + "/time/sync", { method: "POST", auth: "school" });
      toast.success(`Time command acknowledged (${result.timezone ?? "school time"}). Check the device after its next connection.`);
    } catch (error: any) { toast.error(error?.message ?? "Device did not accept the time command"); }
    finally { setSyncingTime(false); }
  };

  const matchUser = async (userId: string) => {
    const studentId = matchSelections[userId];
    if (!studentId || !selectedId) { toast.error("Choose a student first"); return; }
    try {
      await apiRequest("/devices/" + encodeURIComponent(selectedId) + "/users/match", {
        method: "POST", auth: "school", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, studentId }),
      });
      toast.success("Matched using the existing device ID. The student number was not changed.");
      setMatchSelections(current => ({ ...current, [userId]: "" }));
      await loadUsers(selectedId);
    } catch (error: any) { toast.error(error?.message ?? "Could not match the device user"); }
  };

  const matchExactIds = async () => {
    if (!selectedId) return;
    setMatchingExactIds(true);
    try {
      const result = await apiRequest<{ matched: number; alreadyMatched: number; needsReview: number }>(
        "/devices/" + encodeURIComponent(selectedId) + "/users/match-exact",
        { method: "POST", auth: "school" },
      );
      toast.success(`ID matching complete: ${result.matched} linked, ${result.alreadyMatched} already linked, ${result.needsReview} need review. Student numbers and biometric data were unchanged.`);
      await loadUsers(selectedId);
    } catch (error: any) { toast.error(error?.message ?? "Could not match exact device IDs"); }
    finally { setMatchingExactIds(false); }
  };

  const runDangerAction = async () => {
    if (!danger || !selectedId || seconds > 0) return;
    setDangerBusy(true);
    try {
      if (danger.kind === "clear-logs") {
        await apiRequest("/devices/" + encodeURIComponent(selectedId) + "/logs/clear", { method: "POST", auth: "school" });
        toast.success("Device logs cleared and checked. Attendance already stored on the server was preserved.");
      } else {
        const result = await apiRequest<any>("/devices/" + encodeURIComponent(selectedId) + "/users/delete", {
          method: "POST", auth: "school", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(danger.kind === "remove-all" ? { all: true } : { userIds: selectedUsers }),
        });
        toast.success(`Verified removal: ${result.removed_count ?? 0} user(s). School IDs were kept; biometric backup was saved first.`);
        setSelectedUsers([]);
      }
      setDanger(null);
      await Promise.all([loadUsers(selectedId), loadLogs(selectedId), refresh()]);
    } catch (error: any) { toast.error(error?.message ?? "The device could not confirm this action"); }
    finally { setDangerBusy(false); }
  };

  return <AppLayout title="Device Management" subtitle="Manage school devices, users, and attendance">
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Devices and scans update automatically. Select a device to manage its users and review attendance.</p>
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} /> Refresh
        </button>
      </div>

      <section className="rounded-xl border border-primary/20 bg-card p-4 shadow-sm">
        <label htmlFor="managed-device-select" className="block text-sm font-semibold">Select a device to manage</label>
        <p className="mt-1 text-xs text-muted-foreground">All user, biometric, and attendance actions below apply only to the selected device.</p>
        <select
          id="managed-device-select"
          value={selectedId}
          onChange={event => { setSelectedId(event.target.value); setSelectedUsers([]); }}
          disabled={devices.length === 0}
          className="mt-3 h-12 w-full max-w-xl rounded-lg border border-input bg-background px-3 text-base font-medium shadow-sm outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">{devices.length ? "Select a device" : "No school devices available"}</option>
          {devices.map(device => <option key={device.id} value={device.id}>{device.name} · {device.is_online ? "Online" : "Offline"}</option>)}
        </select>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">School devices ({devices.length})</h2>{selected && <span className="text-xs text-muted-foreground">Updated automatically</span>}</div>
        {devices.length === 0 ? <p className="text-sm text-muted-foreground">No devices have been assigned to this school yet.</p> :
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{devices.map(device =>
            <button key={device.id} type="button" onClick={() => { setSelectedId(device.id); setSelectedUsers([]); }} className={"rounded-lg border p-4 text-left " + (selectedId === device.id ? "border-primary ring-2 ring-primary/20" : "")}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{device.name}</span>{device.is_online ? <Wifi className="h-4 w-4 text-emerald-600" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}</div>
              {device.location && <div className="mt-1 text-xs text-muted-foreground">{device.location}</div>}
              <div className="mt-2 text-xs">{device.is_online ? "Online" : "Offline"}{device.last_seen_at ? " · Last seen " + new Date(device.last_seen_at).toLocaleString() : ""}</div>
            </button>
          )}</div>}
      </section>

      {selected && <>
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-semibold">{selected.name}</h2><p className="text-xs text-muted-foreground">{selected.is_online ? "Ready" : "Waiting for the device to reconnect"}</p></div>
            <div className="flex flex-wrap gap-2">
              <ActionButton disabled={!selected.is_online || checking} busy={checking} icon={<Activity className="h-4 w-4" />} onClick={() => void checkStatus()}>Check status</ActionButton>
              <ActionButton disabled={!selected.is_online || syncingTime} busy={syncingTime} icon={<Clock3 className="h-4 w-4" />} onClick={() => void syncTime()}>Sync time</ActionButton>
              <ActionButton disabled={!selected.is_online || pullingUsers} busy={pullingUsers} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void pullUsers()}>Get users</ActionButton>
              <ActionButton disabled={!selected.is_online || pullingLogs} busy={pullingLogs} icon={<Activity className="h-4 w-4" />} onClick={() => void pullLogs()}>Pull logs</ActionButton>
              <ActionButton primary disabled={!selected.is_online || pushing} busy={pushing} icon={<Send className="h-4 w-4" />} onClick={() => void pushAllStudents()}>Push students</ActionButton>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
            <Metric label="Users on device" value={users.length} />
            <Metric label="Fingerprints" value={countMethods(/finger/i)} />
            <Metric label="Faces" value={countMethods(/face/i)} />
            <Metric label="Cards" value={countMethods(/card|rfid/i)} />
            <Metric label="Matched to students" value={matchedUsers.length} />
          </div>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="font-semibold">Enrolled users ({users.length})</h3><p className="text-xs text-muted-foreground">Matching uses the existing ID stored on the device. Student numbers are never rewritten.</p></div>
            {users.length > 0 && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setSelectedUsers(current => current.length === users.length ? [] : users.map(user => user.userId))} className="rounded-md border px-3 py-2 text-xs font-medium">{selectedUsers.length === users.length ? "Clear selection" : "Select all device users"}</button>
              <button type="button" disabled={!selectedUsers.length || !selected.is_online} onClick={() => setDanger({ kind: "remove-selected", count: selectedUsers.length })} className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"><UserRound className="h-4 w-4" /> Remove selected</button>
              <button type="button" disabled={!selected.is_online} onClick={() => setDanger({ kind: "remove-all", count: users.length })} className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-xs font-semibold text-destructive disabled:opacity-50"><UserRound className="h-4 w-4" /> Delete all device users</button>
            </div>}
          </div>
          {users.length ? <div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-card"><tr className="border-b text-muted-foreground"><th className="px-3 py-2">Select</th><th>Device ID</th><th>Name on device</th><th>Matched student</th><th>Biometric methods</th></tr></thead><tbody>{users.map(user => {
            return <tr className="border-b last:border-0" key={user.userId}><td className="px-3 py-2"><input aria-label={`Select ${user.userId}`} type="checkbox" checked={selectedUsers.includes(user.userId)} onChange={event => setSelectedUsers(current => event.target.checked ? [...new Set([...current, user.userId])] : current.filter(id => id !== user.userId))} /></td><td className="font-mono">{user.userId}</td><td>{user.name || "—"}</td><td>{user.studentName ? `${user.studentName}${user.studentNumber ? ` (${user.studentNumber})` : ""}` : user.matchStatus === "ambiguous" ? "Needs review" : "Not linked"}</td><td>{user.biometricMethods?.length ? user.biometricMethods.join(", ") : "None reported"}</td></tr>;
          })}</tbody></table></div> : <p className="py-4 text-sm text-muted-foreground">No users have been pulled from this device yet.</p>}
          {users.some(user => user.matchStatus !== "matched") && <div className="mt-4 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold">Match existing device users</h4><p className="mt-1 text-xs text-muted-foreground">Exact matching links a device ID only when it uniquely equals a student number. Student numbers and device biometrics are never changed.</p></div><button type="button" disabled={matchingExactIds} onClick={() => void matchExactIds()} className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-50">{matchingExactIds ? "Matching…" : "Match exact IDs"}</button></div><div className="mt-3 space-y-2">{users.filter(user => user.matchStatus !== "matched").map(user => <div key={user.userId} className="flex flex-wrap items-center gap-2"><span className="min-w-28 text-sm">Device ID {user.userId}</span><select value={matchSelections[user.userId] ?? ""} onChange={event => setMatchSelections(current => ({ ...current, [user.userId]: event.target.value }))} className="min-w-60 flex-1 rounded-md border bg-background px-3 py-2 text-sm"><option value="">Select a student with no device ID</option>{candidates.map(student => <option key={student.id} value={student.id}>{student.first_name} {student.last_name} · {student.student_id_number}</option>)}</select><button type="button" disabled={!matchSelections[user.userId]} onClick={() => void matchUser(user.userId)} className="rounded-md border px-3 py-2 text-xs font-semibold disabled:opacity-50">Match ID</button></div>)}</div></div>}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" /> Attendance scans ({logs.length} shown)</h3>
          {logs.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="py-2">Student</th><th>Session</th><th>Result</th><th>Method</th><th>Time</th></tr></thead><tbody>{logs.map(log => <tr className="border-b last:border-0" key={log.id}><td className="py-2">{[log.first_name, log.last_name].filter(Boolean).join(" ") || log.student_id_number || "Unknown user"}</td><td>{log.attendance_period ?? "—"}</td><td>{log.status ?? log.event_type ?? "Attendance"}</td><td>{log.scan_method ?? "—"}</td><td>{log.scanned_at ? new Date(log.scanned_at).toLocaleString() : "—"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">No attendance scans have arrived yet. New scans sync automatically.</p>}
        </section>

        <section className="rounded-xl border border-destructive/30 bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-destructive"><ShieldAlert className="h-5 w-5" /><h3 className="font-semibold">Danger zone</h3></div>
          <p className="mb-4 text-sm text-muted-foreground">Device actions are delayed by a five-second warning and require a final confirmation.</p>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3"><div><p className="font-medium">Clear attendance logs from device</p><p className="text-xs text-muted-foreground">Saved attendance in the school system stays intact.</p></div><button type="button" disabled={!selected.is_online} onClick={() => setDanger({ kind: "clear-logs", count: 0 })} className="inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-50"><Trash2 className="h-4 w-4" /> Clear device logs</button></div>
          <p className="mt-3 text-xs text-muted-foreground">Device restart is unavailable until its effect is confirmed for this model.</p>
        </section>
      </>}
    </div>
    {danger && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation"><div role="alertdialog" aria-modal="true" aria-labelledby="device-danger-title" className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl">
      <h2 id="device-danger-title" className="flex items-center gap-2 text-lg font-bold text-destructive"><ShieldAlert className="h-5 w-5" /> This device action cannot be undone</h2>
      <p className="mt-3 text-sm">{danger.kind === "clear-logs" ? "This will clear attendance logs stored on the physical device. Attendance records already saved on the server will remain." : `This will remove ${danger.count} user(s) and their biometric enrollment(s) from the physical device. An encrypted server backup is required first. Student numbers and saved device IDs in the school system will not change.`}</p>
      <p className="mt-3 rounded-md bg-muted p-3 text-sm font-semibold">{seconds > 0 ? `Please review this warning. Confirmation unlocks in ${seconds} second${seconds === 1 ? "" : "s"}.` : "Review complete. Confirm only if you want to continue."}</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={dangerBusy} onClick={() => setDanger(null)} className="rounded-md border px-4 py-2 text-sm font-medium">Cancel</button><button type="button" disabled={seconds > 0 || dangerBusy} onClick={() => void runDangerAction()} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">{dangerBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : seconds > 0 ? `Wait ${seconds}s` : "I understand, confirm"}</button></div>
    </div></div>}
  </AppLayout>;
}

function ActionButton({ children, icon, onClick, disabled, busy, primary = false }: { children: ReactNode; icon: ReactNode; onClick: () => void; disabled?: boolean; busy?: boolean; primary?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={"inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 " + (primary ? "border-primary bg-primary text-primary-foreground" : "")}>
    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon}{children}
  </button>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="bg-card p-3 text-center"><div className="text-xl font-bold">{value}</div><div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div></div>;
}
