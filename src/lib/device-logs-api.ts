/** API helpers for attendance logs and direct FK device status. */
import { apiRequest } from "./api";
import type { AttendanceResponse, TodayAttendanceResponse, AttendanceStats, DeviceStatusResponse, DeviceLog } from "./device-logs-types";

export type DeviceLogQuery = {
  startDate?: string;
  endDate?: string;
  studentId?: string;
  deviceId?: string;
  method?: string;
  status?: string;
  syncState?: string;
  search?: string;
  className?: string;
  section?: string;
  direction?: string;
};

export async function fetchDeviceLogs(params: DeviceLogQuery & { page?: number; limit?: number }): Promise<AttendanceResponse> {
  const query = new URLSearchParams();
  for (const key of ["page", "limit", "startDate", "endDate", "studentId", "deviceId", "method", "status", "syncState", "search", "className", "section", "direction"] as const) {
    const value = params[key];
    if (value !== undefined && value !== "") query.append(key, String(value));
  }
  const response = await apiRequest<AttendanceResponse>(
    "/attendance/records/device-logs?" + query.toString(), { auth: "school", returnMeta: true }
  );
  return { data: response.data ?? [], meta: response.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 } };
}

export async function fetchAllDeviceLogs(params: DeviceLogQuery = {}): Promise<DeviceLog[]> {
  const pageSize = 200;
  const first = await fetchDeviceLogs({ ...params, page: 1, limit: pageSize });
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.meta.totalPages - 1) }, (_, i) =>
      fetchDeviceLogs({ ...params, page: i + 2, limit: pageSize })
    )
  );
  return [first.data, ...rest.map(page => page.data)].flat();
}

export async function fetchTodayAttendance(): Promise<TodayAttendanceResponse> {
  const response = await apiRequest<DeviceLog[] | { data: DeviceLog[] }>(
    "/attendance/records/device-logs/today", { auth: "school" }
  );
  return { data: Array.isArray(response) ? response : response.data ?? [] };
}

export async function fetchAttendanceStats(params?: { startDate?: string; endDate?: string }): Promise<AttendanceStats> {
  const query = new URLSearchParams();
  if (params?.startDate) query.append("startDate", params.startDate);
  if (params?.endDate) query.append("endDate", params.endDate);
  const suffix = query.toString();
  return apiRequest<AttendanceStats>(
    "/attendance/records/device-logs/stats" + (suffix ? "?" + suffix : ""), { auth: "school" }
  );
}

/** Live status is read from terminals' WAN polls, from direct WAN poll records. */
export async function fetchDeviceStatus(): Promise<DeviceStatusResponse> {
  const rows = await apiRequest<Array<any>>("/devices/live-status", { auth: "school" });
  return { data: Array.isArray(rows) ? rows.map(row => ({
    deviceId: row.device_uid ?? row.id,
    name: row.name,
    serialNumber: row.device_uid,
    isConnected: Boolean(row.is_online),
    lastConnectionAt: row.last_seen_at ?? undefined,
    connectionError: row.is_online ? undefined : "No recent WAN poll from terminal",
  })) : [] };
}