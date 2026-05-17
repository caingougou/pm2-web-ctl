import * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Play,
  Square,
  RotateCcw,
  RefreshCw,
  Trash2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react'
import type { PM2Process, PortInfo } from '@/lib/api'
import { formatUptime, formatBytes, formatCPU, statusBgColor } from '@/lib/utils'

interface ProcessCardProps {
  process: PM2Process
  ports?: PortInfo[]
  onAction: (name: string, action: 'start' | 'stop' | 'restart' | 'reload' | 'delete') => void
  loading?: boolean
}

export default function ProcessCard({ process, ports, onAction, loading }: ProcessCardProps) {
  const navigate = useNavigate()
  const { name, pm_id, monit, pm2_env, pid } = process
  const status = pm2_env?.status || 'unknown'
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
              status === 'online' ? 'bg-green-500' :
              status === 'stopped' ? 'bg-gray-400' :
              status === 'errored' ? 'bg-red-500' :
              status === 'launching' ? 'bg-blue-400' :
              'bg-yellow-400'
            }`} />
            <div className="min-w-0">
              <button
                onClick={() => navigate(`/process/${encodeURIComponent(name)}`)}
                className="font-semibold text-sm truncate block max-w-[200px] hover:text-primary transition-colors text-left"
              >
                {name}
              </button>
              <span className="text-xs text-muted-foreground">
                PID {pid} &middot; pm_id {pm_id}
              </span>
            </div>
          </div>
          <Badge className={statusBgColor(status)} variant="outline">
            {status}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">CPU</div>
            <div className="text-sm font-medium">{formatCPU(monit?.cpu)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Memory</div>
            <div className="text-sm font-medium">{formatBytes(monit?.memory)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-0.5">Uptime</div>
            <div className="text-sm font-medium">
              {formatUptime(pm2_env?.pm_uptime ? Math.floor((Date.now() - pm2_env.pm_uptime) / 1000) : 0)}
            </div>
          </div>
        </div>

        {pm2_env?.instances > 1 && (
          <div className="text-xs text-muted-foreground mb-3">
            {pm2_env.instances} instances &middot; {pm2_env.exec_mode}
          </div>
        )}

        <div className="flex items-center gap-1 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction(name, 'start')}
                  disabled={loading || status === 'online' || status === 'launching'}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Start</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction(name, 'stop')}
                  disabled={loading || status !== 'online'}
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction(name, 'restart')}
                  disabled={loading}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Restart</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAction(name, 'reload')}
                  disabled={loading || status !== 'online'}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </Tooltip>

          <div className="flex-1" />

          {ports && ports.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1 h-8 text-xs">
                  <ExternalLink className="h-3 w-3" />
                  {ports.length} port{ports.length > 1 ? 's' : ''}
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[120px]">
                {ports.map((p, i) => {
                  const url = p.host === '0.0.0.0' ? `http://${window.location.hostname}:${p.port}` : `http://${p.host}:${p.port}`
                  return (
                    <React.Fragment key={p.port}>
                      {i > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem asChild>
                        <a href={url} target="_blank" rel="noreferrer" className="cursor-pointer">
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span className="font-mono text-xs">{p.host}:{p.port}</span>
                        </a>
                      </DropdownMenuItem>
                    </React.Fragment>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/process/${encodeURIComponent(name)}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Details</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteOpen(true)}
                  disabled={loading}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </CardContent>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Process</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{name}</strong>? This will stop the process and remove it from PM2.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setDeleteOpen(false); onAction(name, 'delete') }}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
