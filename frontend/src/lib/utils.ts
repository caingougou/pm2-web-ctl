import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0 || parts.length === 0) parts.push(`${m}m`)
  return parts.join(' ')
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatCPU(cpu: number): string {
  if (cpu == null) return '-'
  return `${cpu.toFixed(1)}%`
}

export function statusColor(status: string): string {
  switch (status) {
    case 'online':
      return 'text-green-500'
    case 'stopped':
      return 'text-gray-500'
    case 'stopping':
      return 'text-yellow-500'
    case 'errored':
      return 'text-red-500'
    case 'launching':
      return 'text-blue-500'
    default:
      return 'text-muted-foreground'
  }
}

export function statusBgColor(status: string): string {
  switch (status) {
    case 'online':
      return 'bg-green-500/10 text-green-600 border-green-200'
    case 'stopped':
      return 'bg-gray-100 text-gray-600 border-gray-200'
    case 'stopping':
      return 'bg-yellow-500/10 text-yellow-600 border-yellow-200'
    case 'errored':
      return 'bg-red-500/10 text-red-600 border-red-200'
    case 'launching':
      return 'bg-blue-500/10 text-blue-600 border-blue-200'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}
