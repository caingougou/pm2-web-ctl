import { Routes, Route } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import Dashboard from '@/pages/Dashboard'
import ProcessDetailPage from '@/pages/ProcessDetailPage'

export default function App() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 max-w-screen-2xl items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-primary"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
            </svg>
            <span className="font-semibold">pm2ctl</span>
            <span className="text-sm text-muted-foreground">Process Manager</span>
          </div>
        </header>
        <main className="container max-w-screen-2xl py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/process/:name" element={<ProcessDetailPage />} />
          </Routes>
        </main>
      </div>
    </TooltipProvider>
  )
}
