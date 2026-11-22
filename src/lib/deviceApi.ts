import { apiRequest } from "./api";

export type Device = {
  id: string;
  school_id: string;
  device_uid: string;
  name: string;
  type: "kiosk" | "web";
  location?: string | null;
  mode: "gate" | "boarding" | "classroom";
  is_active: boolean;
  last_seen_at?: string | null;
  firmware_version?: string | null;
  created_at: string;
  updated_at: string;
  last_sync_status?: string | null;
  last_sync_error?: string | null;
  last_status_message?: string | null;
  api_url?: string | null;
  last_sync_at?: string | null;
  attendance_config?: unknown;
  connection_error?: string | null;
  device_logs_count?: number;
  device_serial?: string | null;
  device_users_count?: number;
  is_connected: boolean;
  last_connection_at?: string | null;
  license_number?: number | null;
  product_code?: string | null;
  product_name?: string | null;
  status: string;
  is_online: boolean;
};

export type AttendanceSession = { name: string; rules: AttendanceRule[] };
export type AttendanceRule = { label?: string; start: string; end: string };
export type AttendanceConfig = { sessions: AttendanceSession[] };

export type CreateDeviceRequest = {
  device_uid: string;
  name: string;
  type?: "kiosk" | "web";
  location?: string;
  mode?: "gate" | "boarding" | "classroom";
  pin?: string;
  firmware_version?: string;
};
export type UpdateDeviceRequest = {
  name?: string;
  type?: "kiosk" | "web";
  location?: string | null;
  mode?: "gate" | "boarding" | "classroom";
  pin?: string;
  is_active?: boolean;
  firmware_version?: string | null;
  api_url?: string | null;
  school_id?: string | number | null;
};
export type PushStudentsRequest = {
  mode?: "selected" | "class" | "section" | "all";
  student_ids?: (string | number)[];
  section_id?: string | number;
  class_id?: string | number;
  student_type?: "boarding" | "day";
  gender?: "male" | "female";
};

export const deviceApi = {
  getAll: (params?: { page?: number; limit?: number; mode?: string; type?: string; is_active?: boolean }) =>
    apiRequest<{ data: Device[]; meta: { page: number; limit: number; total: number } }>(
      "/devices?" + new URLSearchParams(params as any).toString(), { auth: "school", returnMeta: true }
    ),
  get: (id: string) => apiRequest<Device>("/devices/" + encodeURIComponent(id), { auth: "school" }),
  create: (data: CreateDeviceRequest) =>
    apiRequest<Device>("/devices", { method: "POST", body: JSON.stringify(data), auth: "school" }),
  update: (id: string, data: UpdateDeviceRequest) =>
    apiRequest<Device>("/devices/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(data), auth: "school" }),
  deactivate: (id: string) =>
    apiRequest<Device>("/devices/" + encodeURIComponent(id) + "/deactivate", { method: "PATCH", auth: "school" }),
  delete: (id: string) =>
    apiRequest<void>("/devices/" + encodeURIComponent(id), { method: "DELETE", auth: "school" }),
  pushStudents: (id: string, data: PushStudentsRequest) =>
    apiRequest<{ device_id: string; target: unknown; pushed_count: number; students: unknown[] }>(
      "/devices/" + encodeURIComponent(id) + "/push-students",
      { method: "POST", body: JSON.stringify(data), auth: "school" }
    ),
  getStatus: (id: string) => apiRequest<any>("/devices/" + encodeURIComponent(id) + "/status", { auth: "school" }),
  getLiveStatuses: () => apiRequest<any[]>("/devices/live-status", { auth: "school" }),
  getAttendanceConfig: (id: string) =>
    apiRequest<{ device_id: string; sessions: AttendanceSession[]; attendance_config: AttendanceConfig }>(
      "/devices/" + encodeURIComponent(id) + "/attendance-config", { auth: "school" }
    ),
  saveAttendanceConfig: (id: string, data: AttendanceConfig) =>
    apiRequest<{ device_id: string; sessions: AttendanceSession[]; attendance_config: AttendanceConfig }>(
      "/devices/" + encodeURIComponent(id) + "/attendance-config",
      { method: "POST", body: JSON.stringify(data), auth: "school" }
    ),
  getLogs: (id: string, params?: { page?: number; limit?: number }) =>
    apiRequest<{ data: any[]; meta: any }>(
      "/devices/" + encodeURIComponent(id) + "/logs?" + new URLSearchParams(params as any).toString(),
      { auth: "school", returnMeta: true }
    ),
};

export const platformHardwareApi = {
  getDevices: (params?: { school_id?: string | number; page?: number; limit?: number }) =>
    apiRequest<{ data: Device[]; meta: { page: number; limit: number; total: number } }>(
      "/platform/hardware/devices?" + new URLSearchParams(params as any).toString(),
      { auth: "platform", returnMeta: true }
    ),
  createDevice: (data: CreateDeviceRequest & { school_id: string | number }) =>
    apiRequest<Device>("/platform/hardware/devices", { method: "POST", body: JSON.stringify(data), auth: "platform" }),
  updateDevice: (id: string, data: UpdateDeviceRequest) =>
    apiRequest<Device>("/platform/hardware/devices/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(data), auth: "platform" }),
  deleteDevice: (id: string) =>
    apiRequest<void>("/platform/hardware/devices/" + encodeURIComponent(id), { method: "DELETE", auth: "platform" }),
};