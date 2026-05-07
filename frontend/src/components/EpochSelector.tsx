import { useMemo } from 'react'
import { Select, type SelectOption } from './common/Select'

interface EpochSelectorProps {
  currentEpochId: number
  selectedEpochId: number | null
  onSelectEpoch: (epochId: number | null) => void
  disabled: boolean
}

export function EpochSelector({
  currentEpochId,
  selectedEpochId,
  onSelectEpoch,
  disabled,
}: EpochSelectorProps) {
  const options = useMemo<ReadonlyArray<SelectOption<string>>>(() => {
    const list: SelectOption<string>[] = []
    for (let i = currentEpochId; i >= Math.max(1, currentEpochId - 10); i--) {
      list.push({
        value: String(i),
        label: `Epoch #${i}`,
        hint: i === currentEpochId ? 'current' : undefined,
      })
    }
    return list
  }, [currentEpochId])

  const value = String(selectedEpochId ?? currentEpochId)

  const handleChange = (next: string) => {
    const epochId = parseInt(next, 10)
    if (Number.isNaN(epochId)) return
    onSelectEpoch(epochId === currentEpochId ? null : epochId)
  }

  return (
    <Select
      id="epoch-select"
      label="Epoch"
      variant="inline"
      value={value}
      onChange={handleChange}
      options={options}
      disabled={disabled}
      triggerClassName="sm:min-w-[180px]"
    />
  )
}
