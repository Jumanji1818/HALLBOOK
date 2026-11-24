import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ChefHat, Clock, Plus, Trash2, UtensilsCrossed, X } from 'lucide-react';
import type {
  Booking,
  EventType,
  HallBookStateResponse,
  HallLayout,
  SessionConflict,
} from '../types';
import { formatCurrency } from '../utils/format';
import { TiltCard3D } from './TiltCard3D';

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

interface BookingWizardModalProps {
  state: HallBookStateResponse;
  authToken: string;
  prefillHallId?: string;
  prefillDate?: string;
  prefillStartTime?: string;
  prefillEndTime?: string;
  onClose: () => void;
  onCreated: (booking: Booking, nextState: HallBookStateResponse) => void;
  onStateUpdated: (nextState: HallBookStateResponse) => void;
}

export const BookingWizardModal: React.FC<BookingWizardModalProps> = ({
  state,
  authToken,
  prefillHallId,
  prefillDate,
  prefillStartTime,
  prefillEndTime,
  onClose,
  onCreated,
  onStateUpdated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const currency = state.profile.currency;

  // Step 1: Client
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState(state.clients[0]?.id || '');
  const [newClient, setNewClient] = useState({
    name: '',
    phone: '',
    email: '',
    organization: '',
  });

  const duplicateClientByPhone = useMemo(() => {
    const cleaned = newClient.phone.replace(/\s+/g, '').trim();
    if (clientMode !== 'new' || cleaned.length < 5) return null;
    return state.clients.find((c) => c.phone.replace(/\s+/g, '').trim() === cleaned) || null;
  }, [clientMode, newClient.phone, state.clients]);

  const activeClient =
    clientMode === 'existing'
      ? state.clients.find((c) => c.id === clientId) || null
      : duplicateClientByPhone;

  // Step 2: Hall & Sessions
  const defaultDate = prefillDate || new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 10);
  const [hallId, setHallId] = useState(
    (prefillHallId && state.halls.find((h) => h.id === prefillHallId && h.active)?.id) ||
      state.halls.find((h) => h.active)?.id ||
      state.halls[0]?.id ||
      ''
  );
  const [eventTitle, setEventTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('Wedding');
  const [bookingMode, setBookingMode] = useState<'single' | 'multi_day' | 'recurring'>('single');
  const [repeatRule, setRepeatRule] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [repeatCount, setRepeatCount] = useState(3);
  const [multiDaysCount, setMultiDaysCount] = useState(3);
  const [baseDate, setBaseDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState(prefillStartTime || '14:00');
  const [endTime, setEndTime] = useState(prefillEndTime || '22:00');
  const [layout, setLayout] = useState<HallLayout>('Banquet');
  const [expectedGuests, setExpectedGuests] = useState(200);
  const [skipConflictingDates, setSkipConflictingDates] = useState(false);
  const [failedHallImages, setFailedHallImages] = useState<Record<string, boolean>>({});

  // Step 3: Catering (3-way: hotel | external | none), Equipment & Addons
  const [cateringMode, setCateringMode] = useState<'hotel' | 'external' | 'none'>('hotel');
  const [cateringPackageId, setCateringPackageId] = useState<string>(state.cateringPackages[0]?.id || '');
  const [cateringGuests, setCateringGuests] = useState(200);
  const [cateringServiceTime, setCateringServiceTime] = useState('18:00');
  const [cateringDietaryNotes, setCateringDietaryNotes] = useState('');
  const [externalCatererName, setExternalCatererName] = useState('');
  const [externalCatererContact, setExternalCatererContact] = useState('');
  const [externalStagingFee, setExternalStagingFee] = useState(0);

  const [equipmentQty, setEquipmentQty] = useState<Record<string, number>>({});
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});

  // Step 4: Room Lines, Discounts & Notes
  const [roomLines, setRoomLines] = useState<
    { roomType: string; count: number; checkInDate: string; checkOutDate: string; ratePerNight: number }[]
  >([]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [operationsBrief, setOperationsBrief] = useState('');

  const [conflicts, setConflicts] = useState<SessionConflict[]>([]);
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [waitlistAddedMsg, setWaitlistAddedMsg] = useState('');

  const selectedHall = state.halls.find((h) => h.id === hallId) || state.halls[0];

  const generatedSessions = useMemo(() => {
    const list: { date: string; startTime: string; endTime: string; layout: HallLayout; expectedGuests: number }[] = [];
    const base = new Date(`${baseDate}T00:00:00`);
    if (Number.isNaN(base.getTime())) return list;

    if (bookingMode === 'single') {
      list.push({ date: baseDate, startTime, endTime, layout, expectedGuests });
    } else if (bookingMode === 'multi_day') {
      for (let i = 0; i < Math.max(2, Math.min(14, multiDaysCount)); i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        list.push({ date: d.toISOString().slice(0, 10), startTime, endTime, layout, expectedGuests });
      }
    } else {
      for (let i = 0; i < Math.max(2, Math.min(12, repeatCount)); i++) {
        const d = new Date(base);
        if (repeatRule === 'weekly') d.setDate(base.getDate() + i * 7);
        else if (repeatRule === 'biweekly') d.setDate(base.getDate() + i * 14);
        else d.setMonth(base.getMonth() + i);
        list.push({ date: d.toISOString().slice(0, 10), startTime, endTime, layout, expectedGuests });
      }
    }
    return list;
  }, [baseDate, bookingMode, endTime, expectedGuests, layout, multiDaysCount, repeatCount, repeatRule, startTime]);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!hallId || generatedSessions.length === 0) return;
      setCheckingConflicts(true);
      try {
        const eqArr = Object.entries(equipmentQty)
          .filter(([, q]) => q > 0)
          .map(([equipmentId, quantity]) => ({ equipmentId, quantity }));
        const res = await fetch('/api/bookings/check-conflicts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ hallId, sessions: generatedSessions, equipment: eqArr }),
        });
        if (res.ok && active) {
          const data = await res.json();
          setConflicts(data.conflicts || []);
        }
      } finally {
        if (active) setCheckingConflicts(false);
      }
    };
    check();
    return () => {
      active = false;
    };
  }, [authToken, equipmentQty, generatedSessions, hallId]);

  const pricingEstimate = useMemo(() => {
    const conflictDates = new Set(conflicts.map((c) => c.date));
    const effectiveSessions = skipConflictingDates
      ? generatedSessions.filter((s) => !conflictDates.has(s.date))
      : generatedSessions;

    const isHalfDay = toMins(endTime) - toMins(startTime) <= 360;
    const ratePerSession = selectedHall ? (isHalfDay ? selectedHall.halfDayRate : selectedHall.baseDayRate) : 0;
    const hallTotal = effectiveSessions.length * ratePerSession;

    const roomTotal = roomLines.reduce((sum, rl) => {
      const nights = Math.max(
        1,
        Math.round((new Date(rl.checkOutDate).getTime() - new Date(rl.checkInDate).getTime()) / 86400000)
      );
      return sum + rl.count * nights * rl.ratePerNight;
    }, 0);

    const equipmentTotal = Object.entries(equipmentQty).reduce((sum, [id, qty]) => {
      const item = state.equipment.find((e) => e.id === id);
      return sum + (item ? item.unitRate * qty : 0);
    }, 0);

    const catPkg = state.cateringPackages.find((c) => c.id === cateringPackageId);
    const cateringTotal =
      cateringMode === 'hotel' && catPkg
        ? catPkg.pricePerHead * cateringGuests
        : cateringMode === 'external'
        ? Math.max(0, Number(externalStagingFee) || 0)
        : 0;

    const addonTotal = Object.entries(addonQty).reduce((sum, [id, qty]) => {
      const item = state.addons.find((a) => a.id === id);
      return sum + (item ? item.unitRate * qty : 0);
    }, 0);

    const subtotal = Math.max(0, hallTotal + roomTotal + equipmentTotal + cateringTotal + addonTotal - discountAmount);
    const taxAmount = Math.round(subtotal * (state.profile.taxRatePercent / 100) * 100) / 100;
    const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;
    const depositRequired = Math.round(grandTotal * (state.profile.depositPercent / 100) * 100) / 100;

    const totalRooms = roomLines.reduce((s, r) => s + r.count, 0);
    const triggersManagerApproval =
      effectiveSessions.length > state.profile.largeBookingDayThreshold ||
      totalRooms > state.profile.largeBookingRoomThreshold ||
      Boolean(activeClient?.overdueFlag) ||
      discountAmount > 0;

    return {
      effectiveSessionCount: effectiveSessions.length,
      hallTotal,
      roomTotal,
      equipmentTotal,
      cateringTotal,
      addonTotal,
      taxAmount,
      grandTotal,
      depositRequired,
      totalRooms,
      triggersManagerApproval,
    };
  }, [
    activeClient?.overdueFlag,
    addonQty,
    cateringGuests,
    cateringMode,
    cateringPackageId,
    conflicts,
    discountAmount,
    endTime,
    equipmentQty,
    externalStagingFee,
    generatedSessions,
    roomLines,
    selectedHall,
    skipConflictingDates,
    startTime,
    state.addons,
    state.cateringPackages,
    state.equipment,
    state.profile.depositPercent,
    state.profile.largeBookingDayThreshold,
    state.profile.largeBookingRoomThreshold,
    state.profile.taxRatePercent,
  ]);

  const handleJoinWaitlist = async (c: SessionConflict) => {
    const clientName = activeClient?.name || newClient.name || 'Walk-in Client';
    const clientPhone = activeClient?.phone || newClient.phone || 'Not provided';
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        hallId,
        desiredDate: c.date,
        startTime: c.startTime,
        endTime: c.endTime,
        clientName,
        clientPhone,
        eventTitle: eventTitle || 'Waitlisted Event',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      onStateUpdated(data.state);
      setWaitlistAddedMsg(`Added ${clientName} to waitlist for ${c.date}.`);
    }
  };

  const handleSubmitBooking = async () => {
    setError('');
    if (!eventTitle.trim()) {
      setError('Event title is required.');
      setStep(2);
      return;
    }
    if (clientMode === 'new' && !duplicateClientByPhone && (!newClient.name.trim() || !newClient.phone.trim())) {
      setError('New client name and phone number are required.');
      setStep(1);
      return;
    }
    if (conflicts.length > 0 && !skipConflictingDates) {
      setError('Resolve schedule or equipment conflicts, or skip clashing dates for multi-session runs.');
      setStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          clientId: clientMode === 'existing' ? clientId : duplicateClientByPhone?.id,
          newClient: clientMode === 'new' && !duplicateClientByPhone ? newClient : undefined,
          hallId,
          eventTitle: eventTitle.trim(),
          eventType,
          bookingMode,
          repeatRule: bookingMode === 'recurring' ? repeatRule : 'none',
          sessions: generatedSessions,
          roomLines,
          equipment: Object.entries(equipmentQty)
            .filter(([, quantity]) => quantity > 0)
            .map(([equipmentId, quantity]) => ({ equipmentId, quantity })),
          catering:
            cateringMode === 'hotel'
              ? {
                  mode: 'hotel',
                  packageId: cateringPackageId,
                  guests: cateringGuests,
                  serviceTime: cateringServiceTime,
                  dietaryNotes: cateringDietaryNotes,
                }
              : cateringMode === 'external'
              ? {
                  mode: 'external',
                  externalCatererName: externalCatererName.trim() || 'Self-Organized External Caterer',
                  externalCatererContact: externalCatererContact.trim(),
                  stagingFee: Math.max(0, Number(externalStagingFee) || 0),
                  guests: cateringGuests,
                  serviceTime: cateringServiceTime,
                  dietaryNotes: cateringDietaryNotes,
                }
              : null,
          addons: Object.entries(addonQty)
            .filter(([, quantity]) => quantity > 0)
            .map(([addonId, quantity]) => ({ addonId, quantity })),
          discountAmount,
          discountReason,
          eventNotes,
          operationsBrief,
          skipConflictingDates,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create booking.');
        return;
      }
      onCreated(data.booking, data.state);
    } catch {
      setError('Network error saving booking.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:rounded-xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">Create Hall Booking</h2>
            <p className="text-xs text-slate-500">
              Step {step} of 4 · Client · Hall & Sessions · Catering & Equipment · Rooms & Proforma
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg"
            aria-label="Close wizard"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 overflow-x-auto shrink-0">
          {[
            { num: 1, label: '1. Client & Check' },
            { num: 2, label: '2. Hall & Sessions' },
            { num: 3, label: '3. Catering & Gear' },
            { num: 4, label: '4. Rooms & Pricing' },
          ].map((item) => (
            <button
              key={item.num}
              type="button"
              onClick={() => setStep(item.num as 1 | 2 | 3 | 4)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                step === item.num
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-slate-600 hover:bg-slate-200/70'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setClientMode('existing')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${
                    clientMode === 'existing' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Existing Client
                </button>
                <button
                  type="button"
                  onClick={() => setClientMode('new')}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md ${
                    clientMode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Register New Client
                </button>
              </div>

              {clientMode === 'existing' ? (
                <div className="space-y-3">
                  <label className="block text-xs font-medium text-slate-700">
                    Select Client Account
                  </label>
                  <select
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {state.clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.phone} ({c.organization})
                        {c.overdueFlag ? ' [OVERDUE FLAGGED]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Phone Number (Duplicate Check)
                    </label>
                    <input
                      type="text"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                      placeholder="+234-803-555-0199"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name / Couple
                    </label>
                    <input
                      type="text"
                      value={newClient.name}
                      onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                      placeholder="e.g. Samuel & Ruth Okeke"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Organization / Church / Family
                    </label>
                    <input
                      type="text"
                      value={newClient.organization}
                      onChange={(e) => setNewClient({ ...newClient, organization: e.target.value })}
                      placeholder="e.g. Calvary Assembly"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={newClient.email}
                      onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                      placeholder="contact@organization.org"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {duplicateClientByPhone && (
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-900">
                  Phone match found: <strong>{duplicateClientByPhone.name}</strong> ({duplicateClientByPhone.organization}). Existing client record will be linked automatically to prevent duplicates.
                </div>
              )}

              {activeClient?.overdueFlag && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-900">
                    <p className="font-semibold">Client Flagged for Overdue Balance</p>
                    <p className="mt-0.5">{activeClient.overdueNotes || 'New bookings for this client automatically require Manager approval.'}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Event Title
                  </label>
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="e.g. Harvest Thanksgiving & Youth Summit"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Event Category
                  </label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as EventType)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Wedding">Wedding</option>
                    <option value="Church Program">Church Program</option>
                    <option value="Corporate Conference">Corporate Conference</option>
                    <option value="Social Gala">Social Gala</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Visual Hall Picker Grid */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Select Event Hall Venue
                  </label>
                  <span className="text-xs text-slate-500">
                    Click a venue card to preview capacity & turnaround buffer
                  </span>
                </div>
                {state.halls.some((h) => !h.active) && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Closed for Maintenance (System Admin):{' '}
                    {state.halls
                      .filter((h) => !h.active)
                      .map((h) => h.name)
                      .join(', ')}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 scene-3d">
                  {state.halls
                    .filter((h) => h.active)
                    .map((h) => {
                      const isSelected = h.id === hallId;
                      return (
                        <TiltCard3D
                          key={h.id}
                          maxTilt={5}
                          asButton
                          onClick={() => {
                            setHallId(h.id);
                            if (h.layouts.length > 0 && !h.layouts.includes(layout)) {
                              setLayout(h.layouts[0]);
                            }
                          }}
                          className={`text-left rounded-xl overflow-hidden border transition-all flex flex-col ${
                            isSelected
                              ? 'border-[#0B1F3A] ring-2 ring-[#C89B3C] bg-[#FAF6EC]/60 depth-layer-2'
                              : 'border-slate-200 hover:border-[#C89B3C]/60 bg-white depth-layer-1'
                          }`}
                        >
                          <div className="aspect-[16/9] w-full bg-slate-100 relative overflow-hidden">
                            {failedHallImages[h.id] || !h.imageUrl ? (
                              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400">
                                <Building2 className="w-6 h-6 mb-1" />
                                <span className="text-xs font-medium">{h.name}</span>
                              </div>
                            ) : (
                              <img
                                src={h.imageUrl}
                                alt={h.name}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedHallImages((prev) => ({ ...prev, [h.id]: true }))
                                }
                                className="w-full h-full object-cover"
                              />
                            )}
                            <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#0B1F3A]/85 to-transparent flex items-end justify-between px-3.5 pb-2">
                              <span className="text-xs font-semibold text-white truncate">
                                {h.name}
                              </span>
                              <span className="text-xs font-mono font-semibold text-[#F3DFAC] tabular-nums shrink-0 ml-2">
                                {formatCurrency(h.baseDayRate, currency)}/day
                              </span>
                            </div>
                          </div>
                          <div className="p-3.5 space-y-1.5">
                            <p className="text-xs text-slate-600 line-clamp-2">{h.description}</p>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500 tabular-nums pt-1">
                              <span>
                                Banquet {h.capacityBanquet} · Theatre {h.capacityTheatre}
                              </span>
                              <span>
                                Half-day {formatCurrency(h.halfDayRate, currency)} · {h.bufferMinutes}m buffer
                              </span>
                            </div>
                          </div>
                        </TiltCard3D>
                      );
                    })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Seating Layout</label>
                  <select
                    value={layout}
                    onChange={(e) => setLayout(e.target.value as HallLayout)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {(selectedHall?.layouts || ['Banquet', 'Theatre']).map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Expected Headcount
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={expectedGuests}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 1;
                      setExpectedGuests(val);
                      setCateringGuests(val);
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Session Pattern */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-800">Session Schedule Pattern</span>
                  <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-md">
                    {[
                      { id: 'single', label: 'Single Event' },
                      { id: 'multi_day', label: 'Multi-Day Run' },
                      { id: 'recurring', label: 'Repeat Rule' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setBookingMode(m.id as 'single' | 'multi_day' | 'recurring')}
                        className={`px-2.5 py-1 text-xs font-medium rounded ${
                          bookingMode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={baseDate}
                      onChange={(e) => setBaseDate(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Time Slot Preset
                    </label>
                    <select
                      value={
                        state.profile.timeSlots.find(
                          (t) => t.startTime === startTime && t.endTime === endTime
                        )?.id || ''
                      }
                      onChange={(e) => {
                        const slot = state.profile.timeSlots.find((t) => t.id === e.target.value);
                        if (slot) {
                          setStartTime(slot.startTime);
                          setEndTime(slot.endTime);
                        }
                      }}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">Custom Times</option>
                      {state.profile.timeSlots.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label} ({t.startTime}–{t.endTime})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Start</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">End</label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                </div>

                {bookingMode === 'multi_day' && (
                  <div className="flex items-center gap-3">
                    <label className="text-xs font-medium text-slate-700">Consecutive Days:</label>
                    <input
                      type="number"
                      min={2}
                      max={14}
                      value={multiDaysCount}
                      onChange={(e) => setMultiDaysCount(Number(e.target.value) || 2)}
                      className="w-20 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white font-mono"
                    />
                  </div>
                )}

                {bookingMode === 'recurring' && (
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate-700">Frequency:</label>
                      <select
                        value={repeatRule}
                        onChange={(e) =>
                          setRepeatRule(e.target.value as 'weekly' | 'biweekly' | 'monthly')
                        }
                        className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Bi-weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-slate-700">Occurrences:</label>
                      <input
                        type="number"
                        min={2}
                        max={12}
                        value={repeatCount}
                        onChange={(e) => setRepeatCount(Number(e.target.value) || 2)}
                        className="w-20 px-2.5 py-1.5 text-xs border border-slate-300 rounded-md bg-white font-mono"
                      />
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-600 font-mono tabular-nums">
                  Sessions generated ({generatedSessions.length}):{' '}
                  {generatedSessions.map((s) => s.date).join(', ')}
                </p>
              </div>

              {/* Same-Day Hall Schedule & Turnaround Buffer Preview */}
              {selectedHall && (() => {
                const buffer = selectedHall.bufferMinutes;
                const sameDayBookings = state.bookings
                  .filter((b) => !['cancelled', 'expired', 'closed'].includes(b.status) && b.hallId === selectedHall.id)
                  .flatMap((b) =>
                    b.sessions
                      .filter((s) => s.status !== 'cancelled' && s.date === baseDate)
                      .map((s) => ({
                        id: b.id,
                        title: b.eventTitle,
                        startTime: s.startTime,
                        endTime: s.endTime,
                      }))
                  );
                const sameDayMaint = state.maintenanceBlocks
                  .filter((m) => m.hallId === selectedHall.id && m.date === baseDate)
                  .map((m) => ({
                    id: m.id,
                    title: `Maintenance: ${m.reason}`,
                    startTime: m.startTime,
                    endTime: m.endTime,
                  }));
                const occupied = [...sameDayBookings, ...sameDayMaint].sort(
                  (a, b) => toMins(a.startTime) - toMins(b.startTime)
                );
                const earliestStartMins = occupied[0] ? toMins(occupied[0].startTime) : 24 * 60;
                const latestEndMins = occupied.reduce((mx, o) => Math.max(mx, toMins(o.endTime)), 0);
                const morningOpenEnd = earliestStartMins - buffer;
                const eveningOpenStart = latestEndMins + buffer;

                return (
                  <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#0B1F3A]">
                        <Clock className="w-3.5 h-3.5 text-[#C89B3C]" />
                        <span>
                          {selectedHall.name} on {baseDate} · {buffer}m Clearing & Prep Buffer
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        Same-day 2nd bookings allowed outside the {buffer}m turnaround gap
                      </span>
                    </div>

                    {occupied.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No existing events on {baseDate}. Hall is clear all day — any same-day second booking added later will reserve a {buffer}m clearing gap.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {occupied.map((item) => {
                          const clearedAt = minsToHHMM(toMins(item.endTime) + buffer);
                          return (
                            <div
                              key={`${item.id}-${item.startTime}`}
                              className="flex flex-wrap items-center justify-between gap-2 text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-md"
                            >
                              <span className="text-slate-800">
                                <strong className="font-mono tabular-nums">
                                  {item.startTime}–{item.endTime}
                                </strong>{' '}
                                {item.title}
                              </span>
                              <span className="font-mono text-amber-800 tabular-nums">
                                {item.endTime}–{clearedAt} Clearing/Prep · Next open: {clearedAt}
                              </span>
                            </div>
                          );
                        })}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {morningOpenEnd >= 12 * 60 && (
                            <button
                              type="button"
                              onClick={() => {
                                setStartTime('08:00');
                                setEndTime(minsToHHMM(Math.min(14 * 60, morningOpenEnd)));
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-[#FAF6EC] text-[#0B1F3A] hover:bg-[#F3DFAC]/50 border border-[#C89B3C]/60 rounded font-mono tabular-nums"
                            >
                              Set Morning Slot: 08:00–{minsToHHMM(Math.min(14 * 60, morningOpenEnd))}
                            </button>
                          )}
                          {eveningOpenStart <= 19 * 60 && (
                            <button
                              type="button"
                              onClick={() => {
                                setStartTime(minsToHHMM(eveningOpenStart));
                                setEndTime('22:00');
                              }}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-[#FAF6EC] text-[#0B1F3A] hover:bg-[#F3DFAC]/50 border border-[#C89B3C]/60 rounded font-mono tabular-nums"
                            >
                              Set Evening Slot: {minsToHHMM(eveningOpenStart)}–22:00
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Conflict Engine Output */}
              {checkingConflicts ? (
                <p className="text-xs text-slate-500">Checking hall, buffer, maintenance, and equipment availability...</p>
              ) : conflicts.length === 0 ? (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>No schedule, turnaround buffer, or maintenance conflicts detected.</span>
                </div>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-red-900 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      {conflicts.length} Conflict(s) Detected
                    </span>
                    {generatedSessions.length > 1 && (
                      <label className="flex items-center gap-1.5 text-xs font-medium text-red-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={skipConflictingDates}
                          onChange={(e) => setSkipConflictingDates(e.target.checked)}
                        />
                        Skip clashing dates
                      </label>
                    )}
                  </div>
                  <div className="space-y-2">
                    {conflicts.map((c, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-white border border-red-200 rounded-md text-xs space-y-2"
                      >
                        <p className="font-medium text-slate-900">{c.message}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {c.alternativeHalls.map((alt) => (
                            <button
                              key={alt.id}
                              type="button"
                              onClick={() => setHallId(alt.id)}
                              className="px-2.5 py-1 bg-slate-900 text-white rounded text-[11px] font-medium hover:bg-slate-800"
                            >
                              Switch to {alt.name}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleJoinWaitlist(c)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-[11px] font-medium"
                          >
                            Add to Waitlist ({c.date})
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {waitlistAddedMsg && (
                    <p className="text-xs font-medium text-emerald-800">{waitlistAddedMsg}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {/* 3-Option Catering Arrangement */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Catering Arrangement</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Select hotel banquet service, client self-organized external catering, or hall-only rental without catering
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'hotel' as const,
                      title: 'Hotel Banquet Catering',
                      desc: 'Choose an Exclusive Serene Hotel menu package per head',
                      icon: <ChefHat className="w-4 h-4 shrink-0" />,
                    },
                    {
                      id: 'external' as const,
                      title: 'Self-Organized / External',
                      desc: 'Client brings their own caterer with optional staging fee',
                      icon: <UtensilsCrossed className="w-4 h-4 shrink-0" />,
                    },
                    {
                      id: 'none' as const,
                      title: 'No Catering (Hall Only)',
                      desc: 'Venue, seating & AV only — zero catering charges',
                      icon: <Building2 className="w-4 h-4 shrink-0" />,
                    },
                  ].map((opt) => {
                    const active = cateringMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCateringMode(opt.id)}
                        className={`text-left p-3.5 rounded-xl border transition-all space-y-1.5 ${
                          active
                            ? 'border-[#0B1F3A] ring-2 ring-[#C89B3C] bg-[#FAF6EC]/60'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`flex items-center gap-2 text-xs font-semibold ${active ? 'text-[#0B1F3A]' : 'text-slate-900'}`}>
                          {opt.icon}
                          <span>{opt.title}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {cateringMode === 'hotel' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Hotel Menu Package
                      </label>
                      <select
                        value={cateringPackageId}
                        onChange={(e) => setCateringPackageId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {state.cateringPackages.map((pkg) => (
                          <option key={pkg.id} value={pkg.id}>
                            {pkg.name} ({formatCurrency(pkg.pricePerHead, currency)}/head)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Portions
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={cateringGuests}
                          onChange={(e) => setCateringGuests(Number(e.target.value) || 1)}
                          className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Service Time
                        </label>
                        <input
                          type="time"
                          value={cateringServiceTime}
                          onChange={(e) => setCateringServiceTime(e.target.value)}
                          className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Dietary & Kitchen Notes
                      </label>
                      <input
                        type="text"
                        value={cateringDietaryNotes}
                        onChange={(e) => setCateringDietaryNotes(e.target.value)}
                        placeholder="e.g. 15 Vegan, 10 Halal, nut-free dessert prep"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {cateringMode === 'external' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        External Caterer / Chef Name
                      </label>
                      <input
                        type="text"
                        value={externalCatererName}
                        onChange={(e) => setExternalCatererName(e.target.value)}
                        placeholder="e.g. Royal Taste Catering Co."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Caterer Contact Phone
                      </label>
                      <input
                        type="text"
                        value={externalCatererContact}
                        onChange={(e) => setExternalCatererContact(e.target.value)}
                        placeholder="+234-803-555-0190"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Kitchen Staging / Corkage Fee ({currency})
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={externalStagingFee}
                        onChange={(e) => setExternalStagingFee(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Serving Time
                      </label>
                      <input
                        type="time"
                        value={cateringServiceTime}
                        onChange={(e) => setCateringServiceTime(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Loading Bay & Warming Station Notes
                      </label>
                      <input
                        type="text"
                        value={cateringDietaryNotes}
                        onChange={(e) => setCateringDietaryNotes(e.target.value)}
                        placeholder="e.g. External crew arrives 2h prior via service bay; needs 2 warming tables"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                {cateringMode === 'none' && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                    No food or beverage service attached. Hall rental, seating layout, equipment, and optional guest rooms only.
                  </div>
                )}
              </div>

              {/* Equipment Inventory Reservation */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Equipment Stock Reservation</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {state.equipment.map((eq) => (
                    <div
                      key={eq.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{eq.name}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {eq.category} · {eq.totalStock} total in stock · {formatCurrency(eq.unitRate, currency)}/unit
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={eq.totalStock}
                        value={equipmentQty[eq.id] || 0}
                        onChange={(e) =>
                          setEquipmentQty({
                            ...equipmentQty,
                            [eq.id]: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-20 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg font-mono text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Add-ons */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Service Add-Ons</h3>
                </div>
                <div className="divide-y divide-slate-200">
                  {state.addons.map((a) => (
                    <div
                      key={a.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{a.name}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {formatCurrency(a.unitRate, currency)} / {a.unitLabel}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={addonQty[a.id] || 0}
                        onChange={(e) =>
                          setAddonQty({
                            ...addonQty,
                            [a.id]: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="w-20 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg font-mono text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              {/* Optional Room Lines */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Hotel Room Block Lines (Optional)
                    </h3>
                    <p className="text-xs text-slate-500">
                      Room lines route to Front Desk to verify how many rooms are available and confirm how much each room goes for before Proforma lock.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRoomLines([
                        ...roomLines,
                        {
                          roomType: 'Standard Twin Guest Room',
                          count: 10,
                          checkInDate: baseDate,
                          checkOutDate: new Date(new Date(`${baseDate}T00:00:00`).getTime() + 86400000 * 2)
                            .toISOString()
                            .slice(0, 10),
                          ratePerNight: 55000,
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Room Line
                  </button>
                </div>

                {roomLines.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No rooms attached — booking skips Front Desk verification step.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {roomLines.map((rl, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-2 sm:grid-cols-12 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg items-end"
                      >
                        <div className="col-span-2 sm:col-span-4">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Room Category
                          </label>
                          <input
                            type="text"
                            value={rl.roomType}
                            onChange={(e) => {
                              const next = [...roomLines];
                              next[idx].roomType = e.target.value;
                              setRoomLines(next);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Qty
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={rl.count}
                            onChange={(e) => {
                              const next = [...roomLines];
                              next[idx].count = Number(e.target.value) || 1;
                              setRoomLines(next);
                            }}
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Check-In
                          </label>
                          <input
                            type="date"
                            value={rl.checkInDate}
                            onChange={(e) => {
                              const next = [...roomLines];
                              next[idx].checkInDate = e.target.value;
                              setRoomLines(next);
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Check-Out
                          </label>
                          <input
                            type="date"
                            value={rl.checkOutDate}
                            onChange={(e) => {
                              const next = [...roomLines];
                              next[idx].checkOutDate = e.target.value;
                              setRoomLines(next);
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] font-medium text-slate-600 mb-1">
                            Est. Rate/Nt
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={rl.ratePerNight}
                            onChange={(e) => {
                              const next = [...roomLines];
                              next[idx].ratePerNight = Number(e.target.value) || 0;
                              setRoomLines(next);
                            }}
                            className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-mono"
                          />
                        </div>
                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setRoomLines(roomLines.filter((_, i) => i !== idx))}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            aria-label="Remove room line"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Discount & Operations Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Requested Discount ({currency}) — Requires Manager Approval
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Discount Justification
                  </label>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Optional reason for discount"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Event Notes
                  </label>
                  <input
                    type="text"
                    value={eventNotes}
                    onChange={(e) => setEventNotes(e.target.value)}
                    placeholder="Stage lighting, VIP arrival, protocol notes"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Operations Setup Brief
                  </label>
                  <input
                    type="text"
                    value={operationsBrief}
                    onChange={(e) => setOperationsBrief(e.target.value)}
                    placeholder="Room turnaround & AV check timings"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Live Pricing Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Hall Rental ({pricingEstimate.effectiveSessionCount} session(s))</span>
                  <span className="font-mono tabular-nums">{formatCurrency(pricingEstimate.hallTotal, currency)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>
                    {cateringMode === 'external'
                      ? 'External Catering Staging / Corkage'
                      : cateringMode === 'none'
                      ? 'Catering (Hall Only)'
                      : 'Hotel Banquet Catering'}
                  </span>
                  <span className="font-mono tabular-nums">{formatCurrency(pricingEstimate.cateringTotal, currency)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Equipment & Add-Ons</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(pricingEstimate.equipmentTotal + pricingEstimate.addonTotal, currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Room Block ({pricingEstimate.totalRooms} rooms)</span>
                  <span className="font-mono tabular-nums">{formatCurrency(pricingEstimate.roomTotal, currency)}</span>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Approved Discount</span>
                    <span className="font-mono tabular-nums">-{formatCurrency(discountAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({state.profile.taxRatePercent}%)</span>
                  <span className="font-mono tabular-nums">{formatCurrency(pricingEstimate.taxAmount, currency)}</span>
                </div>
                <div className="pt-2 border-t border-slate-300 flex justify-between font-bold text-slate-900 text-base">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">{formatCurrency(pricingEstimate.grandTotal, currency)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Deposit Required to Lock ({state.profile.depositPercent}%)</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {formatCurrency(pricingEstimate.depositRequired, currency)}
                  </span>
                </div>
                {pricingEstimate.triggersManagerApproval && (
                  <p className="pt-2 text-xs font-medium text-amber-800">
                    Note: Booking triggers Manager approval (exceeds {state.profile.largeBookingDayThreshold} days / {state.profile.largeBookingRoomThreshold} rooms, discount, or flagged client).
                  </p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
              {error}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep((step - 1) as 1 | 2 | 3 | 4) : onClose())}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
          >
            {step > 1 ? 'Back' : 'Cancel'}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#13294B] rounded-lg"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmitBooking}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#13294B] disabled:opacity-50 rounded-lg"
            >
              {submitting ? 'Generating Booking...' : 'Create Booking & Issue Proforma'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
