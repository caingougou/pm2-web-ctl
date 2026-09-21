import { Check, Minus } from 'lucide-react'

interface SelectCheckboxProps {
  checked: boolean
  indeterminate?: boolean
  onChange: (next: boolean) => void
  label: string
}

export default function SelectCheckbox({ checked, indeterminate, onChange, label }: SelectCheckboxProps) {
  const active = checked || indeterminate
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:border-primary/60'
      }`}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" />
      ) : checked ? (
        <Check className="h-3 w-3" />
      ) : null}
    </button>
  )
}
