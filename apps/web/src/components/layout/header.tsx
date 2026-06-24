import { ThemeToggle } from './theme-toggle'

export function Header() {
  return (
    <header className="h-14 border-b bg-card px-4 flex items-center justify-between shrink-0 gap-3">
      <span className="text-xs text-muted-foreground font-medium">primeApps — modo de teste</span>
      <div className="flex items-center gap-1">
        <ThemeToggle />
      </div>
    </header>
  )
}
