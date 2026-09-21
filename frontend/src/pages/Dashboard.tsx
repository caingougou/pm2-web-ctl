import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import {
  ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, AlertCircle, Save, Upload, CheckCircle2, XCircle, Search, X,
  Play, Square, RotateCcw, Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import ProcessCard from '@/components/ProcessCard'
import SelectCheckbox from '@/components/SelectCheckbox'
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

function formatNameDiff(added: string[], removed: string[]): string {
  const fmt = (names: string[]) =>
    names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
  const parts: string[] = []
  if (added.length > 0) parts.push(`unsaved: ${fmt(added)}`)
  if (removed.length > 0) parts.push(`stale: ${fmt(removed)}`)
  return parts.length > 0 ? ` — ${parts.join('; ')}` : ''
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
  const [searchParams, setSearchParams] = useSearchParams()
  const statusFilter = searchParams.get('status')
  const sortConfig: SortConfig = useMemo(() => {
    const key = searchParams.get('sort')
    const dir = searchParams.get('dir')
    return {
      key: SORT_OPTIONS.some((o) => o.key === key) ? (key as SortKey) : 'pm_id',
      dir: dir === 'desc' ? 'desc' : 'asc',
    }
  }, [searchParams])

  const setStatusFilter = useCallback(
    (next: string | null | ((prev: string | null) => string | null)) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const resolved = typeof next === 'function' ? next(prev.get('status')) : next
          if (resolved) p.set('status', resolved)
          else p.delete('status')
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setSortConfig = useCallback(
    (next: SortConfig | ((prev: SortConfig) => SortConfig)) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const prevSort: SortConfig = {
            key: SORT_OPTIONS.some((o) => o.key === prev.get('sort'))
              ? (prev.get('sort') as SortKey)
              : 'pm_id',
            dir: prev.get('dir') === 'desc' ? 'desc' : 'asc',
          }
          const resolved = typeof next === 'function' ? next(prevSort) : next
          if (resolved.key === 'pm_id' && resolved.dir === 'asc') {
            p.delete('sort')
            p.delete('dir')
          } else {
            p.set('sort', resolved.key)
            p.set('dir', resolved.dir)
          }
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  const rawQuery = searchParams.get('q') ?? ''
  const query = rawQuery.trim().toLowerCase()
  const nsFilter = searchParams.get('ns')

  const setNsFilter = useCallback(
    (next: string | null) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next) p.set('ns', next)
          else p.delete('ns')
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const namespaces = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of processes) {
      const ns = p.pm2_env?.namespace || 'default'
      counts.set(ns, (counts.get(ns) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [processes])

  const setQuery = useCallback(
    (next: string) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          if (next.trim()) p.set('q', next)
          else p.delete('q')
          return p
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Subtle "unsaved changes" hint: compare app names (PM2 modules such as
  // pm2-logrotate are excluded on both sides) instead of raw counts.
  // Dismissible via X / ESC; reappears only when the diff changes again.
  const [saveHintDismissed, setSaveHintDismissed] = useState(false)
  const runningApps = useMemo(
    () => processes.filter((p) => !p.pm2_env?.pmx_module),
    [processes],
  )
  const dumpedNames = useMemo(
    () => dumpInfo?.process_names ?? [],
    [dumpInfo],
  )
  const { addedNames, removedNames } = useMemo(() => {
    const dumped = new Set(dumpedNames)
    const running = new Set(runningApps.map((p) => p.name))
    return {
      addedNames: runningApps.map((p) => p.name).filter((n) => !dumped.has(n)),
      removedNames: dumpedNames.filter((n) => !running.has(n)),
    }
  }, [runningApps, dumpedNames])
  const driftKey = `${[...runningApps.map((p) => p.name)].sort().join(',')}|${[...dumpedNames].sort().join(',')}`
  useEffect(() => {
    setSaveHintDismissed(false)
  }, [driftKey])
  const saveDrift =
    dumpInfo != null && (addedNames.length > 0 || removedNames.length > 0)
  const showSaveHint = saveDrift && !saveHintDismissed
  useEffect(() => {
    if (!showSaveHint) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSaveHintDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSaveHint])
  // Multi-select (local UI state, not synced to URL).
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchLoading, setBatchLoading] = useState<string | null>(null)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  // Drop selections for processes that no longer exist.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const alive = new Set(processes.map((p) => p.name))
      const next = new Set([...prev].filter((n) => alive.has(n)))
      return next.size === prev.size ? prev : next
    })
  }, [processes])

  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }, [])
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

  const handleBatchAction = async (action: 'start' | 'stop' | 'restart' | 'reload' | 'delete') => {
    const names = [...selected]
    if (names.length === 0 || batchLoading) return
    setBatchLoading(action)
    setResultMsg(null)
    try {
      const actionMap = {
        start: api.startProcess,
        stop: api.stopProcess,
        restart: api.restartProcess,
        reload: api.reloadProcess,
        delete: api.deleteProcess,
      }
      const results = await Promise.allSettled(names.map((n) => actionMap[action](n)))
      const ok = results.filter((r) => r.status === 'fulfilled').length
      const fail = results.length - ok
      const pastTense =
        action === 'start' ? 'Started'
        : action === 'stop' ? 'Stopped'
        : action === 'restart' ? 'Restarted'
        : action === 'reload' ? 'Reloaded'
        : 'Deleted'
      setResultMsg(
        fail === 0
          ? { type: 'success', text: `${pastTense} ${ok} process${ok !== 1 ? 'es' : ''}` }
          : { type: 'error', text: `${action}: ${ok} succeeded, ${fail} failed` },
      )
      if (action === 'delete') setSelected(new Set())
    } catch (err) {
      setResultMsg({ type: 'error', text: err instanceof Error ? err.message : 'Batch action failed' })
    } finally {
      setBatchLoading(null)
      setTimeout(() => setResultMsg(null), 4000)
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

  const nsFilteredProcesses = useMemo(
    () =>
      nsFilter
        ? processes.filter((p) => (p.pm2_env?.namespace || 'default') === nsFilter)
        : processes,
    [processes, nsFilter],
  )

  const onlineCount = nsFilteredProcesses.filter((p) => p.pm2_env?.status === 'online').length
  const erroredCount = nsFilteredProcesses.filter((p) => p.pm2_env?.status === 'errored').length
  const stoppedCount = nsFilteredProcesses.filter((p) => p.pm2_env?.status === 'stopped').length

  const sortedProcesses = useMemo(() => {
    let list = statusFilter
      ? nsFilteredProcesses.filter((p) => p.pm2_env?.status === statusFilter)
      : [...nsFilteredProcesses]
    if (query) {
      list = list.filter((p) => p.name.toLowerCase().includes(query))
    }

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
  }, [nsFilteredProcesses, statusFilter, query, sortConfig])

  const allShownSelected =
    sortedProcesses.length > 0 && sortedProcesses.every((p) => selected.has(p.name))
  const someShownSelected = sortedProcesses.some((p) => selected.has(p.name))

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const shown = sortedProcesses.map((p) => p.name)
      if (shown.length > 0 && shown.every((n) => next.has(n))) {
        shown.forEach((n) => next.delete(n))
      } else {
        shown.forEach((n) => next.add(n))
      }
      return next
    })
  }, [sortedProcesses])

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
            {statusFilter || query || nsFilter
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

      {showSaveHint && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Save className="h-4 w-4 shrink-0 opacity-70" />
          <p className="flex-1">
            {!dumpInfo?.exists
              ? `No saved dump yet — save ${runningApps.length} process${runningApps.length !== 1 ? 'es' : ''} so Resurrect can restore them.`
              : `Process list changed${formatNameDiff(addedNames, removedNames)}. Save to keep the dump in sync.`}
          </p>
          <Button variant="outline" size="sm" className="h-7 border-amber-300 bg-white/60 hover:bg-white" onClick={handleSave} disabled={saving}>
            <Save className={`h-3.5 w-3.5 mr-1.5 ${saving ? 'animate-pulse' : ''}`} />
            Save now
          </Button>
          <button
            aria-label="Dismiss"
            onClick={() => setSaveHintDismissed(true)}
            className="rounded p-1 text-amber-600/70 hover:bg-amber-100 hover:text-amber-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {namespaces.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b">
          <button
            onClick={() => setNsFilter(null)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
              nsFilter === null
                ? '-mb-px border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            All
            <span className="ml-1.5 text-xs text-muted-foreground">{processes.length}</span>
          </button>
          {namespaces.map(([ns, count]) => (
            <button
              key={ns}
              onClick={() => setNsFilter(nsFilter === ns ? null : ns)}
              className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                nsFilter === ns
                  ? '-mb-px border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {ns}
              <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
            </button>
          ))}
        </div>
      )}

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
          <div className="text-2xl font-bold">{nsFilteredProcesses.length}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SelectCheckbox
            checked={allShownSelected}
            indeterminate={!allShownSelected && someShownSelected}
            onChange={toggleSelectAll}
            label="Select all shown processes"
          />
          {selected.size > 0
            ? `${selected.size} selected`
            : `${sortedProcesses.length} process${sortedProcesses.length !== 1 ? 'es' : ''} shown`}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={rawQuery}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name..."
              className="h-8 w-52 rounded-md border border-input bg-background pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {rawQuery && (
              <button
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
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
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium mr-1">
            {selected.size} selected
          </span>
          <Button variant="outline" size="sm" disabled={batchLoading !== null} onClick={() => handleBatchAction('start')}>
            <Play className="h-3.5 w-3.5 mr-1.5" /> Start
          </Button>
          <Button variant="outline" size="sm" disabled={batchLoading !== null} onClick={() => handleBatchAction('stop')}>
            <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
          </Button>
          <Button variant="outline" size="sm" disabled={batchLoading !== null} onClick={() => handleBatchAction('restart')}>
            <RotateCcw className={`h-3.5 w-3.5 mr-1.5 ${batchLoading === 'restart' ? 'animate-spin' : ''}`} /> Restart
          </Button>
          <Button variant="outline" size="sm" disabled={batchLoading !== null} onClick={() => handleBatchAction('reload')}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${batchLoading === 'reload' ? 'animate-spin' : ''}`} /> Reload
          </Button>
          <Button variant="destructive" size="sm" disabled={batchLoading !== null} onClick={() => setBatchDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
          </Button>
          <div className="flex-1" />
          <button
            aria-label="Clear selection"
            onClick={() => setSelected(new Set())}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
            {query
              ? `No processes match "${rawQuery.trim()}"`
              : nsFilter
                ? `No processes in namespace "${nsFilter}"`
                : statusFilter
                  ? `No ${statusFilter} processes found`
                  : 'No processes found'}
          </p>
          <p className="text-sm">
            {statusFilter || query || nsFilter
              ? 'Try a different search or filter'
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
              selected={selected.has(proc.name)}
              onSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      <Dialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} process{selected.size !== 1 ? 'es' : ''}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the selected processes? This will stop them and remove them from PM2.
              {selected.size > 0 && (
                <span className="mt-2 block max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-xs">
                  {[...selected].join(', ')}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={batchLoading !== null}
              onClick={() => { setBatchDeleteOpen(false); handleBatchAction('delete') }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
