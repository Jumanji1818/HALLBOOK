import React, { useMemo, useState } from 'react';
import {
  BellRing,
  CheckCircle2,
  Hotel,
  Plus,
  Search,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import type { Booking, BookingStatus, HallBookStateResponse, StaffUser } from '../types';
import {
  BOOKING_STATUS_META,
  canCreateBooking,
  canVerifyRooms,
  canViewBookingFinancials,
  canViewWaitlistAndOverdue,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../utils/format';

interface BookingsListViewProps {
  state: HallBookStateResponse;
  currentUser: StaffUser;
  authToken: string;
  onOpenBooking: (booking: Booking) => void;
  onNewBooking: () => void;
  onStateUpdated: (nextState: HallBookStateResponse) => void;
}

export const BookingsListView: React.FC<BookingsListViewProps> = ({
  state,
  currentUser,
  authToken,
  onOpenBooking,
  onNewBooking,
  onStateUpdated,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>(
    currentUser.role === 'front_desk' ? 'awaiting_room_verification' : 'all'
  );
  const [waitlistMsg, setWaitlistMsg] = useState('');
  const [waitlistErr, setWaitlistErr] = useState('');

  // Inline Front Desk room verification workbench inputs
  const [fdCountMap, setFdCountMap] = useState<Record<string, number>>({});
  const [fdRateMap, setFdRateMap] = useState<Record<string, number>>({});
  const [fdMsg, setFdMsg] = useState('');
  const [fdErr, setFdErr] = useState('');
  const [fdBusyId, setFdBusyId] = useState<string | null>(null);

  const currency = state.profile.currency || 'NGN';
  const canSeeFinancials = canViewBookingFinancials(currentUser.role);
  const canSeeWaitlist = canViewWaitlistAndOverdue(currentUser.role);
  const isFrontDesk = currentUser.role === 'front_desk';
  const isOperations = currentUser.role === 'operations';

  const authHeaders = (withJson = false): HeadersInit => ({
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken && authToken !== 'cookie-session'
      ? { Authorization: `Bearer ${authToken}` }
      : {}),
  });

  // Base list scoped cleanly per role
  const roleScopedBookings = useMemo(() => {
    if (isFrontDesk) {
      return state.bookings.filter(
        (b) => b.roomLines.length > 0 || b.status === 'locked'
      );
    }
    return state.bookings;
  }, [isFrontDesk, state.bookings]);

  const pendingRoomVerifications = useMemo(() => {
    const items: { booking: Booking; line: Booking['roomLines'][number] }[] = [];
    for (const b of state.bookings) {
      if (['cancelled', 'expired', 'closed'].includes(b.status)) continue;
      for (const rl of b.roomLines) {
        if (rl.verificationStatus === 'pending') {
          items.push({ booking: b, line: rl });
        }
      }
    }
    return items;
  }, [state.bookings]);

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roleScopedBookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (!q) return true;
      const client = state.clients.find((c) => c.id === b.clientId);
      const hall = state.halls.find((h) => h.id === b.hallId);
      return (
        b.id.toLowerCase().includes(q) ||
        b.eventTitle.toLowerCase().includes(q) ||
        (client?.name.toLowerCase().includes(q) ?? false) ||
        (hall?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }, [roleScopedBookings, search, state.clients, state.halls, statusFilter]);

  const activeWaitlist = state.waitlist.filter(
    (w) => w.status === 'waiting' || w.status === 'notified'
  );
  const overdueClients = state.clients.filter((c) => c.overdueFlag);
  const canManageWaitlist = canCreateBooking(currentUser.role);

  const handleQuickVerifyRoom = async (
    bookingId: string,
    line: Booking['roomLines'][number],
    status: 'full' | 'partial' | 'declined'
  ) => {
    setFdMsg('');
    setFdErr('');
    setFdBusyId(line.id);
    const verifiedCount =
      fdCountMap[line.id] !== undefined ? fdCountMap[line.id] : line.count;
    const ratePerNight =
      fdRateMap[line.id] !== undefined ? fdRateMap[line.id] : line.ratePerNight;

    const effectiveStatus =
      status === 'full' && verifiedCount < line.count && verifiedCount > 0
        ? 'partial'
        : status;

    try {
      const res = await fetch(`/api/bookings/${bookingId}/rooms/${line.id}/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify({
          verificationStatus: effectiveStatus,
          verifiedCount:
            effectiveStatus === 'partial'
              ? verifiedCount
              : effectiveStatus === 'full'
              ? line.count
              : 0,
          ratePerNight,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFdErr(data.error || 'Could not save room verification.');
        return;
      }
      onStateUpdated(data.state);
      setFdMsg(
        effectiveStatus === 'declined'
          ? `Declined ${line.roomType} room line on ${bookingId}.`
          : `Verified ${
              effectiveStatus === 'full' ? line.count : verifiedCount
            }/${line.count} × ${line.roomType} @ ${formatCurrency(ratePerNight, currency)}/night.`
      );
    } catch {
      setFdErr('Network error verifying room block.');
    } finally {
      setFdBusyId(null);
    }
  };

  const handleWaitlistStatus = async (
    id: string,
    status: 'notified' | 'converted' | 'dismissed'
  ) => {
    setWaitlistMsg('');
    setWaitlistErr('');
    try {
      const res = await fetch(`/api/waitlist/${id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(true),
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWaitlistErr(data.error || 'Could not update waitlist entry.');
        return;
      }
      onStateUpdated(data.state);
      setWaitlistMsg(`Waitlist entry marked ${status}.`);
    } catch {
      setWaitlistErr('Network error updating waitlist.');
    }
  };

  const statusTabs = isFrontDesk
    ? [
        { id: 'awaiting_room_verification', label: `Needs Room Check (${pendingRoomVerifications.length})` },
        { id: 'locked', label: 'Locked · PMS & Door Check-In' },
        { id: 'hold_proforma', label: 'Proforma Holds' },
        { id: 'all', label: 'All Room Bookings' },
      ]
    : isOperations
    ? [
        { id: 'all', label: 'All Events' },
        { id: 'locked', label: 'Locked & Ready' },
        { id: 'hold_proforma', label: 'Upcoming Holds' },
        { id: 'event_completed', label: 'Completed' },
      ]
    : [
        { id: 'all', label: 'All' },
        { id: 'awaiting_room_verification', label: 'Room Check' },
        { id: 'awaiting_manager_approval', label: 'Needs Approval' },
        { id: 'hold_proforma', label: '48h Holds' },
        { id: 'locked', label: 'Locked' },
        { id: 'event_completed', label: 'Completed' },
        { id: 'closed', label: 'Closed' },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
            {isFrontDesk
              ? 'Front Desk · Room Verification & Check-In'
              : isOperations
              ? 'Event Catering, Equipment & Guest Operations'
              : currentUser.role === 'booking_officer'
              ? 'My Assigned Bookings & Waitlist'
              : 'All Hall Bookings'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isFrontDesk
              ? 'Verify how many hotel rooms are available and confirm each nightly room rate (₦), assign PMS refs, and check in event guests.'
              : isOperations
              ? 'Coordinate kitchen preparation status, equipment load-out, and live guest door check-in.'
              : currentUser.role === 'booking_officer'
              ? 'Scoped to bookings created or assigned to your officer account, plus hall waitlist follow-up.'
              : 'Full lifecycle registry: holds, room checks, approvals, locked events, and settlements.'}
          </p>
        </div>
        {canCreateBooking(currentUser.role) && (
          <button
            type="button"
            onClick={onNewBooking}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 text-[#D4AF37]" />
            New Hall Booking
          </button>
        )}
      </div>

      {/* Front Desk Dedicated Inline Room Count & Rate Verification Workbench */}
      {canVerifyRooms(currentUser.role) && pendingRoomVerifications.length > 0 && (
        <section className="bg-white border border-[#C89B3C]/60 rounded-xl overflow-hidden depth-layer-1">
          <div className="px-5 py-4 bg-[#0B1F3A] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Hotel className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">
                  Pending Room Block Verifications ({pendingRoomVerifications.length})
                </h2>
                <p className="text-[11px] text-slate-300">
                  Confirm available room count and how much each room goes for per night ({currency}) before booking holds can lock.
                </p>
              </div>
            </div>
          </div>

          {fdErr && (
            <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {fdErr}
            </div>
          )}
          {fdMsg && (
            <div className="mx-5 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
              {fdMsg}
            </div>
          )}

          <div className="divide-y divide-slate-200">
            {pendingRoomVerifications.map(({ booking, line }) => {
              const client = state.clients.find((c) => c.id === booking.clientId);
              const nights = Math.max(
                1,
                Math.round(
                  (new Date(line.checkOutDate).getTime() - new Date(line.checkInDate).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              );
              const availCount = fdCountMap[line.id] ?? line.count;
              const nightlyRate = fdRateMap[line.id] ?? line.ratePerNight;
              const computedSubtotal = Math.max(0, availCount) * nights * nightlyRate;
              const busy = fdBusyId === line.id;

              return (
                <div
                  key={line.id}
                  className="p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-slate-500">
                      <span className="font-mono font-semibold text-[#0B1F3A]">{booking.id}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-slate-800">{booking.eventTitle}</span>
                      {client && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{client.name}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-[#0B1F3A]">
                      Requested: {line.count}× {line.roomType}
                    </p>
                    <p className="font-mono text-slate-600 tabular-nums">
                      {formatDate(line.checkInDate)} → {formatDate(line.checkOutDate)} ({nights}{' '}
                      night{nights > 1 ? 's' : ''}) · Block Est:{' '}
                      <strong className="text-[#0B1F3A]">
                        {formatCurrency(computedSubtotal, currency)}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-end gap-2.5 shrink-0">
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                        Available Rooms (of {line.count})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={line.count}
                        value={availCount}
                        onChange={(e) =>
                          setFdCountMap((prev) => ({
                            ...prev,
                            [line.id]: Math.max(1, Math.min(line.count, Number(e.target.value) || 1)),
                          }))
                        }
                        className="w-24 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                        Rate / Night ({currency})
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={nightlyRate}
                        onChange={(e) =>
                          setFdRateMap((prev) => ({
                            ...prev,
                            [line.id]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-32 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleQuickVerifyRoom(
                          booking.id,
                          line,
                          availCount < line.count ? 'partial' : 'full'
                        )
                      }
                      className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white font-semibold rounded-lg"
                    >
                      {availCount < line.count
                        ? `Confirm Partial (${availCount}) & Rate`
                        : `Confirm All (${line.count}) & Rate`}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleQuickVerifyRoom(booking.id, line, 'declined')}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-medium rounded-lg"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenBooking(booking)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0B1F3A] font-medium rounded-lg"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as 'all' | BookingStatus)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, event, client, hall..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
          />
        </div>
      </div>

      {/* Responsive Table (Columns strictly scoped by role) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredBookings.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-900">No bookings match your filters</p>
            <p className="text-xs text-slate-500 mt-1">
              {isFrontDesk
                ? 'Switch status tabs to inspect locked events for PMS allocation or door check-in.'
                : 'Adjust status filters or create a new hall booking.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-3 px-4">Booking</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Hall & First Session</th>
                  <th className="py-3 px-4">Status</th>
                  {canSeeFinancials ? (
                    <>
                      <th className="py-3 px-4 text-right">Contract Total</th>
                      <th className="py-3 px-4 text-right">Verified Paid</th>
                    </>
                  ) : isFrontDesk ? (
                    <>
                      <th className="py-3 px-4">Room Blocks & Rate</th>
                      <th className="py-3 px-4 text-right">Door Check-In</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-4">Catering Service</th>
                      <th className="py-3 px-4 text-right">Door Check-In</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {filteredBookings.map((b) => {
                  const client = state.clients.find((c) => c.id === b.clientId);
                  const hall = state.halls.find((h) => h.id === b.hallId);
                  const meta = BOOKING_STATUS_META[b.status];
                  const paid = state.payments
                    .filter((p) => p.bookingId === b.id && p.status === 'verified')
                    .reduce((s, p) => s + p.amount, 0);
                  const totalRooms = b.roomLines.reduce((sum, rl) => sum + rl.count, 0);
                  const firstRate = b.roomLines[0]?.ratePerNight;
                  const checkedIn = b.guests.filter((g) => g.checkedIn).length;

                  return (
                    <tr
                      key={b.id}
                      onClick={() => onOpenBooking(b)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <p className="font-mono font-semibold text-slate-900">{b.id}</p>
                        <p className="font-medium text-slate-800 mt-0.5">{b.eventTitle}</p>
                        <p className="text-slate-500 mt-0.5">{b.eventType}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-900">{client?.name || '—'}</p>
                        <p className="text-slate-500 font-mono mt-0.5">{client?.phone || '—'}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="text-slate-900">{hall?.name}</p>
                        <p className="text-slate-500 font-mono tabular-nums mt-0.5">
                          {formatDate(b.sessions[0]?.date)} ({b.sessions.length} session
                          {b.sessions.length > 1 ? 's' : ''})
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`font-semibold ${meta.textClass}`}>{meta.label}</span>
                      </td>
                      {canSeeFinancials ? (
                        <>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(b.grandTotal, currency)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-700 tabular-nums">
                            {formatCurrency(paid, currency)}
                          </td>
                        </>
                      ) : isFrontDesk ? (
                        <>
                          <td className="py-3.5 px-4 font-mono tabular-nums">
                            {totalRooms > 0 ? (
                              <span>
                                {totalRooms} room(s) ·{' '}
                                {firstRate ? `${formatCurrency(firstRate, currency)}/nt` : 'Rate TBD'}
                              </span>
                            ) : (
                              <span className="text-slate-400">No rooms</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                            {b.guests.length > 0
                              ? `${checkedIn}/${b.guests.length}`
                              : `${b.sessions[0]?.expectedGuests || 0} exp`}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3.5 px-4 capitalize">
                            {!b.catering
                              ? 'Hall only'
                              : b.catering.mode === 'external'
                              ? `External (${b.catering.serviceTime})`
                              : `${b.catering.guests} portions · ${b.catering.kitchenStatus.replace('_', ' ')}`}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-700 tabular-nums">
                            {b.guests.length > 0
                              ? `${checkedIn}/${b.guests.length}`
                              : `${b.sessions[0]?.expectedGuests || 0} exp`}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Waitlist & Overdue Follow-Up Desk (Booking Officer / Manager / Owner only) */}
      {canSeeWaitlist && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BellRing className="w-4 h-4 text-[#C89B3C]" />
                <div>
                  <h2 className="text-sm font-semibold text-[#0B1F3A]">
                    Hall Waitlist Follow-Up ({activeWaitlist.length})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Notified automatically when holds expire or bookings cancel
                  </p>
                </div>
              </div>
            </div>

            {waitlistErr && (
              <div className="mx-5 mt-4 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {waitlistErr}
              </div>
            )}
            {waitlistMsg && (
              <div className="mx-5 mt-4 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                {waitlistMsg}
              </div>
            )}

            {activeWaitlist.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                No active waitlist clients awaiting hall availability.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {activeWaitlist.map((w) => {
                  const hall = state.halls.find((h) => h.id === w.hallId);
                  return (
                    <div
                      key={w.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-[#0B1F3A]">
                          {w.eventTitle} ·{' '}
                          <span
                            className={
                              w.status === 'notified' ? 'text-emerald-700' : 'text-amber-700'
                            }
                          >
                            {w.status === 'notified' ? 'Slot Freed / Ready' : 'Waiting'}
                          </span>
                        </p>
                        <p className="text-slate-600 mt-0.5">
                          {w.clientName} (<span className="font-mono">{w.clientPhone}</span>)
                        </p>
                        <p className="text-slate-500 font-mono mt-0.5 tabular-nums">
                          {hall?.name} · {formatDate(w.desiredDate)} ({w.startTime}–{w.endTime})
                          {w.notifiedAt ? ` · Freed ${formatDateTime(w.notifiedAt)}` : ''}
                        </p>
                      </div>
                      {canManageWaitlist && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleWaitlistStatus(w.id, 'converted')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Converted
                          </button>
                          <button
                            type="button"
                            onClick={() => handleWaitlistStatus(w.id, 'dismissed')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-700" />
              <div>
                <h2 className="text-sm font-semibold text-[#0B1F3A]">
                  Overdue & Flagged Client Follow-Up ({overdueClients.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Clients flagged for overdue post-event balances require Manager clearance
                </p>
              </div>
            </div>
            {overdueClients.length === 0 ? (
              <div className="p-6 text-xs text-slate-500">
                All client accounts are in good standing.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {overdueClients.map((c) => {
                  const clientBookings = state.bookings.filter((b) => b.clientId === c.id);
                  const latestBooking = clientBookings[0];
                  return (
                    <div
                      key={c.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-red-900">
                          {c.name} <span className="font-normal text-slate-600">({c.organization})</span>
                        </p>
                        <p className="font-mono text-slate-500 mt-0.5">{c.phone}</p>
                        <p className="text-red-700 mt-0.5">{c.overdueNotes}</p>
                      </div>
                      {latestBooking && (
                        <button
                          type="button"
                          onClick={() => onOpenBooking(latestBooking)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0B1F3A] font-medium rounded-lg shrink-0"
                        >
                          Open {latestBooking.id}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
