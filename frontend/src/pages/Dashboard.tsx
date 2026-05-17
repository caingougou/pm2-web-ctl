import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, AlertCircle, Save, Upload, CheckCircle2, XCircle,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ProcessCard from '@/components/ProcessCard'
import { api, type PM2Process, type DumpInfo, type PortMap } from '@/lib/api'

type SortKey = 'name' | 'status' | 'cpu' | 'memory' | 'uptime' | 'pm_id'
interface SortConfig {
  key: SortKey
  dir: 'asc' | 'desc'
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
  { key: 'cpu', label: 'CPU' },
  { key: 'memory', label: 'Memory' },
  { key: 'uptime', label: 'Uptime' },
  { key: 'pm_id', label: 'Process ID' },
]

const STATUS_ORDER: Record<string, number> = {
  online: 0,
  launching: 1,
  stopped: 2,
  stopping: 3,
  errored: 4,
}

export default function Dashboard() {
  const [processes, setProcesses] = useState<PM2Process[]>([])
  const [portsMap, setPortsMap] = useState<PortMap>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [dumpInfo, setDumpInfo] = useState<DumpInfo | null>(null)
  const [saving, setSaving] = useState(false)
  const [resurrecting, setResurrecting] = useState(false)
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'pm_id', dir: 'asc' })
  const eventSourceRef = useRef<EventSource | null>(null)
  const processesRef = useRef<PM2Process[]>([])
  const portsFetchedRef = useRef(false)

  const fetchProcesses = useCallback(async () => {
    try {
      setError(null)
      const res = await api.listProcesses()
      setProcesses(res.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch processes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProcesses()
    api.getDumpInfo().then((res) => setDumpInfo(res.data)).catch(() => {})
  }, [fetchProcesses])

  useEffect(() => {
    const es = new EventSource('/api/events')
    eventSourceRef.current = es

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (Array.isArray(data)) {
          const list = data as PM2Process[]
          setProcesses(list)
          processesRef.current = list
          setError(null)
          if (!portsFetchedRef.current) {
            portsFetchedRef.current = true
            setTimeout(() => fetchPorts(), 5000)
          }
        }
      } catch {
    }
    }

    es.onerror = () => {
      es.close()
    }

    return () => {
      es.close()
    }
  }, [])

  const handleAction = async (name: string, action: 'start' | 'stop' | 'restart' | 'reload' | 'delete') => {
    setActionLoading(name)
    try {
      const actionMap = {
        start: api.startProcess,
        stop: api.stopProcess,
        restart: api.restartProcess,
        reload: api.reloadProcess,
        delete: api.deleteProcess,
      }
      await actionMap[action](name)
    } catch (err) {
      console.error(`${action} ${name} failed:`, err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setResultMsg(null)
    try {
      const res = await api.dump()
      setResultMsg({ type: 'success', text: res.message || 'Dump saved' })
      api.getDumpInfo().then((r) => setDumpInfo(r.data)).catch(() => {})
    } catch (err) {
      setResultMsg({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
      setTimeout(() => setResultMsg(null), 4000)
    }
  }

  const handleResurrect = async () => {
    setResurrecting(true)
    setResultMsg(null)
    try {
      const res = await api.resurrect()
      setResultMsg({ type: 'success', text: res.message || 'Processes restored' })
    } catch (err) {
      setResultMsg({ type: 'error', text: err instanceof Error ? err.message : 'Resurrect failed' })
    } finally {
      setResurrecting(false)
      setTimeout(() => setResultMsg(null), 4000)
    }
  }

  const fetchPorts = useCallback(async () => {
    const pids = processesRef.current
      .filter((p) => p.pid && p.pid > 0 && p.pm2_env?.status === 'online')
      .map((p) => p.pid)
    if (pids.length === 0) return
    try {
      const res = await api.getPorts(pids)
      setPortsMap(res.data || {})
    } catch {
    }
  }, [])

  useEffect(() => {
    const timer = setInterval(fetchPorts, 60000)
    return () => clearInterval(timer)
  }, [fetchPorts])

  const onlineCount = processes.filter((p) => p.pm2_env?.status === 'online').length
  const erroredCount = processes.filter((p) => p.pm2_env?.status === 'errored').length
  const stoppedCount = processes.filter((p) => p.pm2_env?.status === 'stopped').length

  const sortedProcesses = useMemo(() => {
    const list = statusFilter
      ? processes.filter((p) => p.pm2_env?.status === statusFilter)
      : [...processes]

    const { key, dir } = sortConfig
    const mul = dir === 'asc' ? 1 : -1

    list.sort((a, b) => {
      switch (key) {
        case 'name':
          return a.name.localeCompare(b.name) * mul
        case 'status': {
          const sa = STATUS_ORDER[a.pm2_env?.status ?? ''] ?? 99
          const sb = STATUS_ORDER[b.pm2_env?.status ?? ''] ?? 99
          return (sa - sb) * mul
        }
        case 'cpu':
          return ((a.monit?.cpu ?? 0) - (b.monit?.cpu ?? 0)) * mul
        case 'memory':
          return ((a.monit?.memory ?? 0) - (b.monit?.memory ?? 0)) * mul
        case 'uptime': {
          const ua = a.pm2_env?.pm_uptime ?? 0
          const ub = b.pm2_env?.pm_uptime ?? 0
          return (ua - ub) * mul
        }
        case 'pm_id':
          return (a.pm_id - b.pm_id) * mul
        default:
          return 0
      }
    })

    return list
  }, [processes, statusFilter, sortConfig])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading processes...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Processes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {statusFilter
              ? `${sortedProcesses.length} / ${processes.length} process${processes.length !== 1 ? 'es' : ''}`
              : `${processes.length} process${processes.length !== 1 ? 'es' : ''} total`
            }
            {dumpInfo?.exists && (
              <span className="ml-3 text-xs text-muted-foreground">
                Dump: {dumpInfo.process_count} processes saved
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resultMsg && (
            <div className={`flex items-center gap-1.5 text-sm mr-2 ${
              resultMsg.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}>
              {resultMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {resultMsg.text}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={handleResurrect} disabled={resurrecting || !dumpInfo?.exists}>
            <Upload className={`h-4 w-4 mr-2 ${resurrecting ? 'animate-pulse' : ''}`} />
            Resurrect
          </Button>
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
            <Save className={`h-4 w-4 mr-2 ${saving ? 'animate-pulse' : ''}`} />
            Save
          </Button>
          <Button variant="outline" size="sm" onClick={fetchProcesses} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <button
          onClick={() => setStatusFilter(statusFilter === 'online' ? null : 'online')}
          className={`rounded-lg border bg-card p-4 text-left transition-all hover:bg-accent ${
            statusFilter === 'online' ? 'ring-2 ring-green-500 shadow-sm' : ''
          }`}
        >
          <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
          <div className="text-xs text-muted-foreground">Online</div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'stopped' ? null : 'stopped')}
          className={`rounded-lg border bg-card p-4 text-left transition-all hover:bg-accent ${
            statusFilter === 'stopped' ? 'ring-2 ring-gray-400 shadow-sm' : ''
          }`}
        >
          <div className="text-2xl font-bold text-gray-500">{stoppedCount}</div>
          <div className="text-xs text-muted-foreground">Stopped</div>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'errored' ? null : 'errored')}
          className={`rounded-lg border bg-card p-4 text-left transition-all hover:bg-accent ${
            statusFilter === 'errored' ? 'ring-2 ring-red-500 shadow-sm' : ''
          }`}
        >
          <div className="text-2xl font-bold text-red-500">{erroredCount}</div>
          <div className="text-xs text-muted-foreground">Errored</div>
        </button>
        <button
          onClick={() => setStatusFilter(null)}
          className={`rounded-lg border bg-card p-4 text-left transition-all hover:bg-accent ${
            statusFilter === null ? 'ring-2 ring-primary shadow-sm' : ''
          }`}
        >
          <div className="text-2xl font-bold">{processes.length}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {sortedProcesses.length} process{sortedProcesses.length !== 1 ? 'es' : ''} shown
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              {SORT_OPTIONS.find((o) => o.key === sortConfig.key)?.label}
              {sortConfig.dir === 'asc' ? <ArrowUp className="h-3 w-3 ml-0.5" /> : <ArrowDown className="h-3 w-3 ml-0.5" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {SORT_OPTIONS.map((opt) => {
              const isActive = sortConfig.key === opt.key
              return (
                <DropdownMenuItem
                  key={opt.key}
                  className="text-sm gap-2"
                  onClick={() =>
                    setSortConfig(isActive
                      ? { key: opt.key, dir: sortConfig.dir === 'asc' ? 'desc' : 'asc' }
                      : { key: opt.key, dir: 'asc' }
                    )
                  }
                >
                  {isActive ? (
                    sortConfig.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <span className={isActive ? 'font-medium' : ''}>{opt.label}</span>
                  {isActive && <span className="text-xs text-muted-foreground ml-auto">{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {sortedProcesses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <RefreshCw className="h-8 w-8 mb-4 opacity-50" />
          <p className="text-lg font-medium">
            {statusFilter ? `No ${statusFilter} processes found` : 'No processes found'}
          </p>
          <p className="text-sm">
            {statusFilter
              ? 'Try selecting a different filter'
              : 'Start a process with PM2 to see it here'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedProcesses.map((proc) => (
            <ProcessCard
              key={proc.pm_id || proc.name}
              process={proc}
              ports={portsMap[proc.pid]}
              onAction={handleAction}
              loading={actionLoading === proc.name}
            />
          ))}
        </div>
      )}
    </div>
  )
}
