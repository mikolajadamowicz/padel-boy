import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Users, Plus, Download } from 'lucide-react'
import { toast } from 'sonner'
import { PlayerChip } from './PlayerChip'
import { PlayerInput } from './PlayerInput'
import { CollapsiblePanel } from '../ui'
import { isKlubyImportAvailable } from '../../utils/kluby/availability'
import { recordImport, type ImportedPlayers, type KlubyImportPlan } from '../../utils/kluby/playerNames'
import { MAX_PLAYERS } from '../../schemas/tournament'

// Loaded on first open so the club list isn't part of the Create page bundle.
const KlubyImportModal = lazy(() => import('./KlubyImportModal').then((m) => ({ default: m.KlubyImportModal })))

interface PlayersPanelProps {
  players: string[]
  onPlayersChange: (players: string[]) => void
  suggestions?: string[]
}

export function PlayersPanel({ players, onPlayersChange, suggestions = [] }: PlayersPanelProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(true)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [isKlubyOpen, setIsKlubyOpen] = useState(false)
  const [klubyImported, setKlubyImported] = useState<ImportedPlayers>(() => new Map())

  const handleRename = (index: number, newName: string) => {
    const updated = [...players]
    updated[index] = newName
    onPlayersChange(updated)
  }

  const handleDelete = (index: number) => {
    const updated = players.filter((_, i) => i !== index)
    onPlayersChange(updated)
  }

  const handleAddPlayer = () => {
    const trimmed = newPlayerName.trim()
    if (trimmed && !isDuplicate) {
      onPlayersChange([...players, trimmed])
      setNewPlayerName('')
    }
    setIsAdding(false)
  }

  const handleAddCancel = () => {
    setNewPlayerName('')
    setIsAdding(false)
  }

  const handleKlubyImport = (plan: KlubyImportPlan) => {
    setIsKlubyOpen(false)
    onPlayersChange([...players, ...plan.toAdd.map(({ name }) => name)])
    setKlubyImported((prev) => recordImport(prev, plan))

    const skipped = plan.alreadyListed.length
    toast.success(t('create.players.kluby.added', { count: plan.toAdd.length }), {
      description: skipped > 0 ? t('create.players.kluby.skippedListed', { count: skipped }) : undefined,
    })
    if (plan.overLimit.length > 0) {
      toast.error(t('create.players.kluby.limitReached', { max: MAX_PLAYERS }))
    }
  }

  const isDuplicate = players.some(
    player => player.toLowerCase() === newPlayerName.trim().toLowerCase()
  )

  return (
    <CollapsiblePanel
      icon={<Users className="w-5 h-5 inline-block mr-2" />}
      label={t('create.players.label')}
      value={players.length}
      isExpanded={isExpanded}
      onToggle={() => setIsExpanded(!isExpanded)}
    >
      <div className="space-y-4">
        {/* Player chips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {players.map((player, index) => (
            <PlayerChip
              key={`${player}-${index}`}
              name={player}
              index={index}
              onRename={(newName) => handleRename(index, newName)}
              onDelete={() => handleDelete(index)}
              suggestions={suggestions}
            />
          ))}
        </div>

        {/* Add player input */}
        {isAdding ? (
          <div className="flex gap-2 items-center">
            <div className="flex-1 max-w-xs">
              <PlayerInput
                value={newPlayerName}
                onChange={setNewPlayerName}
                onSubmit={handleAddPlayer}
                onCancel={handleAddCancel}
                suggestions={suggestions}
                placeholder={t('create.players.namePlaceholder')}
                autoFocus
                hasError={isDuplicate && newPlayerName.trim().length > 0}
              />
            </div>
            <button
              type="button"
              onClick={handleAddPlayer}
              disabled={isDuplicate || !newPlayerName.trim()}
              className="p-2.5 sm:p-2.5 md:p-3 bg-padel-500 text-background rounded-lg hover:bg-padel-400 transition-colors min-h-[44px] sm:min-h-[46px] md:min-h-[48px] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-padel-500"
              aria-label={t('create.players.add')}
            >
              <Plus className="w-6 h-6" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-5 py-2.5 sm:py-2.5 md:py-3 text-base text-foreground-muted hover:text-padel-500 border border-dashed border-border hover:border-padel-500/50 rounded-lg transition-colors min-h-[44px] sm:min-h-[46px] md:min-h-[48px]"
          >
            <Plus className="w-5 h-5" />
            {t('create.players.add')}
          </button>
          {isKlubyImportAvailable && (
            <button
              type="button"
              onClick={() => setIsKlubyOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 sm:py-2.5 md:py-3 text-base text-foreground-muted hover:text-padel-500 border border-dashed border-border hover:border-padel-500/50 rounded-lg transition-colors min-h-[44px] sm:min-h-[46px] md:min-h-[48px]"
            >
              <Download className="w-5 h-5" />
              {t('create.players.kluby.importButton')}
            </button>
          )}
          </div>
        )}

        {isKlubyOpen && (
          <Suspense fallback={null}>
            <KlubyImportModal
              players={players}
              imported={klubyImported}
              onImport={handleKlubyImport}
              onClose={() => setIsKlubyOpen(false)}
            />
          </Suspense>
        )}

        <p className="text-foreground-muted text-sm">
          {t('create.players.hint')}
        </p>
      </div>
    </CollapsiblePanel>
  )
}
