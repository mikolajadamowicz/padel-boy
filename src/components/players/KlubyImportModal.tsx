import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LoaderCircle,
  MapPin,
  Search,
  Users,
  X,
} from 'lucide-react'
import {
  fetchClubEvents,
  fetchEventParticipants,
  searchClubs,
  type KlubyClub,
  type KlubyEvent,
} from '../../utils/kluby/client'
import { planKlubyImport, type ImportedPlayers, type KlubyImportPlan } from '../../utils/kluby/playerNames'
import { MAX_PLAYERS } from '../../schemas/tournament'

interface KlubyImportModalProps {
  /** Current player list, so the modal can preview names and spot people already added. */
  players: string[]
  /** kluby.org profiles added by earlier imports. */
  imported: ImportedPlayers
  onImport: (plan: KlubyImportPlan) => void
  onClose: () => void
}

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T }

function toIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function parseIsoDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function shiftDate(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate)
  date.setDate(date.getDate() + days)
  return toIsoDate(date)
}

/** Runs `load` whenever `key` changes and exposes loading/error/ready state. */
function useLoader<T>(key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    load(controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error('kluby.org import failed:', error)
          setState({ status: 'error' })
        }
      })
    return () => controller.abort()
    // `key` lists every input `load` closes over; `load` itself is a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  return { state, retry: () => setAttempt((n) => n + 1) }
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside the dialog and returns focus to the opener on close. */
function useFocusTrap(dialogRef: RefObject<HTMLDivElement | null>) {
  // Read during the first render: by the time effects run, autoFocus has moved focus into the dialog.
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  useEffect(() => () => opener?.focus(), [opener])

  return (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

const rowClass =
  'flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-padel-500/50 hover:bg-surface-muted sm:min-h-[46px] md:min-h-[48px]'

const iconButtonClass =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface hover:text-foreground'

export function KlubyImportModal({ players, imported, onImport, onClose }: KlubyImportModalProps) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const [club, setClub] = useState<KlubyClub | null>(null)
  const [event, setEvent] = useState<KlubyEvent | null>(null)
  const [date, setDate] = useState(() => toIsoDate(new Date()))
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const trapTab = useFocusTrap(dialogRef)

  // Each step replaces the content, so move focus to the title of the new step.
  useEffect(() => {
    if (club) titleRef.current?.focus()
  }, [club, event])

  const goBack = () => {
    if (event) setEvent(null)
    else setClub(null)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (club) goBack()
      else onClose()
    }
    trapTab(e)
  }

  const formattedDate = new Intl.DateTimeFormat(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })
    .format(parseIsoDate(date))

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kluby-import-title"
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-background-elevated shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-center gap-2 border-b border-border p-4 sm:p-5">
          {club && (
            <button type="button" onClick={goBack} className={iconButtonClass} aria-label={t('create.players.kluby.back')}>
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 id="kluby-import-title" ref={titleRef} tabIndex={-1} className="truncate text-lg font-bold text-foreground focus:outline-none">
              {event?.title || club?.name || t('create.players.kluby.title')}
            </h3>
            {club && (
              <p className="truncate text-sm text-foreground-muted">
                {event ? `${club.name} · ${formattedDate} · ${event.start}–${event.end}` : club.address}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className={iconButtonClass} aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {!club ? (
            <ClubStep query={query} onQueryChange={setQuery} onPick={setClub} />
          ) : !event ? (
            <EventStep club={club} date={date} onDateChange={setDate} onPick={setEvent} />
          ) : (
            <ParticipantsStep club={club} event={event} players={players} imported={imported} onImport={onImport} />
          )}
        </div>

        <p className="border-t border-border px-4 py-2 text-center text-xs text-foreground-muted sm:px-5">
          {t('create.players.kluby.source')}
        </p>
      </div>
    </div>,
    document.body,
  )
}

function ClubStep({
  query,
  onQueryChange,
  onPick,
}: {
  query: string
  onQueryChange: (query: string) => void
  onPick: (club: KlubyClub) => void
}) {
  const { t } = useTranslation()
  const results = useMemo(() => searchClubs(query), [query])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t('create.players.kluby.searchClubPlaceholder')}
          aria-label={t('create.players.kluby.searchClubPlaceholder')}
          autoFocus
          className="min-h-[44px] w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-base focus:border-padel-500 focus:outline-none sm:min-h-[46px] md:min-h-[48px]"
        />
      </div>
      <p className="text-sm text-foreground-muted">{t('create.players.kluby.clubsHint')}</p>

      {results.length === 0 ? (
        <p className="py-6 text-center text-foreground-muted">{t('create.players.kluby.noClubs')}</p>
      ) : (
        <ul className="space-y-2">
          {results.map((club) => (
            <li key={club.slug}>
              <button type="button" onClick={() => onPick(club)} className={rowClass}>
                <MapPin className="h-5 w-5 flex-shrink-0 text-padel-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{club.name}</span>
                  <span className="block truncate text-sm text-foreground-muted">{club.address}</span>
                </span>
                <ChevronRight className="h-5 w-5 flex-shrink-0 text-foreground-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function StatusMessage({ state, retry, empty }: { state: LoadState<unknown>; retry: () => void; empty: string }) {
  const { t } = useTranslation()

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-foreground-muted" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        {t('create.players.kluby.loading')}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-3 py-6 text-center" role="alert">
        <p className="text-red-400">{t('create.players.kluby.loadError')}</p>
        <button
          type="button"
          onClick={retry}
          className="min-h-[44px] rounded-lg bg-surface px-4 py-2 font-medium text-foreground transition-colors hover:bg-surface-muted"
        >
          {t('create.players.kluby.retry')}
        </button>
      </div>
    )
  }
  return <p className="py-6 text-center text-foreground-muted">{empty}</p>
}

function EventStep({
  club,
  date,
  onDateChange,
  onPick,
}: {
  club: KlubyClub
  date: string
  onDateChange: (date: string) => void
  onPick: (event: KlubyEvent) => void
}) {
  const { t } = useTranslation()
  const { state, retry } = useLoader(`${club.slug}|${date}`, (signal) => fetchClubEvents(club.slug, date, signal))
  const dayButtonClass =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-surface text-foreground-muted transition-colors hover:text-foreground'

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onDateChange(shiftDate(date, -1))} className={dayButtonClass} aria-label={t('create.players.kluby.previousDay')}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <label className="relative flex-1">
          <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-muted" />
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && onDateChange(e.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-3 text-base focus:border-padel-500 focus:outline-none"
          />
        </label>
        <button type="button" onClick={() => onDateChange(shiftDate(date, 1))} className={dayButtonClass} aria-label={t('create.players.kluby.nextDay')}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {state.status === 'ready' && state.data.length > 0 ? (
        <ul className="space-y-2">
          {state.data.map((event) => (
            <li key={event.id}>
              <button type="button" onClick={() => onPick(event)} className={rowClass}>
                <Clock3 className="h-5 w-5 flex-shrink-0 text-padel-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">{event.title}</span>
                  <span className="block text-sm text-foreground-muted">
                    {event.start}–{event.end}
                  </span>
                </span>
                {event.participants !== null && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-padel-500/10 px-2 py-0.5 text-sm text-padel-500">
                    <Users className="h-3.5 w-3.5" />
                    {event.capacity ? `${event.participants}/${event.capacity}` : event.participants}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <StatusMessage state={state} retry={retry} empty={t('create.players.kluby.noEvents')} />
      )}
    </div>
  )
}

function ParticipantsStep({
  club,
  event,
  players,
  imported,
  onImport,
}: {
  club: KlubyClub
  event: KlubyEvent
  players: string[]
  imported: ImportedPlayers
  onImport: (plan: KlubyImportPlan) => void
}) {
  const { t } = useTranslation()
  const { state, retry } = useLoader(`${club.slug}|${event.id}`, (signal) => fetchEventParticipants(club.slug, event.id, signal))
  const [deselected, setDeselected] = useState<Set<string>>(new Set())

  const participants = useMemo(() => (state.status === 'ready' ? state.data.participants : []), [state])
  const listedIds = useMemo(
    () => new Set(planKlubyImport(participants, players, imported).alreadyListed.map((p) => p.id)),
    [participants, players, imported],
  )
  const selectable = participants.filter((p) => !listedIds.has(p.id))
  const selected = selectable.filter((p) => !deselected.has(p.id))
  const plan = planKlubyImport(selected, players, imported)
  const nameFor = new Map(plan.toAdd.map(({ participant, name }) => [participant.id, name]))

  if (participants.length === 0) {
    return <StatusMessage state={state} retry={retry} empty={t('create.players.kluby.noParticipants')} />
  }

  const allSelected = selected.length === selectable.length

  const toggle = (id: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground-muted">
          {state.status === 'ready' && state.data.capacity
            ? `${participants.length}/${state.data.capacity}`
            : participants.length}
        </span>
        {selectable.length > 0 && (
          <button
            type="button"
            onClick={() => setDeselected(allSelected ? new Set(selectable.map((p) => p.id)) : new Set())}
            className="min-h-[44px] px-2 text-sm font-medium text-padel-500 hover:text-padel-400"
          >
            {allSelected ? t('create.players.kluby.selectNone') : t('create.players.kluby.selectAll')}
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {participants.map((participant) => {
          const isListed = listedIds.has(participant.id)
          const isSelected = !isListed && !deselected.has(participant.id)
          const addedAs = nameFor.get(participant.id)
          return (
            <li key={participant.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                disabled={isListed}
                onClick={() => toggle(participant.id)}
                className={`${rowClass} disabled:cursor-not-allowed ${isSelected ? 'border-padel-500/60' : 'opacity-60'}`}
              >
                <span
                  className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                    isSelected ? 'border-padel-500 bg-padel-500 text-background' : 'border-foreground-muted'
                  }`}
                >
                  {isSelected && <Check className="h-4 w-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground">{participant.name}</span>
                  {isListed ? (
                    <span className="block truncate text-sm text-foreground-muted">{t('create.players.kluby.alreadyListed')}</span>
                  ) : addedAs && addedAs !== participant.name ? (
                    <span className="block truncate text-sm text-foreground-muted">{t('create.players.kluby.addedAs', { name: addedAs })}</span>
                  ) : null}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {plan.overLimit.length > 0 && (
        <p className="text-sm text-red-400" role="alert">
          {t('create.players.kluby.limitReached', { max: MAX_PLAYERS })}
        </p>
      )}

      <button
        type="button"
        disabled={plan.toAdd.length === 0}
        onClick={() => onImport(plan)}
        className="sticky bottom-0 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-padel-500 px-4 py-3 font-medium text-background transition-colors hover:bg-padel-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[46px] md:min-h-[48px]"
      >
        <Users className="h-5 w-5" />
        {t('create.players.kluby.addSelected', { count: plan.toAdd.length })}
      </button>
    </div>
  )
}
