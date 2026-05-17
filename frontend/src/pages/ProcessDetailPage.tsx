import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Trash2,
  AlertCircle,
  FileText,
  Terminal,
} from 'lucide-react'
import { api, type PM2Process } from '@/lib/api'
import { formatUptime, formatBytes, formatCPU, statusBgColor } from '@/lib/utils'

export default function ProcessDetailPage() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()
  const [process, setProcess] = useState<PM2Process | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [logOutput, setLogOutput] = useState<string>('')
  const [logLoading, setLogLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const decodedName = name ? decodeURIComponent(name) : ''

  const fetchProcess = useCallback(async () => {
    if (!decodedName) return
    try {
      setError(null)
      const res = await api.getProcess(decodedName)
      if (!res.data) {
        setError(res.error || 'Process not found')
        return
      }
      setProcess(res.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch process')
    } finally {
      setLoading(false)
    }
  }, [decodedName])

  useEffect(() => {
    fetchProcess()
  }, [fetchProcess])

  const fetchLogs = useCallback(async () => {
    if (!decodedName) return
    setLogLoading(true)
    try {
      const res = await api.getLogs(decodedName)
      const { out_log, err_log } = res.data || {}

      const lines: string[] = []
      if (out_log) {
        const outRes = await fetch(`/api/raw-log?path=${encodeURIComponent(out_log)}`).catch(() => null)
        if (outRes?.ok) {
          const text = await outRes.text()
          lines.push('--- stdout ---', text.slice(-5000))
        }
      }
      if (err_log) {
        const errRes = await fetch(`/api/raw-log?path=${encodeURIComponent(err_log)}`).catch(() => null)
        if (errRes?.ok) {
          const text = await errRes.text()
          lines.push('--- stderr ---', text.slice(-5000))
        }
      }
      setLogOutput(lines.join('\n') || 'No log output available.')
    } catch (err) {
      setLogOutput(`Failed to fetch logs: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLogLoading(false)
    }
  }, [decodedName])

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'reload' | 'delete') => {
    if (!decodedName) return
    setActionLoading(true)
    try {
      const actionMap = {
        start: api.startProcess,
        stop: api.stopProcess,
        restart: api.restartProcess,
        reload: api.reloadProcess,
        delete: api.deleteProcess,
      }
      await actionMap[action](decodedName)
      if (action === 'delete') {
        navigate('/')
        return
      }
      await fetchProcess()
    } catch (err) {
      console.error(`${action} failed:`, err)
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-2 text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading process details...
        </div>
      </div>
    )
  }

  if (error || !process) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error || 'Process not found'}
        </div>
      </div>
    )
  }

  const { pm2_env, monit, pid } = process
  const status = pm2_env?.status || 'unknown'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{decodedName}</h1>
            <Badge className={statusBgColor(status)} variant="outline">
              {status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            PID {pid} &middot; pm_id {process.pm_id}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('start')}
            disabled={actionLoading || status === 'online' || status === 'launching'}
          >
            <Play className="h-4 w-4 mr-1" /> Start
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('stop')}
            disabled={actionLoading || status !== 'online'}
          >
            <Square className="h-4 w-4 mr-1" /> Stop
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('restart')}
            disabled={actionLoading}
          >
            <RotateCcw className="h-4 w-4 mr-1" /> Restart
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('reload')}
            disabled={actionLoading || status !== 'online'}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Reload
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
            disabled={actionLoading}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">CPU Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCPU(monit?.cpu)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Memory Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatBytes(monit?.memory)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatUptime(pm2_env?.pm_uptime ? Math.floor((Date.now() - pm2_env.pm_uptime) / 1000) : 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Process Info</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground mb-0.5">Exec Interpreter</div>
              <div className="font-medium">{pm2_env?.exec_interpreter || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Exec Mode</div>
              <div className="font-medium">{pm2_env?.exec_mode || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Instances</div>
              <div className="font-medium">{pm2_env?.instances ?? 1}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Restarts</div>
              <div className="font-medium">{pm2_env?.restart_time ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Unstable Restarts</div>
              <div className="font-medium">{pm2_env?.unstable_restarts ?? 0}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Namespace</div>
              <div className="font-medium">{pm2_env?.namespace || 'default'}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Node Version</div>
              <div className="font-medium">{pm2_env?.node_version || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Version</div>
              <div className="font-medium">{pm2_env?.version || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground mb-0.5">Created</div>
              <div className="font-medium">
                {pm2_env?.created_at
                  ? new Date(pm2_env.created_at).toLocaleString()
                  : '-'}
              </div>
            </div>
          </div>

          {Array.isArray(pm2_env?._) && pm2_env._.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <div className="text-sm text-muted-foreground mb-1">Command</div>
                <code className="block rounded bg-muted p-3 text-xs font-mono break-all">
                  {pm2_env._.join(' ')}
                </code>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Logs
            </CardTitle>
            <CardDescription>Recent log output from stdout and stderr</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLogs} disabled={logLoading}>
            <FileText className={`h-4 w-4 mr-2 ${logLoading ? 'animate-spin' : ''}`} />
            Load Logs
          </Button>
        </CardHeader>
        <CardContent>
          {logOutput ? (
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
              {logOutput}
            </pre>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Click "Load Logs" to fetch the latest output
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Process</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{decodedName}</strong>? This will stop the process and remove it from PM2.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setDeleteOpen(false); handleAction('delete') }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
