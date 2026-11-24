import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChefHat,
  FileText,
  Printer,
  ShieldCheck,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type { Booking, HallBookStateResponse, StaffUser } from '../types';
import {
  BOOKING_STATUS_META,
  canApproveOrVoid,
  canManageOperations,
  canRecordPayments,
  canVerifyRooms,
  canViewBookingFinancials,
  canViewCateringOpsTab,
  canViewDocsTab,
  canViewGuestsTab,
  canViewRoomsTab,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '../utils/format';

interface BookingDetailDrawerProps {
  booking: Booking;
  state: HallBookStateResponse;
  currentUser: StaffUser;
  authToken: string;
  onClose: () => void;
  onStateUpdated: (nextState: HallBookStateResponse) => void;
  onGoToPayments: (bookingId: string) => void;
}

export const BookingDetailDrawer: React.FC<BookingDetailDrawerProps> = ({
  booking,
  state,
  currentUser,
  authToken,
  onClose,
  onStateUpdated,
  onGoToPayments,
}) => {
  const canSeeFinancials = canViewBookingFinancials(currentUser.role);
  const canSeeGuests = canViewGuestsTab(currentUser.role);
  const canSeeCatering = canViewCateringOpsTab(currentUser.role);
  const canSeeRooms = canViewRoomsTab(currentUser.role);
  const canSeeDocs = canViewDocsTab(currentUser.role);
  const isOpsOnlyDocs = currentUser.role === 'operations';

  const defaultTab: 'overview' | 'guests' | 'catering' | 'rooms' | 'docs' =
    currentUser.role === 'front_desk' && booking.roomLines.length > 0
      ? 'rooms'
      : currentUser.role === 'operations'
      ? 'catering'
      : 'overview';

  const [tab, setTab] = useState<'overview' | 'guests' | 'catering' | 'rooms' | 'docs'>(defaultTab);
  const [docType, setDocType] = useState<
    'proforma' | 'confirmation' | 'beo' | 'final_invoice' | 'refund_voucher'
  >(isOpsOnlyDocs ? 'beo' : 'proforma');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Guest form + bulk import
  const [guestSearch, setGuestSearch] = useState('');
  const [showBulkGuests, setShowBulkGuests] = useState(false);
  const [bulkGuestText, setBulkGuestText] = useState('');
  const [newGuest, setNewGuest] = useState({
    fullName: '',
    groupTag: 'General' as 'VIP' | 'Family' | 'Speaker' | 'General' | 'Vendor',
    tableLabel: '',
    dietaryNote: '',
    phone: '',
  });

  // Single-session cancel inline control
  const [cancelSessionTargetId, setCancelSessionTargetId] = useState<string | null>(null);
  const [cancelSessionReason, setCancelSessionReason] = useState('');

  // Front Desk room verification state (count + nightly Naira rate + notes)
  const [partialCountMap, setPartialCountMap] = useState<Record<string, number>>({});
  const [roomRateMap, setRoomRateMap] = useState<Record<string, number>>(() =>
    Object.fromEntries(booking.roomLines.map((rl) => [rl.id, rl.ratePerNight]))
  );
  const [roomNotesMap, setRoomNotesMap] = useState<Record<string, string>>(() =>
    Object.fromEntries(booking.roomLines.map((rl) => [rl.id, rl.allocationNotes || '']))
  );
  const [allocRefMap, setAllocRefMap] = useState<Record<string, string>>({});

  // Manager Amendment & Cancel modals
  const [showAmend, setShowAmend] = useState(false);
  const [amendForm, setAmendForm] = useState({
    reason: '',
    hallId: booking.hallId,
    newDate: booking.sessions[0]?.date || '',
    startTime: booking.sessions[0]?.startTime || '14:00',
    endTime: booking.sessions[0]?.endTime || '22:00',
    discountAmount: booking.discountAmount,
  });

  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [issueRefundVoucher, setIssueRefundVoucher] = useState(true);

  // Operations Post-Event Return
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [returnStats, setReturnStats] = useState<
    Record<string, { returnedQty: number; damagedQty: number; damageFee: number }>
  >(() => {
    const map: Record<string, { returnedQty: number; damagedQty: number; damageFee: number }> = {};
    for (const eq of booking.equipment) {
      map[eq.equipmentId] = {
        returnedQty: eq.returnedQty ?? eq.quantity,
        damagedQty: eq.damagedQty || 0,
        damageFee: eq.damageFee || 0,
      };
    }
    return map;
  });
  const [extrasAmount, setExtrasAmount] = useState(0);
  const [extrasNotes, setExtrasNotes] = useState('');

  const currency = state.profile.currency;
  const hall = state.halls.find((h) => h.id === booking.hallId);
  const client = state.clients.find((c) => c.id === booking.clientId);
  const statusMeta = BOOKING_STATUS_META[booking.status];

  const bookingPayments = state.payments.filter((p) => p.bookingId === booking.id);
  const bookingRefunds = state.refunds.filter((r) => r.bookingId === booking.id);
  const verifiedPaid = bookingPayments
    .filter((p) => p.status === 'verified')
    .reduce((sum, p) => sum + p.amount, 0);
  const balanceRemaining = Math.max(0, Math.round((booking.grandTotal - verifiedPaid) * 100) / 100);

  const parseBulkGuestsText = (rawText: string) => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: {
      fullName: string;
      groupTag: 'VIP' | 'Family' | 'Speaker' | 'General' | 'Vendor';
      tableLabel: string;
      dietaryNote: string;
      phone: string;
    }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const parts = lines[i].split(',').map((p) => p.trim());
      if (i === 0 && /full\s*name|guest\s*name|name/i.test(parts[0]) && parts.length > 1) {
        continue;
      }
      const fullName = parts[0] || '';
      if (!fullName) continue;
      const rawTag = (parts[1] || '').trim();
      const matchedTag = (['VIP', 'Family', 'Speaker', 'General', 'Vendor'] as const).find(
        (t) => t.toLowerCase() === rawTag.toLowerCase()
      );
      parsed.push({
        fullName,
        groupTag: matchedTag || 'General',
        tableLabel: parts[2] || 'Unassigned',
        dietaryNote: parts[3] || '',
        phone: parts[4] || '',
      });
    }
    return parsed;
  };

  const filteredGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return booking.guests;
    return booking.guests.filter(
      (g) =>
        g.fullName.toLowerCase().includes(q) ||
        g.tableLabel.toLowerCase().includes(q) ||
        g.groupTag.toLowerCase().includes(q)
    );
  }, [booking.guests, guestSearch]);

  const checkedInCount = booking.guests.filter((g) => g.checkedIn).length;

  const postAction = async (url: string, body: unknown, msg: string) => {
    setActionError('');
    setActionSuccess('');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Action failed.');
        return false;
      }
      onStateUpdated(data.state);
      setActionSuccess(msg);
      return true;
    } catch {
      setActionError('Network error communicating with server.');
      return false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex justify-end">
      <div className="bg-white w-full max-w-4xl h-full border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Top Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4 shrink-0 no-print">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono font-semibold text-slate-900">{booking.id}</span>
              <span aria-hidden="true">·</span>
              <span>{booking.eventType}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-semibold ${statusMeta.textClass}`}>{statusMeta.label}</span>
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-900 truncate">{booking.eventTitle}</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              {client?.name} ({client?.organization}) · {hall?.name}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg shrink-0"
            aria-label="Close booking details"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs (Strictly RBAC-filtered) */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1 overflow-x-auto shrink-0 no-print">
          {[
            { id: 'overview', label: 'Overview & Schedule', show: true },
            { id: 'rooms', label: `Rooms & Rates (${booking.roomLines.length})`, show: canSeeRooms },
            { id: 'guests', label: `Guest List (${booking.guests.length})`, show: canSeeGuests },
            { id: 'catering', label: 'Catering & Ops', show: canSeeCatering },
            { id: 'docs', label: isOpsOnlyDocs ? 'Event Order (BEO)' : 'Printable Documents', show: canSeeDocs },
          ]
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id as typeof tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  tab === t.id
                    ? 'bg-[#0B1F3A] text-white'
                    : 'text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {actionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 no-print">
              {actionError}
            </div>
          )}
          {actionSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 no-print">
              {actionSuccess}
            </div>
          )}

          {tab === 'overview' && (
            <div className="space-y-6">
              {/* Financial Snapshot (Hidden from Front Desk, Operations & SysAdmin) */}
              {canSeeFinancials ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                  <div className="p-4">
                    <p className="text-xs text-slate-500">Contract Total</p>
                    <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900">
                      {formatCurrency(booking.grandTotal, currency)}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-500">Deposit (50%)</p>
                    <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-800">
                      {formatCurrency(booking.depositRequired, currency)}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-500">Verified Paid</p>
                    <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-emerald-700">
                      {formatCurrency(verifiedPaid, currency)}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-slate-500">Balance Due</p>
                    <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-amber-700">
                      {formatCurrency(balanceRemaining, currency)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200 bg-slate-50/70">
                  <div className="p-4">
                    <p className="text-xs text-slate-500">Venue & Sessions</p>
                    <p className="mt-1 text-base font-bold text-[#0B1F3A] tabular-nums">
                      {hall?.name} ({booking.sessions.filter((s) => s.status !== 'cancelled').length})
                    </p>
                  </div>
                  {currentUser.role === 'front_desk' ? (
                    <div className="p-4">
                      <p className="text-xs text-slate-500">Room Blocks Requested</p>
                      <p className="mt-1 text-base font-bold font-mono text-[#0B1F3A] tabular-nums">
                        {booking.roomLines.reduce((sum, rl) => sum + rl.count, 0)} rooms ({booking.roomLines.length} lines)
                      </p>
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="text-xs text-slate-500">Catering Service</p>
                      <p className="mt-1 text-base font-bold text-[#0B1F3A] capitalize">
                        {booking.catering
                          ? `${booking.catering.mode === 'external' ? 'External' : booking.catering.kitchenStatus.replace('_', ' ')}`
                          : 'Hall Only'}
                      </p>
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-xs text-slate-500">Guest Roster</p>
                    <p className="mt-1 text-base font-bold font-mono text-emerald-700 tabular-nums">
                      {checkedInCount}/{booking.guests.length} Checked In
                    </p>
                  </div>
                </div>
              )}

              {/* Action Controls Bar */}
              <div className="flex flex-wrap items-center gap-2.5">
                {booking.status === 'awaiting_manager_approval' && canApproveOrVoid(currentUser.role) && (
                  <button
                    type="button"
                    onClick={() =>
                      postAction(
                        `/api/bookings/${booking.id}/approve`,
                        { reason: 'Approved by Manager' },
                        'Booking approved and moved to 48-hour Proforma Hold.'
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Approve Large / Flagged Booking
                  </button>
                )}

                {canRecordPayments(currentUser.role) &&
                  !['cancelled', 'expired', 'closed'].includes(booking.status) && (
                    <button
                      type="button"
                      onClick={() => onGoToPayments(booking.id)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg"
                    >
                      Record / Verify Payment
                    </button>
                  )}

                {booking.status === 'locked' && canManageOperations(currentUser.role) && (
                  <button
                    type="button"
                    onClick={() => setShowCompleteModal(true)}
                    className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-medium rounded-lg"
                  >
                    Complete Event & Return Equipment
                  </button>
                )}

                {canApproveOrVoid(currentUser.role) &&
                  !['cancelled', 'closed', 'expired'].includes(booking.status) && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAmend(true)}
                        className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg"
                      >
                        Amend / Reschedule
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancel(true)}
                        className="px-3.5 py-2 bg-white border border-red-300 hover:bg-red-50 text-red-700 text-xs font-medium rounded-lg"
                      >
                        Cancel Booking
                      </button>
                    </>
                  )}
              </div>

              {/* Sessions Breakdown */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Scheduled Hall Sessions ({booking.sessions.length})
                  </h3>
                  {booking.holdExpiresAt && (
                    <span className="text-xs text-amber-800 font-mono tabular-nums">
                      Hold expires: {formatDateTime(booking.holdExpiresAt)}
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-200">
                  {booking.sessions.map((s) => (
                    <div key={s.id} className="px-4 py-3 space-y-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono font-semibold text-slate-900 tabular-nums">
                            {formatDate(s.date)}
                          </span>
                          <span className="font-mono text-slate-600 tabular-nums">
                            {s.startTime}–{s.endTime}
                          </span>
                          <span className="text-slate-700">{s.layout} layout</span>
                          <span className="text-slate-500 tabular-nums">
                            {s.expectedGuests} guests
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span
                            className={`font-medium capitalize ${
                              s.status === 'cancelled'
                                ? 'text-red-700'
                                : s.status === 'completed'
                                ? 'text-indigo-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {s.status}
                          </span>
                          {canApproveOrVoid(currentUser.role) &&
                            s.status === 'active' &&
                            booking.sessions.filter((x) => x.status === 'active').length > 1 &&
                            !['cancelled', 'closed', 'expired'].includes(booking.status) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelSessionTargetId(
                                    cancelSessionTargetId === s.id ? null : s.id
                                  );
                                  setCancelSessionReason('');
                                }}
                                className="px-2.5 py-1 text-[11px] font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded"
                              >
                                Cancel Session
                              </button>
                            )}
                        </div>
                      </div>
                      {cancelSessionTargetId === s.id && (
                        <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={cancelSessionReason}
                            onChange={(e) => setCancelSessionReason(e.target.value)}
                            placeholder="Reason for cancelling this single date"
                            className="flex-1 min-w-[200px] px-2.5 py-1.5 text-xs bg-white border border-red-200 rounded"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const ok = await postAction(
                                `/api/bookings/${booking.id}/cancel`,
                                { sessionId: s.id, reason: cancelSessionReason },
                                `Session ${s.date} cancelled and hall slot freed for waitlist.`
                              );
                              if (ok) {
                                setCancelSessionTargetId(null);
                                setCancelSessionReason('');
                              }
                            }}
                            className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-[11px] font-semibold rounded"
                          >
                            Confirm Date Cancellation
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost Breakdown Table (Financial roles only) */}
              {canSeeFinancials && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">Itemized Financial Summary</h3>
                  </div>
                  <div className="p-4 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Hall Rental</span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.hallTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">
                        {booking.catering?.mode === 'external'
                          ? 'External Catering Staging'
                          : booking.catering
                          ? 'Hotel Banquet Catering'
                          : 'Catering (Hall Only)'}
                      </span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.cateringTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Equipment Reservations</span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.equipmentTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Service Add-Ons</span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.addonTotal, currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Hotel Room Blocks</span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.roomTotal, currency)}</span>
                    </div>
                    {booking.extrasAmount > 0 && (
                      <div className="flex justify-between text-amber-800">
                        <span>Post-Event Extras / Damages ({booking.extrasNotes})</span>
                        <span className="font-mono tabular-nums">{formatCurrency(booking.extrasAmount, currency)}</span>
                      </div>
                    )}
                    {booking.discountAmount > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Approved Discount</span>
                        <span className="font-mono tabular-nums">-{formatCurrency(booking.discountAmount, currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-600">Tax ({state.profile.taxRatePercent}%)</span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.taxAmount, currency)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
                      <span>Grand Total</span>
                      <span className="font-mono tabular-nums">{formatCurrency(booking.grandTotal, currency)}</span>
                    </div>
                  </div>
                </div>
              )}

              {booking.amendments.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-slate-900">Amendment History</h3>
                  {booking.amendments.map((a) => (
                    <div key={a.id} className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                      <span className="font-mono">{formatDateTime(a.timestamp)}</span> ·{' '}
                      <strong>{a.approvedBy}</strong>: {a.reason} ({a.summary})
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'guests' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-slate-200 rounded-xl p-4 bg-slate-50">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Live Guest List & Door Check-In
                  </p>
                  <p className="text-xs text-slate-600 tabular-nums mt-0.5">
                    {checkedInCount} of {booking.guests.length} registered guests checked in · Expected capacity{' '}
                    {booking.sessions[0]?.expectedGuests || 0}
                  </p>
                </div>
                <input
                  type="text"
                  value={guestSearch}
                  onChange={(e) => setGuestSearch(e.target.value)}
                  placeholder="Search name, table, VIP..."
                  className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg sm:w-64"
                />
              </div>

              {canManageOperations(currentUser.role) && (
                <div className="space-y-3">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const ok = await postAction(
                        `/api/bookings/${booking.id}/guests`,
                        newGuest,
                        `Added ${newGuest.fullName} to guest list.`
                      );
                      if (ok) {
                        setNewGuest({
                          fullName: '',
                          groupTag: 'General',
                          tableLabel: '',
                          dietaryNote: '',
                          phone: '',
                        });
                      }
                    }}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-4 border border-slate-200 rounded-xl items-end"
                  >
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Guest Full Name
                      </label>
                      <input
                        type="text"
                        value={newGuest.fullName}
                        onChange={(e) => setNewGuest({ ...newGuest, fullName: e.target.value })}
                        placeholder="Full name"
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Group
                      </label>
                      <select
                        value={newGuest.groupTag}
                        onChange={(e) =>
                          setNewGuest({
                            ...newGuest,
                            groupTag: e.target.value as typeof newGuest.groupTag,
                          })
                        }
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="VIP">VIP</option>
                        <option value="Family">Family</option>
                        <option value="Speaker">Speaker</option>
                        <option value="General">General</option>
                        <option value="Vendor">Vendor</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Table / Seat
                      </label>
                      <input
                        type="text"
                        value={newGuest.tableLabel}
                        onChange={(e) => setNewGuest({ ...newGuest, tableLabel: e.target.value })}
                        placeholder="Table 02"
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[11px] font-medium text-slate-700 mb-1">
                        Dietary Note
                      </label>
                      <input
                        type="text"
                        value={newGuest.dietaryNote}
                        onChange={(e) => setNewGuest({ ...newGuest, dietaryNote: e.target.value })}
                        placeholder="Vegetarian, Halal, Allergy"
                        className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-medium rounded-lg"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Add Guest
                      </button>
                    </div>
                  </form>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkGuests((prev) => !prev)}
                      className="text-xs font-semibold text-[#0B1F3A] hover:text-[#C89B3C] underline underline-offset-4"
                    >
                      {showBulkGuests
                        ? 'Hide Bulk Guest CSV / Paste Import'
                        : 'Bulk Import Guests (Paste List or Upload CSV)'}
                    </button>
                  </div>

                  {showBulkGuests && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <p className="text-slate-600">
                          One guest per line:{' '}
                          <span className="font-mono text-slate-800">
                            Full Name, Group (VIP/Family/General), Table, Dietary, Phone
                          </span>
                        </p>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg font-medium text-slate-800 cursor-pointer shrink-0">
                          Upload CSV
                          <input
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              const txt = await file.text();
                              setBulkGuestText(txt);
                            }}
                          />
                        </label>
                      </div>
                      <textarea
                        rows={4}
                        value={bulkGuestText}
                        onChange={(e) => setBulkGuestText(e.target.value)}
                        placeholder={`Alhaji Musa Ibrahim, VIP, High Table, Halal, +234-803-555-0192\nDr. Ngozi Okonjo, Speaker, VIP-2, Vegetarian, +234-802-555-0144`}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 font-mono">
                          {parseBulkGuestsText(bulkGuestText).length} guest row(s) detected
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            const guests = parseBulkGuestsText(bulkGuestText);
                            const ok = await postAction(
                              `/api/bookings/${booking.id}/guests/bulk`,
                              { guests },
                              `Imported ${guests.length} guest(s) onto guest roster.`
                            );
                            if (ok) {
                              setBulkGuestText('');
                              setShowBulkGuests(false);
                            }
                          }}
                          className="px-4 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white font-semibold rounded-lg"
                        >
                          Import Guests
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                {filteredGuests.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No guests matching filter. Add VIPs, speakers, families, or attendees above.
                  </div>
                ) : (
                  filteredGuests.map((g) => (
                    <div
                      key={g.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-800">{g.groupTag}</span>
                          <span aria-hidden="true">·</span>
                          <span>{g.tableLabel}</span>
                          {g.dietaryNote && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-800">{g.dietaryNote}</span>
                            </>
                          )}
                        </div>
                        <p className="text-sm font-medium text-slate-900 mt-0.5 truncate">
                          {g.fullName}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          postAction(
                            `/api/bookings/${booking.id}/guests/${g.id}/checkin`,
                            {},
                            `${g.fullName} check-in updated.`
                          )
                        }
                        className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                          g.checkedIn
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                            : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                        }`}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        {g.checkedIn ? 'Checked In' : 'Check In'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {tab === 'catering' && canSeeCatering && (
            <div className="space-y-6">
              {booking.catering ? (
                <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <ChefHat className="w-5 h-5 text-[#C89B3C]" />
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {booking.catering.mode === 'external'
                            ? 'Self-Organized / External Catering'
                            : 'Hotel Banquet Catering'}
                        </p>
                        <h3 className="text-base font-semibold text-slate-900">
                          {booking.catering.mode === 'external'
                            ? booking.catering.externalCatererName || booking.catering.name
                            : booking.catering.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                          {booking.catering.mode === 'external' ? (
                            <>
                              Contact: {booking.catering.externalCatererContact || 'Not listed'} · Service at{' '}
                              {booking.catering.serviceTime}
                              {canSeeFinancials
                                ? ` · Staging fee ${formatCurrency(booking.cateringTotal, currency)}`
                                : ''}
                            </>
                          ) : (
                            <>
                              {booking.catering.guests} portions · Service at {booking.catering.serviceTime}
                              {canSeeFinancials
                                ? ` · ${formatCurrency(booking.cateringTotal, currency)}`
                                : ''}
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {canManageOperations(currentUser.role) && (
                      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                        {(['planned', 'confirmed', 'in_prep', 'served'] as const).map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() =>
                              postAction(
                                `/api/bookings/${booking.id}/catering/status`,
                                { kitchenStatus: st },
                                `Catering coordination status updated to ${st}.`
                              )
                            }
                            className={`px-2.5 py-1 text-xs font-medium rounded capitalize ${
                              booking.catering?.kitchenStatus === st
                                ? 'bg-[#0B1F3A] text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {st.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900">
                    <strong>
                      {booking.catering.mode === 'external'
                        ? 'Loading Bay & Warming Station Notes:'
                        : 'Dietary & Kitchen Instructions:'}
                    </strong>{' '}
                    {booking.catering.dietaryNotes || 'Standard coordination setup.'}
                  </div>
                </div>
              ) : (
                <div className="p-6 border border-slate-200 rounded-xl text-xs text-slate-500">
                  No catering ordered — client selected Hall-Only rental.
                </div>
              )}

              {/* Equipment & Operations Brief */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Equipment Load-Out & Operations Notes
                  </h3>
                </div>
                <div className="p-4 space-y-3 text-xs">
                  <p className="text-slate-700">
                    <strong>Operations Brief:</strong> {booking.operationsBrief || 'Standard hall turnover.'}
                  </p>
                  <p className="text-slate-700">
                    <strong>Event Notes:</strong> {booking.eventNotes || 'None recorded.'}
                  </p>
                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    {booking.equipment.length === 0 ? (
                      <p className="text-slate-500">No AV or stage equipment reserved.</p>
                    ) : (
                      booking.equipment.map((eq) => (
                        <div key={eq.equipmentId} className="flex justify-between">
                          <span className="text-slate-800 font-medium">
                            {eq.quantity}× {eq.name}
                          </span>
                          <span className="font-mono text-slate-600 tabular-nums">
                            {eq.returnedQty !== null
                              ? `Returned ${eq.returnedQty} · Damaged ${eq.damagedQty}`
                              : canSeeFinancials
                              ? formatCurrency(eq.quantity * eq.unitRate, currency)
                              : 'Issued for Event'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'rooms' && canSeeRooms && (
            <div className="space-y-4">
              {booking.roomLines.length === 0 ? (
                <div className="p-8 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                  No hotel room blocks attached to this event booking.
                </div>
              ) : (
                booking.roomLines.map((rl) => {
                  const nights = Math.max(
                    1,
                    Math.round(
                      (new Date(rl.checkOutDate).getTime() - new Date(rl.checkInDate).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )
                  );
                  const currentRate = roomRateMap[rl.id] ?? rl.ratePerNight;
                  const activeCount =
                    rl.verificationStatus === 'pending'
                      ? rl.count
                      : rl.verificationStatus === 'declined'
                      ? 0
                      : rl.verifiedCount;
                  const lineTotal = activeCount * nights * currentRate;

                  return (
                    <div
                      key={rl.id}
                      className="border border-slate-200 rounded-xl p-5 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[#0B1F3A]">
                            {rl.count}× {rl.roomType} ({nights} night{nights > 1 ? 's' : ''})
                          </p>
                          <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                            {formatDate(rl.checkInDate)} → {formatDate(rl.checkOutDate)} ·{' '}
                            {formatCurrency(rl.ratePerNight, currency)}/night · Line est.{' '}
                            {formatCurrency(lineTotal, currency)}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            rl.verificationStatus === 'full'
                              ? 'text-emerald-700'
                              : rl.verificationStatus === 'declined'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {rl.verificationStatus.toUpperCase()} ({rl.verifiedCount}/{rl.count})
                        </span>
                      </div>

                      {rl.verifiedBy && (
                        <p className="text-xs text-slate-600">
                          Verified by <strong>{rl.verifiedBy}</strong> on {formatDateTime(rl.verifiedAt)}
                          {rl.frontDeskHotelRef ? ` · PMS Ref: ${rl.frontDeskHotelRef}` : ''}
                          {rl.allocationNotes ? ` · Note: ${rl.allocationNotes}` : ''}
                        </p>
                      )}

                      {/* Front Desk Verification Controls: Verify Room Count AND Nightly Room Rate */}
                      {(rl.verificationStatus === 'pending' ||
                        booking.status === 'awaiting_room_verification') &&
                        canVerifyRooms(currentUser.role) && (
                          <div className="pt-3 border-t border-slate-200 space-y-3 bg-slate-50/70 -mx-5 -mb-5 p-5 rounded-b-xl">
                            <p className="text-xs font-semibold text-[#0B1F3A]">
                              Front Desk Verification: Confirm Room Availability & Nightly Room Rate ({currency})
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Confirmed Rate / Night ({currency})
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  value={currentRate}
                                  onChange={(e) =>
                                    setRoomRateMap((prev) => ({
                                      ...prev,
                                      [rl.id]: Math.max(0, Number(e.target.value) || 0),
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Partial Available Count (1–{Math.max(1, rl.count - 1)})
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={Math.max(1, rl.count - 1)}
                                  value={partialCountMap[rl.id] ?? Math.max(1, Math.floor(rl.count / 2))}
                                  onChange={(e) =>
                                    setPartialCountMap((prev) => ({
                                      ...prev,
                                      [rl.id]: Number(e.target.value) || 1,
                                    }))
                                  }
                                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                  Front Desk Note / Wing
                                </label>
                                <input
                                  type="text"
                                  value={roomNotesMap[rl.id] ?? ''}
                                  onChange={(e) =>
                                    setRoomNotesMap((prev) => ({
                                      ...prev,
                                      [rl.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="e.g. Executive Wing rate confirmed"
                                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <span className="text-xs font-mono text-slate-600 tabular-nums">
                                Full block total ({rl.count}× {nights}nt @{' '}
                                {formatCurrency(currentRate, currency)}):{' '}
                                <strong className="text-[#0B1F3A]">
                                  {formatCurrency(rl.count * nights * currentRate, currency)}
                                </strong>
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    postAction(
                                      `/api/bookings/${booking.id}/rooms/${rl.id}/verify`,
                                      {
                                        verificationStatus: 'full',
                                        ratePerNight: currentRate,
                                        allocationNotes: roomNotesMap[rl.id] || '',
                                      },
                                      `Confirmed ${rl.count} rooms @ ${formatCurrency(currentRate, currency)}/night.`
                                    )
                                  }
                                  className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg"
                                >
                                  Confirm Full ({rl.count}) & Rate
                                </button>
                                {rl.count > 1 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      postAction(
                                        `/api/bookings/${booking.id}/rooms/${rl.id}/verify`,
                                        {
                                          verificationStatus: 'partial',
                                          verifiedCount:
                                            partialCountMap[rl.id] ?? Math.max(1, Math.floor(rl.count / 2)),
                                          ratePerNight: currentRate,
                                          allocationNotes: roomNotesMap[rl.id] || '',
                                        },
                                        `Recorded partial availability @ ${formatCurrency(currentRate, currency)}/night.`
                                      )
                                    }
                                    className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg"
                                  >
                                    Confirm Partial & Rate
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    postAction(
                                      `/api/bookings/${booking.id}/rooms/${rl.id}/verify`,
                                      {
                                        verificationStatus: 'declined',
                                        allocationNotes: roomNotesMap[rl.id] || 'No rooms available',
                                      },
                                      'Marked room line as declined.'
                                    )
                                  }
                                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-medium rounded-lg"
                                >
                                  Decline Line
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                      {/* Booking Officer Decision on Partial */}
                      {rl.verificationStatus === 'partial' &&
                        rl.officerDecision === 'pending' &&
                        (currentUser.role === 'booking_officer' || currentUser.role === 'manager') && (
                          <div className="pt-3 border-t border-slate-200 flex items-center gap-2">
                            <span className="text-xs text-amber-800 font-medium mr-2">
                              Front desk confirmed {rl.verifiedCount} of {rl.count} rooms @{' '}
                              {formatCurrency(rl.ratePerNight, currency)}/night:
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                postAction(
                                  `/api/bookings/${booking.id}/rooms/${rl.id}/decision`,
                                  { decision: 'accepted' },
                                  `Accepted ${rl.verifiedCount} rooms.`
                                )
                              }
                              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg"
                            >
                              Accept {rl.verifiedCount} Rooms
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                postAction(
                                  `/api/bookings/${booking.id}/rooms/${rl.id}/decision`,
                                  { decision: 'dropped' },
                                  'Dropped room line from booking.'
                                )
                              }
                              className="px-3 py-1.5 bg-slate-100 text-slate-800 text-xs font-medium rounded-lg"
                            >
                              Drop Rooms
                            </button>
                          </div>
                        )}

                      {/* Front Desk Hotel Reference Allocation after Lock */}
                      {booking.status === 'locked' &&
                        rl.officerDecision === 'accepted' &&
                        !rl.frontDeskHotelRef &&
                        canVerifyRooms(currentUser.role) && (
                          <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2">
                            <input
                              type="text"
                              value={allocRefMap[rl.id] || ''}
                              onChange={(e) =>
                                setAllocRefMap({ ...allocRefMap, [rl.id]: e.target.value })
                              }
                              placeholder="Hotel PMS Block Ref (e.g. FD-BLK-9012)"
                              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono flex-1 min-w-[200px]"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                postAction(
                                  `/api/bookings/${booking.id}/rooms/${rl.id}/allocate`,
                                  { frontDeskHotelRef: allocRefMap[rl.id] || '' },
                                  'Room block allocation reference saved.'
                                )
                              }
                              className="px-3.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg"
                            >
                              Record Allocation Ref
                            </button>
                          </div>
                        )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'docs' && canSeeDocs && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
                  {!isOpsOnlyDocs && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDocType('proforma')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                          docType === 'proforma' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Proforma Invoice
                      </button>
                      <button
                        type="button"
                        onClick={() => setDocType('confirmation')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                          docType === 'confirmation' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        Confirmation Letter
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setDocType('beo')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                      docType === 'beo' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    Event Order Sheet (BEO)
                  </button>
                  {!isOpsOnlyDocs && (
                    <>
                      <button
                        type="button"
                        onClick={() => setDocType('final_invoice')}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                          docType === 'final_invoice'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600'
                        }`}
                      >
                        Final Invoice & Statement
                      </button>
                      {bookingRefunds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setDocType('refund_voucher')}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                            docType === 'refund_voucher'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600'
                          }`}
                        >
                          Refund Voucher ({bookingRefunds.length})
                        </button>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-medium rounded-lg"
                >
                  <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                  Print Document
                </button>
              </div>

              {/* Printable Sheet */}
              <div className="border border-slate-300 rounded-xl p-8 bg-white space-y-6 text-sm">
                <div className="flex justify-between items-start border-b border-slate-200 pb-5">
                  <div>
                    <p className="text-xs font-mono text-slate-500">
                      {docType === 'proforma'
                        ? 'PROFORMA INVOICE & PAYMENT SCHEDULE'
                        : docType === 'confirmation'
                        ? 'OFFICIAL BOOKING CONFIRMATION LETTER'
                        : docType === 'beo'
                        ? 'OPERATIONS EVENT ORDER SHEET (BEO)'
                        : docType === 'final_invoice'
                        ? 'FINAL SETTLEMENT INVOICE & ACCOUNT STATEMENT'
                        : 'OFFICIAL REFUND DISBURSEMENT VOUCHER'}
                    </p>
                    <h3 className="text-xl font-bold text-[#0B1F3A] mt-1">
                      {state.profile.hotelName}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {state.profile.address} · {state.profile.phone}
                    </p>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <p className="font-bold text-slate-900">{booking.id}</p>
                    <p className="text-slate-500 mt-0.5">Status: {statusMeta.label}</p>
                    {booking.holdExpiresAt && docType === 'proforma' && (
                      <p className="text-amber-700 mt-0.5">
                        Hold Deadline: {formatDateTime(booking.holdExpiresAt)}
                      </p>
                    )}
                    {docType === 'final_invoice' && booking.finalDueDate && (
                      <p className="text-slate-700 mt-0.5">
                        Settlement Due: {formatDate(booking.finalDueDate)}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-slate-500 font-medium">Client</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{client?.name}</p>
                    <p className="text-slate-600">{client?.organization}</p>
                    <p className="text-slate-600 font-mono">{client?.phone}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-medium">Event & Venue</p>
                    <p className="font-semibold text-slate-900 mt-0.5">{booking.eventTitle}</p>
                    <p className="text-slate-600">
                      {hall?.name} · {booking.sessions[0]?.layout} ({booking.sessions[0]?.expectedGuests} guests)
                    </p>
                    <p className="text-slate-600 font-mono">
                      {booking.sessions.map((s) => `${s.date} (${s.startTime}-${s.endTime})`).join(' · ')}
                    </p>
                  </div>
                </div>

                {docType === 'beo' ? (
                  <div className="space-y-4 text-xs border-t border-slate-200 pt-4">
                    <div>
                      <p className="font-semibold text-slate-900">Catering Service Plan</p>
                      <p className="text-slate-700 mt-1">
                        {!booking.catering
                          ? 'No catering ordered (Hall-Only rental).'
                          : booking.catering.mode === 'external'
                          ? `Self-Organized External Caterer: ${booking.catering.externalCatererName || booking.catering.name} (${booking.catering.externalCatererContact || 'No contact'}) — Service at ${booking.catering.serviceTime}. Notes: ${booking.catering.dietaryNotes || 'Standard service bay access'}`
                          : `${booking.catering.name} — ${booking.catering.guests} portions at ${booking.catering.serviceTime}. Dietary: ${booking.catering.dietaryNotes || 'None'}`}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Equipment & Setup Checklist</p>
                      <ul className="list-disc pl-5 mt-1 text-slate-700 space-y-1">
                        {booking.equipment.map((e) => (
                          <li key={e.equipmentId}>
                            {e.quantity}× {e.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Operations Brief</p>
                      <p className="text-slate-700 mt-1">{booking.operationsBrief || booking.eventNotes}</p>
                    </div>
                  </div>
                ) : docType === 'refund_voucher' ? (
                  <div className="space-y-4 text-xs border-t border-slate-200 pt-4">
                    {bookingRefunds.map((rv) => (
                      <div key={rv.id} className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                        <div className="flex justify-between font-mono font-bold text-slate-900">
                          <span>Voucher No: {rv.voucherNumber}</span>
                          <span>Amount: {formatCurrency(rv.amount, currency)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600">
                          <span>Disbursement Method: {rv.method}</span>
                          <span>Issued: {formatDateTime(rv.issuedAt)}</span>
                        </div>
                        <p className="text-slate-700">
                          <strong>Authorized Reason:</strong> {rv.reason}
                        </p>
                        <p className="text-slate-600">
                          <strong>Approved By:</strong> {rv.issuedBy}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="border-t border-slate-200 pt-4 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span>Hall Rental</span>
                        <span className="font-mono">{formatCurrency(booking.hallTotal, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>
                          {booking.catering?.mode === 'external'
                            ? 'External Catering Staging / Corkage'
                            : booking.catering
                            ? 'Hotel Banquet Catering'
                            : 'Catering (Hall Only)'}
                        </span>
                        <span className="font-mono">{formatCurrency(booking.cateringTotal, currency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Equipment & Add-ons</span>
                        <span className="font-mono">
                          {formatCurrency(booking.equipmentTotal + booking.addonTotal, currency)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Room Blocks</span>
                        <span className="font-mono">{formatCurrency(booking.roomTotal, currency)}</span>
                      </div>
                      {booking.extrasAmount > 0 && (
                        <div className="flex justify-between text-amber-800">
                          <span>Post-Event Extras / Equipment Damages ({booking.extrasNotes || 'Inspection'})</span>
                          <span className="font-mono">{formatCurrency(booking.extrasAmount, currency)}</span>
                        </div>
                      )}
                      {booking.discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-700">
                          <span>Approved Discount ({booking.discountReason || 'Manager discount'})</span>
                          <span className="font-mono">-{formatCurrency(booking.discountAmount, currency)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Tax ({state.profile.taxRatePercent}%)</span>
                        <span className="font-mono">{formatCurrency(booking.taxAmount, currency)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm border-t border-slate-200 pt-2">
                        <span>Total Contract Value</span>
                        <span className="font-mono">{formatCurrency(booking.grandTotal, currency)}</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 font-medium">
                        <span>Verified Payments Received</span>
                        <span className="font-mono">{formatCurrency(verifiedPaid, currency)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-slate-900">
                        <span>{balanceRemaining <= 0 ? 'Account Settled in Full' : 'Outstanding Balance'}</span>
                        <span className="font-mono">{formatCurrency(balanceRemaining, currency)}</span>
                      </div>
                    </div>

                    {docType === 'final_invoice' && bookingPayments.length > 0 && (
                      <div className="border-t border-slate-200 pt-4 space-y-2 text-xs">
                        <p className="font-semibold text-slate-900">Verified Receipt Ledger Statement</p>
                        {bookingPayments
                          .filter((p) => p.status === 'verified')
                          .map((p) => (
                            <div key={p.id} className="flex justify-between font-mono text-slate-600">
                              <span>
                                {p.receiptNumber} · {p.method} ({p.reference}) · {formatDateTime(p.verifiedAt)}
                              </span>
                              <span>{formatCurrency(p.amount, currency)}</span>
                            </div>
                          ))}
                      </div>
                    )}

                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                      <p className="font-semibold text-slate-900">Hotel Remittance Bank Accounts</p>
                      {state.profile.bankAccounts.map((b) => (
                        <p key={b.id} className="font-mono text-slate-700">
                          {b.bankName} · {b.accountName} · Acct: {b.accountNumber} ({b.branch})
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manager Amend Modal */}
      {showAmend && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Amend / Reschedule Booking</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Hall</label>
                <select
                  value={amendForm.hallId}
                  onChange={(e) => setAmendForm({ ...amendForm, hallId: e.target.value })}
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
                    value={amendForm.newDate}
                    onChange={(e) => setAmendForm({ ...amendForm, newDate: e.target.value })}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Start</label>
                  <input
                    type="time"
                    value={amendForm.startTime}
                    onChange={(e) => setAmendForm({ ...amendForm, startTime: e.target.value })}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">End</label>
                  <input
                    type="time"
                    value={amendForm.endTime}
                    onChange={(e) => setAmendForm({ ...amendForm, endTime: e.target.value })}
                    className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Discount ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  value={amendForm.discountAmount}
                  onChange={(e) =>
                    setAmendForm({ ...amendForm, discountAmount: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Mandatory Reason
                </label>
                <input
                  type="text"
                  value={amendForm.reason}
                  onChange={(e) => setAmendForm({ ...amendForm, reason: e.target.value })}
                  placeholder="Client request or operational adjustment reason"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAmend(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await postAction(
                    `/api/bookings/${booking.id}/amend`,
                    amendForm,
                    'Booking amended and revised document generated.'
                  );
                  if (ok) setShowAmend(false);
                }}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                Save Amendment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Cancel Modal */}
      {showCancel && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Cancel Booking</h3>
            <p className="text-xs text-slate-600">
              Cancelling frees the hall, room blocks, and equipment immediately and alerts matching waitlist clients.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mandatory Cancellation Reason
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                required
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-800">
              <input
                type="checkbox"
                checked={issueRefundVoucher}
                onChange={(e) => setIssueRefundVoucher(e.target.checked)}
              />
              Issue policy-calculated refund voucher (if payments exist)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCancel(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
              >
                Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await postAction(
                    `/api/bookings/${booking.id}/cancel`,
                    { reason: cancelReason, issueRefundVoucher, refundMethod: 'Bank Transfer' },
                    'Booking cancelled, inventory freed, and waitlist notified.'
                  );
                  if (ok) setShowCancel(false);
                }}
                className="px-4 py-2 text-xs font-medium bg-red-700 text-white rounded-lg"
              >
                Confirm Cancellation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Operations Complete & Equipment Return Modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              Post-Event Equipment Return & Final Settlement
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {booking.equipment.map((eq) => (
                <div
                  key={eq.equipmentId}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-12 gap-2 items-center text-xs"
                >
                  <div className="col-span-6 font-medium text-slate-900">
                    {eq.name} ({eq.quantity})
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-500">Damaged</label>
                    <input
                      type="number"
                      min={0}
                      max={eq.quantity}
                      value={returnStats[eq.equipmentId]?.damagedQty || 0}
                      onChange={(e) => {
                        const dmg = Number(e.target.value) || 0;
                        setReturnStats({
                          ...returnStats,
                          [eq.equipmentId]: {
                            returnedQty: Math.max(0, eq.quantity - dmg),
                            damagedQty: dmg,
                            damageFee: returnStats[eq.equipmentId]?.damageFee || 0,
                          },
                        });
                      }}
                      className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-500">Fee ({currency})</label>
                    <input
                      type="number"
                      min={0}
                      value={returnStats[eq.equipmentId]?.damageFee || 0}
                      onChange={(e) =>
                        setReturnStats({
                          ...returnStats,
                          [eq.equipmentId]: {
                            ...returnStats[eq.equipmentId],
                            damageFee: Number(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 border border-slate-300 rounded font-mono bg-white"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Additional Overtime / Extras ({currency})
                </label>
                <input
                  type="number"
                  min={0}
                  value={extrasAmount}
                  onChange={(e) => setExtrasAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Extras Note
                </label>
                <input
                  type="text"
                  value={extrasNotes}
                  onChange={(e) => setExtrasNotes(e.target.value)}
                  placeholder="Overtime hours / extra plates"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCompleteModal(false)}
                className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const equipmentReturns = Object.entries(returnStats).map(([equipmentId, val]) => ({
                    equipmentId,
                    ...val,
                  }));
                  const ok = await postAction(
                    `/api/bookings/${booking.id}/complete`,
                    { equipmentReturns, extrasAmount, extrasNotes },
                    'Event marked completed and final invoice updated.'
                  );
                  if (ok) setShowCompleteModal(false);
                }}
                className="px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                Finalize Event Settlement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
