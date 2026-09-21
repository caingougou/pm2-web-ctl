const BASE = '/api'

export interface PM2Process {
  pid: number
  name: string
  pm_id: number
  monit: {
    cpu: number
    memory: number
  }
  pm2_env: {
    status: string
    pmx_module?: boolean
    pm_uptime: number
    unstable_restarts: number
    restart_time: number
    created_at: number
    exec_interpreter: string
    exec_mode: string
    instances: number
    namespace: string
    version: string
    pm_out_log_path: string
    pm_err_log_path: string
    node_version: string
    _: string[]
  }
}

export interface APIResponse<T> {
  data: T
  error?: string
  message?: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export interface DumpInfo {
  exists: boolean
  modified?: string
  size?: number
  process_count?: number
  process_names?: string[]
  path: string
}

export interface PortInfo {
  port: number
  host: string
}

export type PortMap = Record<number, PortInfo[]>

export const api = {
  listProcesses: () =>
    request<APIResponse<PM2Process[]>>('/processes'),

  getProcess: (name: string) =>
    request<APIResponse<PM2Process>>(`/processes/${encodeURIComponent(name)}`),

  startProcess: (name: string) =>
    request<APIResponse<PM2Process>>(`/processes/${encodeURIComponent(name)}/start`, { method: 'POST' }),

  stopProcess: (name: string) =>
    request<APIResponse<PM2Process>>(`/processes/${encodeURIComponent(name)}/stop`, { method: 'POST' }),

  restartProcess: (name: string) =>
    request<APIResponse<PM2Process>>(`/processes/${encodeURIComponent(name)}/restart`, { method: 'POST' }),

  reloadProcess: (name: string) =>
    request<APIResponse<PM2Process>>(`/processes/${encodeURIComponent(name)}/reload`, { method: 'POST' }),

  deleteProcess: (name: string) =>
    request<APIResponse<PM2Process>>(`/processes/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  getLogs: (name: string, lines = 100) =>
    request<APIResponse<{ out_log: string; err_log: string; log_size: number }>>(
      `/processes/${encodeURIComponent(name)}/logs?lines=${lines}`
    ),

  dump: () =>
    request<APIResponse<null>>('/dump', { method: 'POST' }),

  resurrect: () =>
    request<APIResponse<null>>('/resurrect', { method: 'POST' }),

  getDumpInfo: () =>
    request<APIResponse<DumpInfo>>('/dump-info'),

  getPorts: (pids: number[]) =>
    request<APIResponse<PortMap>>('/ports', {
      method: 'POST',
      body: JSON.stringify({ pids }),
    }),
}
