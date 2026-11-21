import { useEffect, useMemo, useState } from 'react'
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
  type KlubyParticipant,
} from '../../utils/kluby/client'

interface KlubyImportModalProps {
  onImport: (rawNames: string[]) => void
  onClose: () => void
}

type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: T }

const MAX_VISIBLE_CLUBS = 50

function toIsoDate(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function shiftDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  return toIsoDate(new Date(year, month - 1, day + days))
}

/** Runs `load` whenever `key` changes and exposes loading/error/ready state. */
function useLoader<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (key === null) return
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
    // `load` is recreated every render; `key` captures its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt])

  return { state, retry: () => setAttempt((n) => n + 1) }
}

const rowClass =
  'flex min-h-[44px] w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-padel-500/50 hover:bg-surface-muted sm:min-h-[46px] md:min-h-[48px]'

export function KlubyImportModal({ onImport, onClose }: KlubyImportModalProps) {
  const { t } = useTranslation()
  const [club, setClub] = useState<KlubyClub | null>(null)
  const [event, setEvent] = useState<KlubyEvent | null>(null)
  const [date, setDate] = useState(() => toIsoDate(new Date()))

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const goBack = () => {
    if (event) setEvent(null)
    else setClub(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="kluby-import-title"
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-xl border border-border bg-background-elevated shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-center gap-2 border-b border-border p-4 sm:p-5">
          {club && (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label={t('create.players.kluby.back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 id="kluby-import-title" className="truncate text-lg font-bold text-foreground">
              {event?.title || club?.name || t('create.players.kluby.title')}
            </h3>
            {club && (
              <p className="truncate text-sm text-foreground-muted">
                {event ? `${club.name} · ${date} · ${event.start}–${event.end}` : club.address}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {!club ? (
            <ClubStep onPick={setClub} />
          ) : !event ? (
            <EventStep club={club} date={date} onDateChange={setDate} onPick={setEvent} />
          ) : (
            <ParticipantsStep club={club} event={event} onImport={onImport} />
          )}
        </div>

        <p className="border-t border-border px-4 py-2 text-center text-xs text-foreground-muted sm:px-5">
          {t('create.players.kluby.source')}
        </p>
      </div>
    </div>
  )
}

function ClubStep({ onPick }: { onPick: (club: KlubyClub) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchClubs(query), [query])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('create.players.kluby.searchClubPlaceholder')}
          autoFocus
          className="min-h-[44px] w-full rounded-lg border border-border bg-surface py-2.5 pl-10 pr-4 text-base focus:border-padel-500 focus:outline-none sm:min-h-[46px] md:min-h-[48px]"
        />
      </div>
      <p className="text-sm text-foreground-muted">{t('create.players.kluby.clubsHint')}</p>

      {results.length === 0 ? (
        <p className="py-6 text-center text-foreground-muted">{t('create.players.kluby.noClubs')}</p>
      ) : (
        <ul className="space-y-2">
          {results.slice(0, MAX_VISIBLE_CLUBS).map((club) => (
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
      <div className="flex items-center justify-center gap-2 py-8 text-foreground-muted">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        {t('create.players.kluby.loading')}
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="space-y-3 py-6 text-center">
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
  onImport,
}: {
  club: KlubyClub
  event: KlubyEvent
  onImport: (rawNames: string[]) => void
}) {
  const { t } = useTranslation()
  const { state, retry } = useLoader(`${club.slug}|${event.id}`, (signal) => fetchEventParticipants(club.slug, event.id, signal))
  const participants: KlubyParticipant[] = state.status === 'ready' ? state.data.participants : []
  const [deselected, setDeselected] = useState<Set<string>>(new Set())
  const selected = participants.filter((p) => !deselected.has(p.id))

  const toggle = (id: string) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (participants.length === 0) {
    return <StatusMessage state={state} retry={retry} empty={t('create.players.kluby.noParticipants')} />
  }

  const allSelected = selected.length === participants.length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-foreground-muted">
          {state.status === 'ready' && state.data.capacity
            ? `${participants.length}/${state.data.capacity}`
            : participants.length}
        </span>
        <button
          type="button"
          onClick={() => setDeselected(allSelected ? new Set(participants.map((p) => p.id)) : new Set())}
          className="min-h-[44px] px-2 text-sm font-medium text-padel-500 hover:text-padel-400"
        >
          {allSelected ? t('create.players.kluby.selectNone') : t('create.players.kluby.selectAll')}
        </button>
      </div>

      <ul className="space-y-2">
        {participants.map((participant) => {
          const isSelected = !deselected.has(participant.id)
          return (
            <li key={participant.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggle(participant.id)}
                className={`${rowClass} ${isSelected ? 'border-padel-500/60' : 'opacity-60'}`}
              >
                <span
                  className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border ${
                    isSelected ? 'border-padel-500 bg-padel-500 text-background' : 'border-border'
                  }`}
                >
                  {isSelected && <Check className="h-4 w-4" />}
                </span>
                <span className="truncate text-foreground">{participant.name}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => onImport(selected.map((p) => p.name))}
        className="sticky bottom-0 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-padel-500 px-4 py-3 font-medium text-background transition-colors hover:bg-padel-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[46px] md:min-h-[48px]"
      >
        <Users className="h-5 w-5" />
        {t('create.players.kluby.addSelected', { count: selected.length })}
      </button>
    </div>
  )
}
