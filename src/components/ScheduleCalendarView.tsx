import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Plus, Trash2, Wrench } from 'lucide-react';
import type { Booking, HallBookStateResponse, StaffUser } from '../types';
import {
  BOOKING_STATUS_META,
  canCreateBooking,
  canManageMaintenance,
  formatDate,
} from '../utils/format';

interface ScheduleCalendarViewProps {
  state: HallBookStateResponse;
  currentUser: StaffUser;
  onOpenBooking: (booking: Booking) => void;
  onNewBooking: (
    prefillHallId?: string,
    prefillDate?: string,
    prefillStartTime?: string,
    prefillEndTime?: string
  ) => void;
  onRefreshState: (next: HallBookStateResponse) => void;
  authToken: string;
}

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const ScheduleCalendarView: React.FC<ScheduleCalendarViewProps> = ({
  state,
  currentUser,
  onOpenBooking,
  onNewBooking,
  onRefreshState,
  authToken,
}) => {
  const [selectedHallId, setSelectedHallId] = useState<string>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [maintForm, setMaintForm] = useState({
    hallId: state.halls[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '08:00',
    endTime: '14:00',
    reason: '',
  });
  const [maintError, setMaintError] = useState('');
  const [maintNotice, setMaintNotice] = useState('');
  const canMaintain = canManageMaintenance(currentUser.role);
  const outOfServiceHalls = state.halls.filter((h) => !h.active);

  const weekDates = useMemo(() => {
    const base = new Date();
    base.setDate(base.getDate() + weekOffset * 7);
    const list: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      list.push(d.toISOString().slice(0, 10));
    }
    return list;
  }, [weekOffset]);

  const visibleHalls =
    selectedHallId === 'all'
      ? state.halls
      : state.halls.filter((h) => h.id === selectedHallId);

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setMaintError('');
    setMaintNotice('');
    if (!maintForm.reason.trim()) {
      setMaintError('Maintenance reason is required.');
      return;
    }
    const res = await fetch('/api/setup/maintenance', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && authToken !== 'cookie-session'
          ? { Authorization: `Bearer ${authToken}` }
          : {}),
      },
      body: JSON.stringify(maintForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setMaintError(data.error || 'Failed to block maintenance.');
      return;
    }
    onRefreshState(data.state);
    setShowMaintModal(false);
    setMaintForm((f) => ({ ...f, reason: '' }));
    if (Array.isArray(data.impactedBookings) && data.impactedBookings.length > 0) {
      setMaintNotice(
        `Maintenance hold placed. Alert Manager/Booking Officer to review overlapping booking(s): ${data.impactedBookings.join(', ')}.`
      );
    } else {
      setMaintNotice('Venue maintenance block scheduled cleanly.');
    }
  };

  const handleClearMaintenance = async (blockId: string) => {
    setMaintNotice('');
    const res = await fetch(`/api/setup/maintenance/${blockId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers:
        authToken && authToken !== 'cookie-session'
          ? { Authorization: `Bearer ${authToken}` }
          : undefined,
    });
    const data = await res.json();
    if (res.ok) {
      onRefreshState(data.state);
      setMaintNotice('Maintenance hold cleared; venue slot reopened for booking.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
            Hall Schedule & Availability Matrix
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Live sessions, clearing & prep turnaround windows (same-day split bookings supported), and maintenance blocks
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="px-2.5 py-2 hover:bg-slate-50 text-slate-700 border-r border-slate-200"
              aria-label="Previous 10 days"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
            >
              Today Window
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="px-2.5 py-2 hover:bg-slate-50 text-slate-700 border-l border-slate-200"
              aria-label="Next 10 days"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {canMaintain && (
            <button
              type="button"
              onClick={() => setShowMaintModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] hover:bg-[#13294B] text-white rounded-lg whitespace-nowrap shrink-0"
            >
              <Wrench className="w-3.5 h-3.5 text-[#D4AF37]" />
              Put Venue Under Maintenance
            </button>
          )}

          {canCreateBooking(currentUser.role) && (
            <button
              type="button"
              onClick={() => onNewBooking()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] hover:bg-[#13294B] text-white rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
              Book Hall
            </button>
          )}
        </div>
      </div>

      {maintNotice && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-2">
          <span>{maintNotice}</span>
          <button
            type="button"
            onClick={() => setMaintNotice('')}
            className="text-amber-800 font-semibold hover:underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {outOfServiceHalls.length > 0 && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-900">
          <strong>Out of Service (System Admin Hold):</strong>{' '}
          {outOfServiceHalls.map((h) => h.name).join(', ')} — closed to new bookings until reopened by System Admin.
        </div>
      )}

      {/* Hall Filter & Timeline Legend */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedHallId('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedHallId === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Halls
          </button>
          {state.halls.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => setSelectedHallId(h.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                selectedHallId === h.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {h.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#0B1F3A]" />
            Event Session
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#D4AF37]" />
            Clearing & Prep Buffer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 border border-slate-300" />
            Open for 2nd Booking
          </span>
        </div>
      </div>

      {/* Responsive Day-by-Day Agenda Grid */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {weekDates.map((dateStr) => {
          const daySessions = state.bookings
            .filter((b) => !['cancelled', 'expired'].includes(b.status))
            .flatMap((b) =>
              b.sessions
                .filter(
                  (s) =>
                    s.status !== 'cancelled' &&
                    s.date === dateStr &&
                    (selectedHallId === 'all' || b.hallId === selectedHallId)
                )
                .map((s) => ({ booking: b, session: s }))
            )
            .sort((a, b) => toMins(a.session.startTime) - toMins(b.session.startTime));

          const dayMaint = state.maintenanceBlocks.filter(
            (m) => m.date === dateStr && (selectedHallId === 'all' || m.hallId === selectedHallId)
          );

          const dayWaitlist = state.waitlist.filter(
            (w) =>
              w.desiredDate === dateStr &&
              (selectedHallId === 'all' || w.hallId === selectedHallId)
          );

          // Group busy halls on this date to compute turnaround timeline + same-day open windows
          const activeHallIdsOnDay = Array.from(
            new Set([
              ...daySessions.map((d) => d.booking.hallId),
              ...dayMaint.map((m) => m.hallId),
            ])
          );

          return (
            <div
              key={dateStr}
              className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start"
            >
              <div className="lg:col-span-3 flex items-center justify-between lg:block">
                <div>
                  <p className="text-sm font-semibold text-slate-900 font-mono tabular-nums">
                    {formatDate(dateStr)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-US', {
                      weekday: 'long',
                    })}
                  </p>
                </div>
                {canCreateBooking(currentUser.role) && (
                  <button
                    type="button"
                    onClick={() =>
                      onNewBooking(
                        selectedHallId !== 'all' ? selectedHallId : visibleHalls[0]?.id,
                        dateStr
                      )
                    }
                    className="lg:mt-2 text-xs font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap"
                  >
                    + Add on {dateStr.slice(5)}
                  </button>
                )}
              </div>

              <div className="lg:col-span-9 space-y-3">
                {daySessions.length === 0 && dayMaint.length === 0 ? (
                  <div className="py-2 text-xs text-slate-400 flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>All selected halls open</span>
                  </div>
                ) : (
                  <>
                    {/* Turnaround Timeline Bars per Active Hall */}
                    <div className="space-y-2.5">
                      {activeHallIdsOnDay.map((hId) => {
                        const hall = state.halls.find((h) => h.id === hId);
                        if (!hall) return null;
                        const buffer = hall.bufferMinutes;
                        const hallEvents = daySessions.filter((d) => d.booking.hallId === hId);
                        const hallMaint = dayMaint.filter((m) => m.hallId === hId);

                        const blocks = [
                          ...hallEvents.map((e) => ({
                            start: toMins(e.session.startTime),
                            end: toMins(e.session.endTime),
                            type: 'event' as const,
                          })),
                          ...hallMaint.map((m) => ({
                            start: toMins(m.startTime),
                            end: toMins(m.endTime),
                            type: 'maint' as const,
                          })),
                        ].sort((a, b) => a.start - b.start);

                        const earliestStart = blocks[0]?.start ?? 24 * 60;
                        const latestEnd = blocks.reduce((mx, b) => Math.max(mx, b.end), 0);
                        const morningSlotEndMins = earliestStart - buffer;
                        const eveningSlotStartMins = latestEnd + buffer;

                        const canBookMorningBefore = morningSlotEndMins >= 12 * 60; // At least 08:00–12:00 (4h)
                        const canBookEveningAfter = eveningSlotStartMins <= 19 * 60; // Open by 19:00 or earlier

                        const TIMELINE_START = 6 * 60; // 06:00
                        const TIMELINE_SPAN = 18 * 60; // 06:00 to 24:00 (1080 mins)

                        return (
                          <div key={hId} className="space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-semibold text-slate-800">
                                {hall.name}{' '}
                                <span className="font-normal text-slate-500 font-mono tabular-nums">
                                  ({buffer}m turnaround buffer)
                                </span>
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {canBookMorningBefore && (
                                  <span className="text-[11px] font-medium text-emerald-800 font-mono tabular-nums">
                                    Open until {minsToHHMM(morningSlotEndMins)}
                                  </span>
                                )}
                                {canBookEveningAfter && (
                                  <span className="text-[11px] font-medium text-emerald-800 font-mono tabular-nums">
                                    Available from {minsToHHMM(eveningSlotStartMins)}
                                  </span>
                                )}
                                {canCreateBooking(currentUser.role) && canBookMorningBefore && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onNewBooking(
                                        hall.id,
                                        dateStr,
                                        '08:00',
                                        minsToHHMM(Math.min(14 * 60, morningSlotEndMins))
                                      )
                                    }
                                    className="px-2 py-0.5 text-[11px] font-semibold text-[#0B1F3A] bg-[#FAF6EC] hover:bg-[#F3DFAC]/50 border border-[#C89B3C]/60 rounded transition-colors font-mono tabular-nums"
                                  >
                                    Book 08:00–{minsToHHMM(Math.min(14 * 60, morningSlotEndMins))}
                                  </button>
                                )}
                                {canCreateBooking(currentUser.role) && canBookEveningAfter && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onNewBooking(
                                        hall.id,
                                        dateStr,
                                        minsToHHMM(eveningSlotStartMins),
                                        '22:00'
                                      )
                                    }
                                    className="px-2 py-0.5 text-[11px] font-semibold text-[#0B1F3A] bg-[#FAF6EC] hover:bg-[#F3DFAC]/50 border border-[#C89B3C]/60 rounded transition-colors font-mono tabular-nums"
                                  >
                                    Book {minsToHHMM(eveningSlotStartMins)}–22:00
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* 06:00–24:00 SVG Turnaround Timeline Bar */}
                            <div className="space-y-0.5">
                              <svg
                                viewBox={`0 0 ${TIMELINE_SPAN} 14`}
                                className="w-full h-3 rounded bg-slate-100 border border-slate-200 block"
                                role="img"
                                aria-label={`${hall.name} availability timeline from 06:00 to 24:00`}
                              >
                                {blocks.map((blk, i) => {
                                  const preBufStart = Math.max(0, blk.start - buffer - TIMELINE_START);
                                  const evStart = Math.max(0, blk.start - TIMELINE_START);
                                  const evEnd = Math.min(TIMELINE_SPAN, Math.max(0, blk.end - TIMELINE_START));
                                  const postBufEnd = Math.min(TIMELINE_SPAN, Math.max(0, blk.end + buffer - TIMELINE_START));
                                  return (
                                    <g key={i}>
                                      {evStart > preBufStart && (
                                        <rect
                                          x={preBufStart}
                                          y={0}
                                          width={evStart - preBufStart}
                                          height={14}
                                          fill="#D4AF37"
                                          opacity={0.7}
                                        />
                                      )}
                                      {evEnd > evStart && (
                                        <rect
                                          x={evStart}
                                          y={0}
                                          width={evEnd - evStart}
                                          height={14}
                                          fill={blk.type === 'maint' ? '#B45309' : '#0B1F3A'}
                                        />
                                      )}
                                      {postBufEnd > evEnd && (
                                        <rect
                                          x={evEnd}
                                          y={0}
                                          width={postBufEnd - evEnd}
                                          height={14}
                                          fill="#C89B3C"
                                          opacity={0.85}
                                        />
                                      )}
                                    </g>
                                  );
                                })}
                              </svg>
                              <div className="flex justify-between text-[10px] font-mono text-slate-400 tabular-nums">
                                <span>06:00</span>
                                <span>12:00</span>
                                <span>16:00</span>
                                <span>22:00</span>
                                <span>24:00</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Session & Turnaround Cards */}
                    {daySessions.map(({ booking, session }) => {
                      const hall = state.halls.find((h) => h.id === booking.hallId);
                      const meta = BOOKING_STATUS_META[booking.status];
                      const buffer = hall?.bufferMinutes ?? 120;
                      const clearedAt = minsToHHMM(toMins(session.endTime) + buffer);
                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => onOpenBooking(booking)}
                          className="w-full text-left p-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                              <span className="font-mono font-semibold text-slate-900 tabular-nums">
                                {session.startTime}–{session.endTime}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-slate-700">{hall?.name}</span>
                              <span aria-hidden="true">·</span>
                              <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
                            </div>
                            <p className="mt-1 text-sm font-semibold text-slate-900 truncate">
                              {booking.eventTitle}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
                              <span>
                                {booking.id} · {session.layout} layout · {session.expectedGuests} guests
                                {booking.roomLines.length > 0
                                  ? ` · ${booking.roomLines.reduce((s, r) => s + r.count, 0)} rooms`
                                  : ''}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono text-amber-800">
                                <Clock className="w-3 h-3 shrink-0" />
                                {session.endTime}–{clearedAt} Clearing & Prep ({buffer}m)
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-slate-700 shrink-0">
                            Inspect →
                          </span>
                        </button>
                      );
                    })}

                    {dayMaint.map((m) => {
                      const hall = state.halls.find((h) => h.id === m.hallId);
                      const buffer = hall?.bufferMinutes ?? 120;
                      const clearedAt = minsToHHMM(toMins(m.endTime) + buffer);
                      return (
                        <div
                          key={m.id}
                          className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <span className="font-mono font-semibold text-amber-900 tabular-nums">
                              {m.startTime}–{m.endTime}
                            </span>{' '}
                            <span className="font-medium text-amber-900">
                              · {hall?.name} Maintenance (hall clears at {clearedAt})
                            </span>
                            <p className="text-amber-800 mt-0.5">
                              {m.reason} · Set by {m.createdBy}
                            </p>
                          </div>
                          {canMaintain ? (
                            <button
                              type="button"
                              onClick={() => handleClearMaintenance(m.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-red-50 text-red-700 border border-amber-300 rounded-md font-semibold shrink-0"
                            >
                              <Trash2 className="w-3 h-3" />
                              Clear Hold
                            </button>
                          ) : (
                            <span className="text-amber-800 font-medium shrink-0">
                              System Admin Hold
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {dayWaitlist.length > 0 && (
                  <div className="pt-1 text-xs text-slate-600">
                    Waitlist ({dayWaitlist.length}):{' '}
                    {dayWaitlist
                      .map((w) => `${w.clientName} (${w.status})`)
                      .join(', ')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Maintenance Block Modal */}
      {showMaintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Schedule Hall Maintenance Block</h2>
            <form onSubmit={handleAddMaintenance} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hall</label>
                <select
                  value={maintForm.hallId}
                  onChange={(e) => setMaintForm({ ...maintForm, hallId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                >
                  {state.halls.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={maintForm.date}
                    onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Start</label>
                  <input
                    type="time"
                    value={maintForm.startTime}
                    onChange={(e) => setMaintForm({ ...maintForm, startTime: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">End</label>
                  <input
                    type="time"
                    value={maintForm.endTime}
                    onChange={(e) => setMaintForm({ ...maintForm, endTime: e.target.value })}
                    className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={maintForm.reason}
                  onChange={(e) => setMaintForm({ ...maintForm, reason: e.target.value })}
                  placeholder="e.g. Chandelier maintenance & acoustic inspection"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
              </div>
              {maintError && <p className="text-xs text-red-700">{maintError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMaintModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                >
                  Save Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
