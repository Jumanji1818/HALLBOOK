import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createInitialDatabase, type HallBookDatabase, type ServerStaffRecord } from './src/server/seedData.ts';
import type {
  Booking,
  BookingSession,
  HallLayout,
  PaymentRecord,
  RoomLine,
  SessionConflict,
  StaffRole,
  SystemErrorRecord,
} from './src/types.ts';

dotenv.config();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.resolve(DATA_DIR, 'hallbook-db.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function signToken(payload: { userId: string; role: StaffRole; exp: number }): string {
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token: string): { userId: string; role: StaffRole; exp: number } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as {
      userId: string;
      role: StaffRole;
      exp: number;
    };
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadDatabase(): HallBookDatabase {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as HallBookDatabase;
    let dirty = false;

    if (parsed.recoveryKeyHash === undefined) {
      parsed.recoveryKeyHash = null;
      dirty = true;
    }
    if (!Array.isArray(parsed.resetTokens)) {
      parsed.resetTokens = [];
      dirty = true;
    }
    if (!Array.isArray(parsed.systemErrors)) {
      parsed.systemErrors = [];
      dirty = true;
    }

    for (const s of parsed.staff || []) {
      if (s.approvalStatus === undefined) {
        s.approvalStatus = 'approved';
        dirty = true;
      }
      if (s.approvedBy === undefined) {
        s.approvedBy = null;
        dirty = true;
      }
      if (s.approvedAt === undefined) {
        s.approvedAt = null;
        dirty = true;
      }
      if (s.locked === undefined) {
        s.locked = false;
        dirty = true;
      }
      if (s.lockedReason === undefined) {
        s.lockedReason = null;
        dirty = true;
      }
      if (s.lockedAt === undefined) {
        s.lockedAt = null;
        dirty = true;
      }
      if (s.failedAttempts === undefined) {
        s.failedAttempts = 0;
        dirty = true;
      }
    }

    if (!parsed.turnaroundDefaultApplied) {
      const legacyBuffers: Record<string, number> = {
        'hall-ballroom': 90,
        'hall-conference': 60,
        'hall-garden': 60,
        'hall-salon': 45,
      };
      for (const h of parsed.halls || []) {
        if (legacyBuffers[h.id] !== undefined && h.bufferMinutes === legacyBuffers[h.id]) {
          h.bufferMinutes = 120;
        }
      }
      if (Array.isArray(parsed.profile?.timeSlots)) {
        const morning = parsed.profile.timeSlots.find((t) => t.id === 'slot-morning');
        const afternoon = parsed.profile.timeSlots.find((t) => t.id === 'slot-afternoon');
        if (morning && morning.startTime === '08:00' && morning.endTime === '13:00') {
          morning.endTime = '14:00';
        }
        if (afternoon && afternoon.startTime === '14:00' && afternoon.endTime === '22:00') {
          afternoon.label = 'Evening Session';
          afternoon.startTime = '16:00';
        }
      }
      parsed.turnaroundDefaultApplied = true;
      dirty = true;
    }

    // One-time non-destructive migration to Nigerian Naira (NGN) & Abuja Exclusive Serene Hotel identity
    // Preserves initializedPasscode, recoveryKeyHash, resetTokens, and all passwordHashes.
    if (!parsed.nairaCurrencyApplied) {
      const scale = parsed.profile?.currency === 'USD' ? 400 : 1;
      if (parsed.profile) {
        parsed.profile.currency = 'NGN';
        parsed.profile.hotelName = 'Exclusive Serene Hotel';
        if (!parsed.profile.address || parsed.profile.address.includes('Marble Arch')) {
          parsed.profile.address = 'Plot 31, Reuben Okoya Crescent, by Olusegun Obasanjo Way, Wuye, FCT Abuja';
        }
        if (!parsed.profile.phone || parsed.profile.phone.includes('+1-')) {
          parsed.profile.phone = '+234 813 292 8544';
        }
        if (!parsed.profile.tagline || parsed.profile.tagline.includes('Luxury Hospitality')) {
          parsed.profile.tagline = 'Wuye, Abuja · Hospitality, Events & Banquet Operations';
        }
        if (Array.isArray(parsed.profile.bankAccounts)) {
          for (const ba of parsed.profile.bankAccounts) {
            if (ba.bankName === 'First Meridian Commercial Bank') {
              ba.bankName = 'Zenith Bank Plc';
              ba.branch = 'Wuye Branch, FCT Abuja';
            } else if (ba.bankName === 'Crown Reserve Trust') {
              ba.bankName = 'First Bank of Nigeria Ltd';
              ba.branch = 'Central Business District, Abuja';
            }
          }
        }
      }
      if (scale > 1) {
        for (const h of parsed.halls || []) {
          h.baseDayRate = Math.round(h.baseDayRate * scale);
          h.halfDayRate = Math.round(h.halfDayRate * scale);
        }
        for (const eq of parsed.equipment || []) {
          eq.unitRate = Math.round(eq.unitRate * scale);
          eq.replacementCost = Math.round(eq.replacementCost * scale);
        }
        for (const cat of parsed.cateringPackages || []) {
          cat.pricePerHead = Math.round(cat.pricePerHead * scale);
        }
        for (const ad of parsed.addons || []) {
          ad.unitRate = Math.round(ad.unitRate * scale);
        }
        for (const b of parsed.bookings || []) {
          for (const rl of b.roomLines || []) {
            rl.ratePerNight = Math.round(rl.ratePerNight * scale);
          }
          for (const eq of b.equipment || []) {
            eq.unitRate = Math.round(eq.unitRate * scale);
            eq.damageFee = Math.round((eq.damageFee || 0) * scale);
          }
          if (b.catering) {
            b.catering.pricePerHead = Math.round(b.catering.pricePerHead * scale);
            if (b.catering.stagingFee) {
              b.catering.stagingFee = Math.round(b.catering.stagingFee * scale);
            }
          }
          for (const ad of b.addons || []) {
            ad.unitRate = Math.round(ad.unitRate * scale);
          }
          b.discountAmount = Math.round(b.discountAmount * scale);
          b.extrasAmount = Math.round(b.extrasAmount * scale);
          b.hallTotal = Math.round(b.hallTotal * scale);
          b.roomTotal = Math.round(b.roomTotal * scale);
          b.equipmentTotal = Math.round(b.equipmentTotal * scale);
          b.cateringTotal = Math.round(b.cateringTotal * scale);
          b.addonTotal = Math.round(b.addonTotal * scale);
          b.taxAmount = Math.round(b.taxAmount * scale * 100) / 100;
          b.grandTotal = Math.round(b.grandTotal * scale * 100) / 100;
          b.depositRequired = Math.round(b.depositRequired * scale * 100) / 100;
          b.suggestedRefund = Math.round((b.suggestedRefund || 0) * scale);
        }
        for (const p of parsed.payments || []) {
          p.amount = Math.round(p.amount * scale);
        }
        for (const r of parsed.refunds || []) {
          r.amount = Math.round(r.amount * scale);
        }
        for (const sh of parsed.shifts || []) {
          sh.openingFloat = Math.round(sh.openingFloat * scale);
          if (sh.declaredCash !== null) sh.declaredCash = Math.round(sh.declaredCash * scale);
        }
      }
      parsed.nairaCurrencyApplied = true;
      dirty = true;
    }

    if (
      parsed.profile &&
      (parsed.profile.address?.includes('Victoria District') ||
        parsed.profile.address?.includes('Marble Arch') ||
        parsed.profile.phone?.includes('+1-'))
    ) {
      parsed.profile.address =
        'Plot 31, Reuben Okoya Crescent, by Olusegun Obasanjo Way, Wuye, FCT Abuja';
      parsed.profile.phone = '+234 813 292 8544';
      parsed.profile.email = 'reservation@exclusiveserenehotel.com';
      parsed.profile.tagline = 'Wuye, Abuja · Hospitality, Events & Banquet Operations';
      dirty = true;
    }

    if (dirty) {
      fs.writeFileSync(DB_PATH, JSON.stringify(parsed, null, 2), 'utf8');
    }
    return parsed;
  } catch {
    const initial = createInitialDatabase();
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

let db: HallBookDatabase = loadDatabase();

function saveDatabase(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

function currencySymbol(): string {
  return db.profile.currency === 'NGN' ? '₦' : db.profile.currency === 'USD' ? '$' : `${db.profile.currency} `;
}

function fmtMoney(amount: number): string {
  return `${currencySymbol()}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToHHMM(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function sessionsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
  bufferMinutes: number
): boolean {
  const s1 = toMinutes(aStart) - bufferMinutes;
  const e1 = toMinutes(aEnd) + bufferMinutes;
  const s2 = toMinutes(bStart);
  const e2 = toMinutes(bEnd);
  return s1 < e2 && s2 < e1;
}

function toScheduleOnlyBooking(b: Booking): Booking {
  return {
    id: b.id,
    clientId: '',
    hallId: b.hallId,
    eventTitle: b.eventTitle,
    eventType: b.eventType,
    bookingMode: b.bookingMode,
    repeatRule: b.repeatRule,
    sessions: b.sessions,
    roomLines: [],
    equipment: [],
    catering: null,
    addons: [],
    guests: [],
    status: b.status,
    holdExpiresAt: null,
    requiresManagerApproval: false,
    managerApprovedBy: null,
    managerApprovedAt: null,
    discountAmount: 0,
    discountReason: '',
    extrasAmount: 0,
    extrasNotes: '',
    hallTotal: 0,
    roomTotal: 0,
    equipmentTotal: 0,
    cateringTotal: 0,
    addonTotal: 0,
    taxAmount: 0,
    grandTotal: 0,
    depositRequired: 0,
    finalDueDate: b.finalDueDate,
    createdBy: b.createdBy,
    assignedOfficerId: b.assignedOfficerId,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    amendments: [],
    cancellationReason: null,
    suggestedRefund: 0,
    eventNotes: '',
    operationsBrief: '',
  };
}

function sanitizeClientResponse(state: HallBookDatabase, actor?: ServerStaffRecord) {
  const safeStaff = state.staff.map(({ passwordHash, ...safe }) => ({
    ...safe,
    hasPassword: Boolean(passwordHash),
  }));

  if (!actor || actor.role === 'manager' || actor.role === 'owner') {
    return {
      profile: state.profile,
      halls: state.halls,
      equipment: state.equipment,
      cateringPackages: state.cateringPackages,
      addons: state.addons,
      clients: state.clients,
      bookings: state.bookings,
      payments: state.payments,
      refunds: state.refunds,
      shifts: state.shifts,
      waitlist: state.waitlist,
      maintenanceBlocks: state.maintenanceBlocks,
      tasks: state.tasks,
      auditLogs: state.auditLogs,
      systemErrors: state.systemErrors || [],
      staff: safeStaff,
    };
  }

  const ownStaffOnly = safeStaff.filter((s) => s.id === actor.id);

  if (actor.role === 'sys_admin') {
    return {
      profile: { ...state.profile, bankAccounts: [] },
      halls: state.halls,
      equipment: [],
      cateringPackages: [],
      addons: [],
      clients: [],
      bookings: state.bookings.map(toScheduleOnlyBooking),
      payments: [],
      refunds: [],
      shifts: [],
      waitlist: [],
      maintenanceBlocks: state.maintenanceBlocks,
      tasks: state.tasks.filter((t) => t.roleTarget === 'sys_admin'),
      auditLogs: state.auditLogs.filter(
        (l) =>
          l.actorId === actor.id ||
          l.actorRole === 'sys_admin' ||
          ['hall', 'staff', 'system'].includes(l.targetType)
      ),
      systemErrors: state.systemErrors || [],
      staff: safeStaff,
    };
  }

  if (actor.role === 'front_desk') {
    const visibleBookings = state.bookings.map((b) => {
      if (b.roomLines.length > 0 || b.status === 'locked') {
        return {
          ...b,
          catering: null,
          equipment: [],
          addons: [],
          amendments: [],
          discountAmount: 0,
          discountReason: '',
          extrasAmount: 0,
          extrasNotes: '',
          hallTotal: 0,
          equipmentTotal: 0,
          cateringTotal: 0,
          addonTotal: 0,
          taxAmount: 0,
          grandTotal: 0,
          depositRequired: 0,
          suggestedRefund: 0,
        };
      }
      return toScheduleOnlyBooking(b);
    });
    const visibleClientIds = new Set(
      visibleBookings.map((b) => b.clientId).filter(Boolean)
    );
    return {
      profile: { ...state.profile, bankAccounts: [] },
      halls: state.halls,
      equipment: [],
      cateringPackages: [],
      addons: [],
      clients: state.clients
        .filter((c) => visibleClientIds.has(c.id))
        .map((c) => ({ ...c, overdueFlag: false, overdueNotes: '' })),
      bookings: visibleBookings,
      payments: [],
      refunds: [],
      shifts: [],
      waitlist: [],
      maintenanceBlocks: state.maintenanceBlocks,
      tasks: state.tasks.filter((t) => t.roleTarget === 'front_desk'),
      auditLogs: state.auditLogs.filter((l) => l.actorId === actor.id),
      systemErrors: [],
      staff: ownStaffOnly,
    };
  }

  if (actor.role === 'operations') {
    return {
      profile: { ...state.profile, bankAccounts: [] },
      halls: state.halls,
      equipment: state.equipment,
      cateringPackages: state.cateringPackages,
      addons: state.addons,
      clients: state.clients.map((c) => ({ ...c, overdueFlag: false, overdueNotes: '' })),
      bookings: state.bookings.map((b) => ({
        ...b,
        roomLines: [],
        amendments: [],
        discountAmount: 0,
        discountReason: '',
        extrasAmount: 0,
        hallTotal: 0,
        roomTotal: 0,
        equipmentTotal: 0,
        cateringTotal: 0,
        addonTotal: 0,
        taxAmount: 0,
        grandTotal: 0,
        depositRequired: 0,
        suggestedRefund: 0,
      })),
      payments: [],
      refunds: [],
      shifts: [],
      waitlist: [],
      maintenanceBlocks: state.maintenanceBlocks,
      tasks: state.tasks.filter((t) => t.roleTarget === 'operations'),
      auditLogs: state.auditLogs.filter((l) => l.actorId === actor.id),
      systemErrors: [],
      staff: ownStaffOnly,
    };
  }

  if (actor.role === 'cashier') {
    return {
      profile: state.profile,
      halls: state.halls,
      equipment: [],
      cateringPackages: [],
      addons: [],
      clients: state.clients,
      bookings: state.bookings.map((b) => ({
        ...b,
        guests: [],
        amendments: [],
      })),
      payments: state.payments,
      refunds: state.refunds,
      shifts: state.shifts,
      waitlist: [],
      maintenanceBlocks: state.maintenanceBlocks,
      tasks: state.tasks.filter((t) => t.roleTarget === 'cashier'),
      auditLogs: state.auditLogs.filter((l) => l.actorId === actor.id),
      systemErrors: [],
      staff: ownStaffOnly,
    };
  }

  // booking_officer: full view of own bookings + schedule-only projection of others
  const ownBookingIds = new Set(
    state.bookings
      .filter((b) => b.assignedOfficerId === actor.id || b.createdBy === actor.name)
      .map((b) => b.id)
  );
  return {
    profile: state.profile,
    halls: state.halls,
    equipment: state.equipment,
    cateringPackages: state.cateringPackages,
    addons: state.addons,
    clients: state.clients,
    bookings: state.bookings.map((b) =>
      ownBookingIds.has(b.id) ? b : toScheduleOnlyBooking(b)
    ),
    payments: state.payments.filter((p) => ownBookingIds.has(p.bookingId)),
    refunds: state.refunds.filter((r) => ownBookingIds.has(r.bookingId)),
    shifts: [],
    waitlist: state.waitlist,
    maintenanceBlocks: state.maintenanceBlocks,
    tasks: state.tasks.filter(
      (t) => t.roleTarget === 'booking_officer' && (!t.assignedToId || t.assignedToId === actor.id)
    ),
    auditLogs: state.auditLogs.filter((l) => l.actorId === actor.id),
    systemErrors: [],
    staff: ownStaffOnly,
  };
}

function recordSystemError(
  source: SystemErrorRecord['source'],
  severity: SystemErrorRecord['severity'],
  message: string,
  context = '',
  reportedBy = 'System Monitor'
): SystemErrorRecord {
  const entry: SystemErrorRecord = {
    id: `err-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    source,
    severity,
    message: message.slice(0, 400),
    context: context.slice(0, 400),
    reportedBy,
    status: 'open',
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
  };
  db.systemErrors.unshift(entry);
  if (db.systemErrors.length > 200) db.systemErrors = db.systemErrors.slice(0, 200);
  db.tasks.unshift({
    id: `tsk-err-${Date.now()}`,
    assignedToId: db.staff.find((s) => s.role === 'sys_admin' && s.active)?.id || null,
    roleTarget: 'sys_admin',
    bookingId: entry.id,
    type: 'system_error',
    title: `System Error (${severity.toUpperCase()}) — ${source}`,
    description: entry.message,
    status: 'open',
    createdAt: entry.timestamp,
  });
  return entry;
}

function appendAudit(
  actor: ServerStaffRecord,
  action: string,
  targetType: string,
  targetId: string,
  reason: string,
  details: string,
  highImpact = false
): void {
  db.auditLogs.unshift({
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    reason,
    details,
    highImpact,
  });
}

function getVerifiedPaidForBooking(bookingId: string): number {
  return db.payments
    .filter((p) => p.bookingId === bookingId && p.status === 'verified')
    .reduce((sum, p) => sum + p.amount, 0);
}

function computeConflicts(
  hallId: string,
  sessions: { date: string; startTime: string; endTime: string }[],
  equipmentRequests: { equipmentId: string; quantity: number }[],
  excludeBookingId?: string
): SessionConflict[] {
  const hall = db.halls.find((h) => h.id === hallId);
  if (!hall) return [];
  const conflicts: SessionConflict[] = [];

  for (const req of sessions) {
    if (!hall.active) {
      conflicts.push({
        date: req.date,
        startTime: req.startTime,
        endTime: req.endTime,
        conflictType: 'maintenance',
        conflictingId: hall.id,
        conflictingTitle: `${hall.name} — Out of Service`,
        message: `${hall.name} is currently placed Out of Service by System Admin and cannot accept new bookings.`,
        alternativeHalls: findAlternativeHalls(hallId, req.date, req.startTime, req.endTime, excludeBookingId),
      });
    }
    // 1. Check existing active/hold/locked bookings for same hall
    for (const b of db.bookings) {
      if (b.id === excludeBookingId) continue;
      if (['cancelled', 'expired', 'closed'].includes(b.status)) continue;
      if (b.hallId !== hallId) continue;

      for (const existingSes of b.sessions) {
        if (existingSes.status === 'cancelled') continue;
        if (existingSes.date === req.date && sessionsOverlap(req.startTime, req.endTime, existingSes.startTime, existingSes.endTime, hall.bufferMinutes)) {
          const isHold = b.status === 'hold_proforma' || b.status === 'awaiting_room_verification' || b.status === 'awaiting_manager_approval';
          const clearedAt = minsToHHMM(toMinutes(existingSes.endTime) + hall.bufferMinutes);
          const preClearBefore = minsToHHMM(toMinutes(existingSes.startTime) - hall.bufferMinutes);
          conflicts.push({
            date: req.date,
            startTime: req.startTime,
            endTime: req.endTime,
            conflictType: isHold ? 'hold' : 'booking',
            conflictingId: b.id,
            conflictingTitle: `${b.eventTitle} (${existingSes.startTime}–${existingSes.endTime})`,
            message: `${hall.name} overlaps with ${b.id} (${b.eventTitle}, ${existingSes.startTime}–${existingSes.endTime}) + ${hall.bufferMinutes}m clearing & prep buffer (next open start: ${clearedAt}; pre-event clear ends by ${preClearBefore}).`,
            alternativeHalls: findAlternativeHalls(hallId, req.date, req.startTime, req.endTime, excludeBookingId),
          });
        }
      }
    }

    // 2. Check maintenance blocks
    for (const m of db.maintenanceBlocks) {
      if (m.hallId !== hallId || m.date !== req.date) continue;
      if (sessionsOverlap(req.startTime, req.endTime, m.startTime, m.endTime, hall.bufferMinutes)) {
        const clearedAt = minsToHHMM(toMinutes(m.endTime) + hall.bufferMinutes);
        conflicts.push({
          date: req.date,
          startTime: req.startTime,
          endTime: req.endTime,
          conflictType: 'maintenance',
          conflictingId: m.id,
          conflictingTitle: `Maintenance: ${m.reason}`,
          message: `${hall.name} has a maintenance block (${m.startTime}–${m.endTime}) + ${hall.bufferMinutes}m buffer (available from ${clearedAt}): ${m.reason}.`,
          alternativeHalls: findAlternativeHalls(hallId, req.date, req.startTime, req.endTime, excludeBookingId),
        });
      }
    }

    // 3. Check equipment stock across all halls on that date
    for (const eqReq of equipmentRequests) {
      if (eqReq.quantity <= 0) continue;
      const item = db.equipment.find((e) => e.id === eqReq.equipmentId);
      if (!item) continue;
      let usedQty = 0;
      for (const b of db.bookings) {
        if (b.id === excludeBookingId) continue;
        if (['cancelled', 'expired', 'closed'].includes(b.status)) continue;
        const overlapsDate = b.sessions.some(
          (s) => s.status !== 'cancelled' && s.date === req.date && sessionsOverlap(req.startTime, req.endTime, s.startTime, s.endTime, 0)
        );
        if (overlapsDate) {
          const reserved = b.equipment.find((e) => e.equipmentId === eqReq.equipmentId);
          if (reserved) usedQty += reserved.quantity;
        }
      }
      if (usedQty + eqReq.quantity > item.totalStock) {
        conflicts.push({
          date: req.date,
          startTime: req.startTime,
          endTime: req.endTime,
          conflictType: 'equipment',
          conflictingId: item.id,
          conflictingTitle: item.name,
          message: `Insufficient ${item.name} stock on ${req.date}: ${Math.max(0, item.totalStock - usedQty)} available, ${eqReq.quantity} requested.`,
          alternativeHalls: [],
        });
      }
    }
  }

  return conflicts;
}

function findAlternativeHalls(
  excludeHallId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): { id: string; name: string }[] {
  return db.halls
    .filter((h) => h.active && h.id !== excludeHallId)
    .filter((h) => {
      const hasBookingClash = db.bookings.some(
        (b) =>
          b.id !== excludeBookingId &&
          !['cancelled', 'expired', 'closed'].includes(b.status) &&
          b.hallId === h.id &&
          b.sessions.some(
            (s) => s.status !== 'cancelled' && s.date === date && sessionsOverlap(startTime, endTime, s.startTime, s.endTime, h.bufferMinutes)
          )
      );
      const hasMaint = db.maintenanceBlocks.some(
        (m) => m.hallId === h.id && m.date === date && sessionsOverlap(startTime, endTime, m.startTime, m.endTime, h.bufferMinutes)
      );
      return !hasBookingClash && !hasMaint;
    })
    .map((h) => ({ id: h.id, name: h.name }));
}

function recalculateBookingTotals(booking: Booking): void {
  const hall = db.halls.find((h) => h.id === booking.hallId);
  const activeSessions = booking.sessions.filter((s) => s.status !== 'cancelled');
  const hallTotal = activeSessions.reduce((sum, s) => {
    if (!hall) return sum;
    const durationMins = toMinutes(s.endTime) - toMinutes(s.startTime);
    const rate = durationMins <= 360 ? hall.halfDayRate : hall.baseDayRate;
    return sum + rate;
  }, 0);

  const roomTotal = booking.roomLines.reduce((sum, rl) => {
    if (rl.officerDecision === 'dropped' || rl.verificationStatus === 'declined') return sum;
    const activeCount = rl.verificationStatus === 'partial' && rl.officerDecision === 'accepted' ? rl.verifiedCount : rl.count;
    const nights = Math.max(
      1,
      Math.round((new Date(rl.checkOutDate).getTime() - new Date(rl.checkInDate).getTime()) / (1000 * 60 * 60 * 24))
    );
    return sum + activeCount * nights * rl.ratePerNight;
  }, 0);

  const equipmentTotal = booking.equipment.reduce((sum, eq) => sum + eq.quantity * eq.unitRate, 0);
  const cateringTotal = !booking.catering
    ? 0
    : booking.catering.mode === 'external'
    ? Math.max(0, Number(booking.catering.stagingFee) || 0)
    : booking.catering.guests * booking.catering.pricePerHead;
  const addonTotal = booking.addons.reduce((sum, a) => sum + a.quantity * a.unitRate, 0);

  const subtotal = Math.max(0, hallTotal + roomTotal + equipmentTotal + cateringTotal + addonTotal + booking.extrasAmount - booking.discountAmount);
  const taxAmount = Math.round(subtotal * (db.profile.taxRatePercent / 100) * 100) / 100;
  const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;
  const depositRequired = Math.round(grandTotal * (db.profile.depositPercent / 100) * 100) / 100;

  booking.hallTotal = hallTotal;
  booking.roomTotal = roomTotal;
  booking.equipmentTotal = equipmentTotal;
  booking.cateringTotal = cateringTotal;
  booking.addonTotal = addonTotal;
  booking.taxAmount = taxAmount;
  booking.grandTotal = grandTotal;
  booking.depositRequired = depositRequired;
}

function notifyWaitlistForFreedHall(hallId: string, dates: string[]): number {
  let count = 0;
  for (const w of db.waitlist) {
    if (w.status === 'waiting' && w.hallId === hallId && dates.includes(w.desiredDate)) {
      w.status = 'notified';
      w.notifiedAt = new Date().toISOString();
      count++;
    }
  }
  return count;
}

function evaluateBookingReadyToHold(booking: Booking): void {
  const hasPendingRooms = booking.roomLines.some(
    (rl) => rl.verificationStatus === 'pending' || (rl.verificationStatus === 'partial' && rl.officerDecision === 'pending')
  );
  if (hasPendingRooms) {
    booking.status = 'awaiting_room_verification';
    return;
  }
  if (booking.requiresManagerApproval && !booking.managerApprovedBy) {
    booking.status = 'awaiting_manager_approval';
    return;
  }
  if (['awaiting_room_verification', 'awaiting_manager_approval'].includes(booking.status)) {
    booking.status = 'hold_proforma';
    const exp = new Date();
    exp.setHours(exp.getHours() + db.profile.defaultHoldHours);
    booking.holdExpiresAt = exp.toISOString();
  }
}

interface AuthedRequest extends express.Request {
  staffUser?: ServerStaffRecord;
}

const SESSION_COOKIE_NAME = 'hallbook_session';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

function setSessionCookie(res: express.Response, token: string): void {
  const encoded = encodeURIComponent(token);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encoded}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`
  );
}

function requireAuth(allowedRoles?: StaffRole[]): express.RequestHandler {
  return (req: AuthedRequest, res, next) => {
    const header = req.headers.authorization || '';
    let token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || token === 'cookie-session') {
      const cookies = parseCookies(req.headers.cookie);
      token = cookies[SESSION_COOKIE_NAME] || '';
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      res.status(401).json({ error: 'Authentication required. Please sign in.' });
      return;
    }
    const user = db.staff.find(
      (s) =>
        s.id === decoded.userId &&
        s.active &&
        !s.locked &&
        (s.approvalStatus ?? 'approved') === 'approved'
    );
    if (!user) {
      res.status(401).json({ error: 'Staff account is inactive, locked, or awaiting verification.' });
      return;
    }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      res.status(403).json({ error: `Access restricted: requires ${allowedRoles.join(' or ')} role.` });
      return;
    }
    req.staffUser = user;
    next();
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));

  // Auth status & bootstrap check (never exposes roles or staff list on login screen)
  app.get('/api/auth/status', (_req, res) => {
    const hasClaimed = db.initializedPasscode || db.staff.some((s) => Boolean(s.passwordHash));
    const needsBootstrap = !hasClaimed;
    const authMode = hasClaimed ? 'claimed_passcode' : 'needs_setup';
    res.json({
      needsBootstrap,
      authMode,
      hotelName: db.profile.hotelName,
    });
  });

  // One-time bootstrap claim: configures primary Manager or System Admin with their own personal password + Hotel Recovery Key
  app.post('/api/auth/bootstrap', (req, res) => {
    const hasClaimed = db.initializedPasscode || db.staff.some((s) => Boolean(s.passwordHash));
    if (hasClaimed) {
      res.status(400).json({ error: 'Hotel staff access is already initialized. Please sign in or use Forgot Password.' });
      return;
    }
    const { name, email, username, role, password, recoveryKey } = req.body as {
      name?: string;
      email?: string;
      username?: string;
      role?: 'manager' | 'sys_admin';
      password?: string;
      recoveryKey?: string;
    };
    if (!name?.trim()) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }
    if (!email?.trim() || !email.includes('@')) {
      res.status(400).json({ error: 'A valid work email address is required.' });
      return;
    }
    if (!username?.trim() || username.trim().length < 3) {
      res.status(400).json({ error: 'Username must be at least 3 characters.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Your password must be at least 6 characters.' });
      return;
    }
    if (!recoveryKey || recoveryKey.trim().length < 6) {
      res.status(400).json({ error: 'Hotel recovery key / phrase must be at least 6 characters.' });
      return;
    }

    const targetRole: StaffRole = role === 'sys_admin' ? 'sys_admin' : 'manager';
    const targetAccount =
      db.staff.find((s) => s.role === targetRole && s.active) || db.staff[0];

    const normalizedUsername = username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();
    const conflict = db.staff.find(
      (s) =>
        s.id !== targetAccount.id &&
        (s.username.toLowerCase() === normalizedUsername ||
          (s.email || '').toLowerCase() === normalizedEmail)
    );
    if (conflict) {
      res.status(400).json({ error: 'That email or username belongs to another staff slot.' });
      return;
    }

    targetAccount.name = name.trim();
    targetAccount.email = normalizedEmail;
    targetAccount.username = normalizedUsername;
    targetAccount.passwordHash = hashPassword(password);

    db.recoveryKeyHash = hashPassword(recoveryKey.trim());
    db.initializedPasscode = true;

    appendAudit(
      targetAccount,
      'SYSTEM_INITIALIZED',
      'system',
      'auth',
      'First-run Exclusive Serene Hotel setup',
      `${targetAccount.name} initialized HallBook access and set the hotel recovery key.`,
      true
    );
    saveDatabase();
    const token = signToken({ userId: targetAccount.id, role: targetAccount.role, exp: Date.now() + 1000 * 60 * 60 * 12 });
    const { passwordHash: _ph, ...safeUser } = targetAccount;
    setSessionCookie(res, token);
    res.json({ token, user: { ...safeUser, hasPassword: true } });
  });

  // Indoor self-registration (queued for Hotel Manager verification before sign-in is allowed)
  app.post('/api/auth/register', (req, res) => {
    const { name, email, username, role, password } = req.body as {
      name?: string;
      email?: string;
      username?: string;
      role?: StaffRole;
      password?: string;
    };
    if (!name?.trim() || name.trim().length < 2) {
      res.status(400).json({ error: 'Full name is required.' });
      return;
    }
    if (!email?.trim() || !email.includes('@')) {
      res.status(400).json({ error: 'A valid work email address is required.' });
      return;
    }
    if (!username?.trim() || username.trim().length < 3 || !/^[a-zA-Z0-9._-]+$/.test(username.trim())) {
      res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, dot, dash, underscore).' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const allowedSelfRoles: StaffRole[] = [
      'booking_officer',
      'cashier',
      'front_desk',
      'operations',
      'owner',
      'sys_admin',
    ];
    const requestedRole: StaffRole = allowedSelfRoles.includes(role as StaffRole)
      ? (role as StaffRole)
      : 'booking_officer';

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();
    if (
      db.staff.some(
        (s) =>
          s.username.toLowerCase() === cleanUsername ||
          (s.email || '').toLowerCase() === cleanEmail
      )
    ) {
      res.status(409).json({ error: 'That email or username is already registered in HallBook.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const pendingUser: ServerStaffRecord = {
      id: `stf-${Date.now()}`,
      name: name.trim(),
      email: cleanEmail,
      username: cleanUsername,
      role: requestedRole,
      active: false,
      approvalStatus: 'pending',
      approvedBy: null,
      approvedAt: null,
      locked: false,
      lockedReason: null,
      lockedAt: null,
      failedAttempts: 0,
      createdAt: nowIso,
      passwordHash: hashPassword(password),
    };

    db.staff.push(pendingUser);
    db.tasks.unshift({
      id: `tsk-ver-${Date.now()}`,
      assignedToId: db.staff.find((s) => s.role === 'manager' && s.active)?.id || null,
      roleTarget: 'manager',
      bookingId: pendingUser.id,
      type: 'account_verification',
      title: `Verify New Staff Account — ${pendingUser.name}`,
      description: `Indoor registration for @${pendingUser.username} requesting ${requestedRole.replace('_', ' ')} access.`,
      status: 'open',
      createdAt: nowIso,
    });
    appendAudit(
      pendingUser,
      'STAFF_REGISTRATION_REQUESTED',
      'staff',
      pendingUser.id,
      'Indoor staff self-registration awaiting Manager verification',
      `${pendingUser.name} (@${pendingUser.username}) requested ${requestedRole} access.`,
      true
    );
    saveDatabase();
    res.status(201).json({
      ok: true,
      message:
        'Account request submitted. Your access stays locked until the Hotel Manager verifies and activates your account in Setup & Audit.',
    });
  });

  // Staff login (Email or Username + personal password)
  app.post('/api/auth/login', (req, res) => {
    const { identifier, username, password } = req.body as {
      identifier?: string;
      username?: string;
      password?: string;
    };
    const loginId = (identifier || username || '').trim().toLowerCase();
    if (!loginId || !password) {
      res.status(400).json({ error: 'Email or username and password are required.' });
      return;
    }
    const user = db.staff.find(
      (s) =>
        s.username.toLowerCase() === loginId || (s.email || '').toLowerCase() === loginId
    );
    if (!user) {
      res.status(401).json({ error: 'Invalid email, username, or password.' });
      return;
    }
    if ((user.approvalStatus ?? 'approved') === 'pending') {
      res.status(403).json({
        error: 'Your account is awaiting verification by the Hotel Manager before you can sign in.',
      });
      return;
    }
    if ((user.approvalStatus ?? 'approved') === 'rejected') {
      res.status(403).json({
        error: 'This account registration request was declined by the Hotel Manager.',
      });
      return;
    }
    if (user.locked) {
      res.status(423).json({
        error: `Account locked${user.lockedReason ? `: ${user.lockedReason}` : ''}. Contact System Admin to unlock your account.`,
      });
      return;
    }
    if (!user.active) {
      res.status(403).json({
        error: 'This staff account has been deactivated. Contact the Hotel Manager.',
      });
      return;
    }
    if (!user.passwordHash) {
      res.status(401).json({
        error: 'A customized password has not been set for this account yet. Ask your System Admin to assign one in Setup & Audit.',
      });
      return;
    }
    if (!verifyPassword(password, user.passwordHash)) {
      user.failedAttempts = (user.failedAttempts || 0) + 1;
      if (user.failedAttempts >= 5) {
        user.locked = true;
        user.lockedAt = new Date().toISOString();
        user.lockedReason = '5 consecutive failed sign-in attempts';
        db.tasks.unshift({
          id: `tsk-lck-${Date.now()}`,
          assignedToId: db.staff.find((s) => s.role === 'sys_admin' && s.active)?.id || null,
          roleTarget: 'sys_admin',
          bookingId: user.id,
          type: 'account_locked',
          title: `Unlock Account — ${user.name} (@${user.username})`,
          description: 'Account auto-locked after 5 failed login attempts. Verify staff member and unlock in Setup.',
          status: 'open',
          createdAt: user.lockedAt,
        });
        appendAudit(
          user,
          'STAFF_ACCOUNT_LOCKED',
          'staff',
          user.id,
          user.lockedReason,
          `${user.name} (@${user.username}) locked after 5 failed password attempts; System Admin notified.`,
          true
        );
        saveDatabase();
        res.status(423).json({
          error: 'Account locked after 5 failed password attempts. Contact System Admin to unlock.',
        });
        return;
      }
      saveDatabase();
      res.status(401).json({
        error: `Invalid email, username, or password. (${5 - user.failedAttempts} attempt(s) remaining before lock)`,
      });
      return;
    }

    if (user.failedAttempts > 0) {
      user.failedAttempts = 0;
      saveDatabase();
    }
    const token = signToken({ userId: user.id, role: user.role, exp: Date.now() + 1000 * 60 * 60 * 12 });
    const { passwordHash: _ph, ...safeUser } = user;
    setSessionCookie(res, token);
    res.json({ token, user: { ...safeUser, hasPassword: true } });
  });

  app.post('/api/auth/logout', (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Forgot password reset (via hotel recovery key or one-time admin reset code)
  app.post('/api/auth/forgot-password/reset', (req, res) => {
    const { identifier, username, recoveryCode, newPassword } = req.body as {
      identifier?: string;
      username?: string;
      recoveryCode?: string;
      newPassword?: string;
    };
    const loginId = (identifier || username || '').trim().toLowerCase();
    if (!loginId || !recoveryCode?.trim() || !newPassword) {
      res.status(400).json({ error: 'Email/username, recovery key or reset code, and new password are required.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }
    const user = db.staff.find(
      (s) =>
        s.active &&
        (s.username.toLowerCase() === loginId || (s.email || '').toLowerCase() === loginId)
    );
    if (!user) {
      res.status(404).json({ error: 'No active staff account found for that email or username.' });
      return;
    }

    const code = recoveryCode.trim();
    const nowMs = Date.now();
    db.resetTokens = db.resetTokens.filter((t) => new Date(t.expiresAt).getTime() > nowMs);

    const matchingTokenIdx = db.resetTokens.findIndex(
      (t) => t.username.toLowerCase() === user.username.toLowerCase() && verifyPassword(code, t.codeHash)
    );
    const matchesHotelRecoveryKey = db.recoveryKeyHash ? verifyPassword(code, db.recoveryKeyHash) : false;

    if (matchingTokenIdx === -1 && !matchesHotelRecoveryKey) {
      res.status(401).json({ error: 'Invalid or expired recovery key / reset code.' });
      return;
    }

    if (matchingTokenIdx !== -1) {
      db.resetTokens.splice(matchingTokenIdx, 1);
    }

    user.passwordHash = hashPassword(newPassword);
    appendAudit(
      user,
      'PASSWORD_RESET_COMPLETED',
      'staff',
      user.id,
      matchesHotelRecoveryKey ? 'Reset via hotel recovery key' : 'Reset via one-time admin reset code',
      `Password updated for ${user.name} (${user.username}).`,
      true
    );
    saveDatabase();
    res.json({ ok: true, message: `Password updated for ${user.name}. You can now sign in.` });
  });

  // Self-service password change for signed-in staff
  app.post('/api/auth/change-password', requireAuth(), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (!currentPassword || !newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Current password and a new password (min 6 chars) are required.' });
      return;
    }
    if (!actor.passwordHash || !verifyPassword(currentPassword, actor.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
    actor.passwordHash = hashPassword(newPassword);
    appendAudit(actor, 'STAFF_PASSWORD_CHANGED', 'staff', actor.id, 'Self-service password update', `${actor.name} updated their password.`, false);
    saveDatabase();
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth(), (req: AuthedRequest, res) => {
    const { passwordHash, ...safeUser } = req.staffUser!;
    res.json({ user: { ...safeUser, hasPassword: Boolean(passwordHash) } });
  });

  // Role-scoped workspace state
  app.get('/api/state', requireAuth(), (req: AuthedRequest, res) => {
    res.json(sanitizeClientResponse(db, req.staffUser));
  });

  // Conflict check endpoint
  app.post('/api/bookings/check-conflicts', requireAuth(), (req, res) => {
    const { hallId, sessions, equipment, excludeBookingId } = req.body as {
      hallId: string;
      sessions: { date: string; startTime: string; endTime: string }[];
      equipment: { equipmentId: string; quantity: number }[];
      excludeBookingId?: string;
    };
    const conflicts = computeConflicts(hallId, sessions || [], equipment || [], excludeBookingId);
    res.json({ conflicts });
  });

  // Create booking
  app.post(
    '/api/bookings',
    requireAuth(['manager', 'booking_officer']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const body = req.body as {
        clientId?: string;
        newClient?: { name: string; phone: string; email: string; organization: string };
        hallId: string;
        eventTitle: string;
        eventType: Booking['eventType'];
        bookingMode: Booking['bookingMode'];
        repeatRule: Booking['repeatRule'];
        sessions: { date: string; startTime: string; endTime: string; layout: HallLayout; expectedGuests: number }[];
        roomLines: { roomType: string; count: number; checkInDate: string; checkOutDate: string; ratePerNight: number }[];
        equipment: { equipmentId: string; quantity: number }[];
        catering: {
          mode?: 'hotel' | 'external';
          packageId?: string;
          guests?: number;
          stagingFee?: number;
          externalCatererName?: string;
          externalCatererContact?: string;
          serviceTime?: string;
          dietaryNotes?: string;
        } | null;
        addons: { addonId: string; quantity: number }[];
        discountAmount?: number;
        discountReason?: string;
        eventNotes?: string;
        operationsBrief?: string;
        skipConflictingDates?: boolean;
      };

      if (!body.hallId || !body.eventTitle || !body.sessions?.length) {
        res.status(400).json({ error: 'Hall, event title, and at least one session are required.' });
        return;
      }

      // Resolve or create client with phone duplicate check
      let client = body.clientId ? db.clients.find((c) => c.id === body.clientId) : undefined;
      if (!client && body.newClient) {
        const normalizedPhone = body.newClient.phone.replace(/\s+/g, '').trim();
        client = db.clients.find((c) => c.phone.replace(/\s+/g, '').trim() === normalizedPhone);
        if (!client) {
          client = {
            id: `cli-${Date.now()}`,
            name: body.newClient.name.trim(),
            phone: body.newClient.phone.trim(),
            email: body.newClient.email.trim(),
            organization: body.newClient.organization.trim(),
            overdueFlag: false,
            overdueNotes: '',
            createdAt: new Date().toISOString(),
          };
          db.clients.push(client);
        }
      }
      if (!client) {
        res.status(400).json({ error: 'Valid client selection or new client details required.' });
        return;
      }

      // Conflict check
      const conflicts = computeConflicts(body.hallId, body.sessions, body.equipment || []);
      let finalSessions = body.sessions;
      if (conflicts.length > 0) {
        if (body.skipConflictingDates) {
          const conflictDates = new Set(conflicts.map((c) => c.date));
          finalSessions = body.sessions.filter((s) => !conflictDates.has(s.date));
          if (finalSessions.length === 0) {
            res.status(409).json({ error: 'All selected dates have conflicts.', conflicts });
            return;
          }
        } else {
          res.status(409).json({ error: 'Schedule or equipment conflict detected.', conflicts });
          return;
        }
      }

      db.bookingCounter += 1;
      const bookingId = `HB-2026-0${db.bookingCounter}`;
      const nowIso = new Date().toISOString();

      const mappedSessions: BookingSession[] = finalSessions.map((s, idx) => ({
        id: `ses-${db.bookingCounter}-${idx + 1}`,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        layout: s.layout,
        expectedGuests: Number(s.expectedGuests) || 50,
        status: 'active',
      }));

      const mappedRooms: RoomLine[] = (body.roomLines || []).map((rl, idx) => ({
        id: `rl-${db.bookingCounter}-${idx + 1}`,
        roomType: rl.roomType,
        count: Number(rl.count) || 1,
        checkInDate: rl.checkInDate,
        checkOutDate: rl.checkOutDate,
        ratePerNight: Number(rl.ratePerNight) || 150,
        verificationStatus: 'pending',
        verifiedCount: 0,
        verifiedBy: null,
        verifiedAt: null,
        officerDecision: 'pending',
        frontDeskHotelRef: '',
        allocationNotes: '',
      }));

      const mappedEquipment = (body.equipment || [])
        .filter((e) => e.quantity > 0)
        .map((e) => {
          const item = db.equipment.find((x) => x.id === e.equipmentId)!;
          return {
            equipmentId: item.id,
            name: item.name,
            quantity: Number(e.quantity),
            unitRate: item.unitRate,
            returnedQty: null,
            damagedQty: 0,
            damageFee: 0,
          };
        });

      let mappedCatering: Booking['catering'] = null;
      if (body.catering) {
        if (body.catering.mode === 'external') {
          mappedCatering = {
            mode: 'external',
            packageId: 'external',
            name: body.catering.externalCatererName?.trim() || 'Client-Organized External Caterer',
            guests: Number(body.catering.guests) || mappedSessions[0]?.expectedGuests || 50,
            pricePerHead: 0,
            stagingFee: Math.max(0, Number(body.catering.stagingFee) || 0),
            externalCatererName: body.catering.externalCatererName?.trim() || 'Client-Organized Caterer',
            externalCatererContact: body.catering.externalCatererContact?.trim() || '',
            serviceTime: body.catering.serviceTime || '13:00',
            dietaryNotes: body.catering.dietaryNotes || '',
            kitchenStatus: 'planned',
          };
        } else {
          const cateringPkg = db.cateringPackages.find((c) => c.id === body.catering?.packageId);
          if (cateringPkg) {
            mappedCatering = {
              mode: 'hotel',
              packageId: cateringPkg.id,
              name: cateringPkg.name,
              guests: Number(body.catering.guests) || 50,
              pricePerHead: cateringPkg.pricePerHead,
              serviceTime: body.catering.serviceTime || '13:00',
              dietaryNotes: body.catering.dietaryNotes || '',
              kitchenStatus: 'planned',
            };
          }
        }
      }

      const mappedAddons = (body.addons || [])
        .filter((a) => a.quantity > 0)
        .map((a) => {
          const item = db.addons.find((x) => x.id === a.addonId)!;
          return {
            addonId: item.id,
            name: item.name,
            quantity: Number(a.quantity),
            unitRate: item.unitRate,
          };
        });

      const totalRoomsRequested = mappedRooms.reduce((sum, r) => sum + r.count, 0);
      const discountRequested = Number(body.discountAmount) || 0;
      const requiresApproval =
        mappedSessions.length > db.profile.largeBookingDayThreshold ||
        totalRoomsRequested > db.profile.largeBookingRoomThreshold ||
        client.overdueFlag ||
        discountRequested > 0;

      const lastSessionDate = mappedSessions[mappedSessions.length - 1]?.date || nowIso.slice(0, 10);
      const dueDateObj = new Date(lastSessionDate);
      dueDateObj.setDate(dueDateObj.getDate() + 7);

      const newBooking: Booking = {
        id: bookingId,
        clientId: client.id,
        hallId: body.hallId,
        eventTitle: body.eventTitle.trim(),
        eventType: body.eventType,
        bookingMode: body.bookingMode,
        repeatRule: body.repeatRule,
        sessions: mappedSessions,
        roomLines: mappedRooms,
        equipment: mappedEquipment,
        catering: mappedCatering,
        addons: mappedAddons,
        guests: [],
        status: 'hold_proforma',
        holdExpiresAt: null,
        requiresManagerApproval: requiresApproval,
        managerApprovedBy: null,
        managerApprovedAt: null,
        discountAmount: discountRequested,
        discountReason: body.discountReason || '',
        extrasAmount: 0,
        extrasNotes: '',
        hallTotal: 0,
        roomTotal: 0,
        equipmentTotal: 0,
        cateringTotal: 0,
        addonTotal: 0,
        taxAmount: 0,
        grandTotal: 0,
        depositRequired: 0,
        finalDueDate: dueDateObj.toISOString().slice(0, 10),
        createdBy: actor.name,
        assignedOfficerId: actor.id,
        createdAt: nowIso,
        updatedAt: nowIso,
        amendments: [],
        cancellationReason: null,
        suggestedRefund: 0,
        eventNotes: body.eventNotes || '',
        operationsBrief: body.operationsBrief || '',
      };

      recalculateBookingTotals(newBooking);

      if (mappedRooms.length > 0) {
        newBooking.status = 'awaiting_room_verification';
        db.tasks.unshift({
          id: `tsk-${Date.now()}-fd`,
          assignedToId: db.staff.find((s) => s.role === 'front_desk' && s.active)?.id || null,
          roleTarget: 'front_desk',
          bookingId: newBooking.id,
          type: 'room_verification',
          title: `Verify ${totalRoomsRequested} Rooms — ${newBooking.eventTitle}`,
          description: `Check room block availability across ${mappedRooms.length} line(s).`,
          status: 'open',
          createdAt: nowIso,
        });
      } else if (requiresApproval) {
        newBooking.status = 'awaiting_manager_approval';
      } else {
        const exp = new Date();
        exp.setHours(exp.getHours() + db.profile.defaultHoldHours);
        newBooking.holdExpiresAt = exp.toISOString();
      }

      if (requiresApproval) {
        db.tasks.unshift({
          id: `tsk-${Date.now()}-mgr`,
          assignedToId: db.staff.find((s) => s.role === 'manager' && s.active)?.id || null,
          roleTarget: 'manager',
          bookingId: newBooking.id,
          type: 'manager_approval',
          title: `Approval Needed — ${newBooking.eventTitle}`,
          description: client.overdueFlag
            ? 'Client has an overdue flag requiring manager clearance.'
            : 'Exceeds large-booking threshold or includes discount.',
          status: 'open',
          createdAt: nowIso,
        });
      }

      db.bookings.unshift(newBooking);
      appendAudit(
        actor,
        'BOOKING_CREATED',
        'booking',
        newBooking.id,
        'New event booking created',
        `${newBooking.eventTitle} (${mappedSessions.length} session(s), ${fmtMoney(newBooking.grandTotal)})`,
        requiresApproval
      );
      saveDatabase();
      res.status(201).json({ booking: newBooking, state: sanitizeClientResponse(db, actor) });
    }
  );

  // Front Desk verifies room line count AND nightly room rate
  app.post(
    '/api/bookings/:id/rooms/:roomLineId/verify',
    requireAuth(['front_desk', 'manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const booking = db.bookings.find((b) => b.id === req.params.id);
      if (!booking) {
        res.status(404).json({ error: 'Booking not found.' });
        return;
      }
      const line = booking.roomLines.find((r) => r.id === req.params.roomLineId);
      if (!line) {
        res.status(404).json({ error: 'Room line not found.' });
        return;
      }
      const { verificationStatus, verifiedCount, ratePerNight, allocationNotes } = req.body as {
        verificationStatus: 'full' | 'partial' | 'declined';
        verifiedCount?: number;
        ratePerNight?: number;
        allocationNotes?: string;
      };
      if (!['full', 'partial', 'declined'].includes(verificationStatus)) {
        res.status(400).json({ error: 'Invalid room verification status.' });
        return;
      }
      if (ratePerNight !== undefined) {
        const numericRate = Number(ratePerNight);
        if (!Number.isFinite(numericRate) || numericRate <= 0) {
          res.status(400).json({ error: 'Room nightly rate must be a positive amount.' });
          return;
        }
        line.ratePerNight = Math.round(numericRate);
      }
      if (verificationStatus === 'partial') {
        const partial = Math.round(Number(verifiedCount) || 0);
        if (partial < 1 || partial >= line.count) {
          res.status(400).json({ error: `Partial count must be between 1 and ${Math.max(1, line.count - 1)} rooms.` });
          return;
        }
        line.verifiedCount = partial;
      } else {
        line.verifiedCount = verificationStatus === 'full' ? line.count : 0;
      }
      line.verificationStatus = verificationStatus;
      line.verifiedBy = actor.name;
      line.verifiedAt = new Date().toISOString();
      if (allocationNotes !== undefined) line.allocationNotes = allocationNotes.trim();
      if (verificationStatus === 'full' || verificationStatus === 'declined') {
        line.officerDecision = verificationStatus === 'full' ? 'accepted' : 'dropped';
      } else {
        line.officerDecision = 'pending';
      }

      recalculateBookingTotals(booking);
      evaluateBookingReadyToHold(booking);
      booking.updatedAt = new Date().toISOString();

      // Close open room verification task if all lines verified
      if (booking.roomLines.every((r) => r.verificationStatus !== 'pending')) {
        for (const t of db.tasks) {
          if (t.bookingId === booking.id && t.type === 'room_verification') t.status = 'done';
        }
      }

      appendAudit(
        actor,
        'ROOM_LINE_VERIFIED',
        'booking',
        booking.id,
        `Room line marked ${verificationStatus}`,
        `${line.roomType}: verified ${line.verifiedCount}/${line.count} rooms @ ${fmtMoney(line.ratePerNight)}/night by ${actor.name}.`,
        false
      );
      saveDatabase();
      res.json({ state: sanitizeClientResponse(db, actor) });
    }
  );

  // Booking Officer resolves partial room line (accept reduced count or drop rooms)
  app.post(
    '/api/bookings/:id/rooms/:roomLineId/decision',
    requireAuth(['booking_officer', 'manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const booking = db.bookings.find((b) => b.id === req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });
      const line = booking.roomLines.find((r) => r.id === req.params.roomLineId);
      if (!line) return res.status(404).json({ error: 'Room line not found.' });

      const { decision } = req.body as { decision: 'accepted' | 'dropped' };
      line.officerDecision = decision;
      recalculateBookingTotals(booking);
      evaluateBookingReadyToHold(booking);
      booking.updatedAt = new Date().toISOString();

      appendAudit(
        actor,
        'PARTIAL_ROOMS_RESOLVED',
        'booking',
        booking.id,
        `Booking officer ${decision} partial rooms`,
        `${line.roomType} (${line.verifiedCount} rooms) ${decision}.`,
        false
      );
      saveDatabase();
      res.json({ state: sanitizeClientResponse(db, actor) });
    }
  );

  // Front Desk allocates hotel reference after booking locks
  app.post(
    '/api/bookings/:id/rooms/:roomLineId/allocate',
    requireAuth(['front_desk', 'manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const booking = db.bookings.find((b) => b.id === req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });
      const line = booking.roomLines.find((r) => r.id === req.params.roomLineId);
      if (!line) return res.status(404).json({ error: 'Room line not found.' });

      const { frontDeskHotelRef, allocationNotes } = req.body as {
        frontDeskHotelRef: string;
        allocationNotes?: string;
      };
      if (!frontDeskHotelRef?.trim()) return res.status(400).json({ error: 'Hotel PMS reference is required.' });
      line.frontDeskHotelRef = frontDeskHotelRef.trim();
      if (allocationNotes !== undefined) line.allocationNotes = allocationNotes;
      booking.updatedAt = new Date().toISOString();

      appendAudit(
        actor,
        'ROOM_ALLOCATION_RECORDED',
        'booking',
        booking.id,
        'Front desk room block reference assigned',
        `${line.roomType} allocated under hotel ref ${line.frontDeskHotelRef}.`,
        false
      );
      saveDatabase();
      res.json({ state: sanitizeClientResponse(db, actor) });
    }
  );

  // Manager approves large / flagged booking
  app.post(
    '/api/bookings/:id/approve',
    requireAuth(['manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const booking = db.bookings.find((b) => b.id === req.params.id);
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });

      const { reason } = req.body as { reason?: string };
      booking.managerApprovedBy = actor.name;
      booking.managerApprovedAt = new Date().toISOString();
      evaluateBookingReadyToHold(booking);
      booking.updatedAt = new Date().toISOString();

      for (const t of db.tasks) {
        if (t.bookingId === booking.id && t.type === 'manager_approval') t.status = 'done';
      }

      appendAudit(
        actor,
        'MANAGER_APPROVED_BOOKING',
        'booking',
        booking.id,
        reason || 'Large / flagged booking approved',
        `Approved by Manager ${actor.name}. Status: ${booking.status}.`,
        true
      );
      saveDatabase();
      res.json({ state: sanitizeClientResponse(db, actor) });
    }
  );

  // Record payment (Cashier or Manager)
  app.post(
    '/api/payments',
    requireAuth(['cashier', 'manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const { bookingId, amount, method, reference, proofNote, proofImageUrl, managerOverrideOverpayment, overrideReason } = req.body as {
        bookingId: string;
        amount: number;
        method: PaymentRecord['method'];
        reference: string;
        proofNote: string;
        proofImageUrl?: string;
        managerOverrideOverpayment?: boolean;
        overrideReason?: string;
      };

      const booking = db.bookings.find((b) => b.id === bookingId);
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });
      if (['cancelled', 'expired'].includes(booking.status)) {
        return res.status(400).json({ error: 'Cannot record payments on cancelled or expired bookings.' });
      }
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return res.status(400).json({ error: 'Payment amount must be greater than zero.' });
      }

      let safeProofImageUrl: string | null = null;
      if (typeof proofImageUrl === 'string' && proofImageUrl.trim()) {
        const trimmedImg = proofImageUrl.trim();
        if (
          /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(trimmedImg) &&
          trimmedImg.length <= 2_500_000
        ) {
          safeProofImageUrl = trimmedImg;
        } else {
          return res.status(400).json({ error: 'Proof attachment must be a valid JPEG/PNG/WebP image under 2MB.' });
        }
      }

      const paidSoFar = getVerifiedPaidForBooking(bookingId) +
        db.payments
          .filter((p) => p.bookingId === bookingId && p.status === 'pending_verification')
          .reduce((sum, p) => sum + p.amount, 0);
      const balanceRemaining = Math.max(0, Math.round((booking.grandTotal - paidSoFar) * 100) / 100);

      if (numericAmount > balanceRemaining + 0.01) {
        if (!(actor.role === 'manager' && managerOverrideOverpayment && overrideReason?.trim())) {
          return res.status(400).json({
            error: `Overpayment blocked: amount (${fmtMoney(numericAmount)}) exceeds remaining balance (${fmtMoney(balanceRemaining)}). Manager override with reason required.`,
          });
        }
      }

      const openShift = db.shifts.find((s) => s.status === 'open');
      const payment: PaymentRecord = {
        id: `pay-${Date.now()}`,
        bookingId,
        amount: Math.round(numericAmount * 100) / 100,
        method,
        reference: reference.trim(),
        proofNote: proofNote.trim(),
        recordedBy: actor.name,
        recordedAt: new Date().toISOString(),
        status: 'pending_verification',
        verifiedBy: null,
        verifiedAt: null,
        receiptNumber: null,
        reprintCount: 0,
        voidedBy: null,
        voidedAt: null,
        voidReason: null,
        shiftId: openShift?.id || null,
        managerOverrideOverpayment: Boolean(managerOverrideOverpayment),
        overrideReason: overrideReason?.trim() || null,
        proofImageUrl: safeProofImageUrl,
      };

      db.payments.unshift(payment);
      appendAudit(
        actor,
        'PAYMENT_RECORDED',
        'payment',
        payment.id,
        overrideReason?.trim() || 'Payment logged awaiting bank/POS verification',
        `${method} ${fmtMoney(payment.amount)} (${payment.reference}) for ${bookingId}`,
        Boolean(managerOverrideOverpayment)
      );
      saveDatabase();
      res.status(201).json({ payment, state: sanitizeClientResponse(db, actor) });
    }
  );

  // Verify payment & issue sequential receipt + lock booking if >= deposit
  app.post(
    '/api/payments/:id/verify',
    requireAuth(['cashier', 'manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const payment = db.payments.find((p) => p.id === req.params.id);
      if (!payment) return res.status(404).json({ error: 'Payment record not found.' });
      if (payment.status !== 'pending_verification') {
        return res.status(400).json({ error: 'Only pending payments can be verified.' });
      }
      const booking = db.bookings.find((b) => b.id === payment.bookingId);
      if (!booking) return res.status(404).json({ error: 'Booking not found.' });

      db.receiptCounter += 1;
      const padded = String(db.receiptCounter).padStart(4, '0');
      payment.status = 'verified';
      payment.verifiedBy = actor.name;
      payment.verifiedAt = new Date().toISOString();
      payment.receiptNumber = `RCT-2026-${padded}`;

      const verifiedTotal = getVerifiedPaidForBooking(booking.id);
      if (booking.status === 'hold_proforma' && verifiedTotal >= booking.depositRequired) {
        booking.status = 'locked';
        booking.holdExpiresAt = null;
      }
      if (booking.status === 'event_completed' && verifiedTotal >= booking.grandTotal - 0.01) {
        booking.status = 'closed';
        for (const t of db.tasks) {
          if (t.bookingId === booking.id && t.type === 'overdue_collection') t.status = 'done';
        }
      }
      booking.updatedAt = new Date().toISOString();

      appendAudit(
        actor,
        'PAYMENT_VERIFIED',
        'payment',
        payment.id,
        'Bank/POS credit verified',
        `Receipt ${payment.receiptNumber} issued for ${fmtMoney(payment.amount)} on ${booking.id}. Booking status: ${booking.status}.`,
        false
      );
      saveDatabase();
      res.json({ payment, state: sanitizeClientResponse(db, actor) });
    }
  );

  // Void payment (Manager only, mandatory reason)
  app.post(
    '/api/payments/:id/void',
    requireAuth(['manager']),
    (req: AuthedRequest, res) => {
      const actor = req.staffUser!;
      const payment = db.payments.find((p) => p.id === req.params.id);
      if (!payment) return res.status(404).json({ error: 'Payment not found.' });
      if (payment.status === 'voided') return res.status(400).json({ error: 'Payment already voided.' });
      const { reason } = req.body as { reason?: string };
      if (!reason?.trim()) return res.status(400).json({ error: 'Mandatory void reason required.' });

      payment.status = 'voided';
      payment.voidedBy = actor.name;
      payment.voidedAt = new Date().toISOString();
      payment.voidReason = reason.trim();

      appendAudit(
        actor,
        'PAYMENT_VOIDED',
        'payment',
        payment.id,
        reason.trim(),
        `Voided ${payment.receiptNumber || payment.id} (${fmtMoney(payment.amount)}) on ${payment.bookingId}.`,
        true
      );
      saveDatabase();
      res.json({ state: sanitizeClientResponse(db, actor) });
    }
  );

  // Reprint receipt (Cashier / Manager / Owner only; increments reprintCount so UI marks DUPLICATE)
  app.post('/api/payments/:id/reprint', requireAuth(['cashier', 'manager', 'owner']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const payment = db.payments.find((p) => p.id === req.params.id);
    if (!payment || !payment.receiptNumber) return res.status(404).json({ error: 'Verified receipt not found.' });
    payment.reprintCount += 1;
    saveDatabase();
    res.json({ payment, state: sanitizeClientResponse(db, actor) });
  });

  // Cashier Shifts Open & Close (Cash-up reconciliation)
  app.post('/api/shifts/open', requireAuth(['cashier', 'manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const existing = db.shifts.find((s) => s.status === 'open');
    if (existing) return res.status(400).json({ error: `Shift ${existing.id} is already open (${existing.cashierName}).` });
    const { openingFloat } = req.body as { openingFloat: number };
    const shift = {
      id: `shf-${String(db.shifts.length + 1).padStart(3, '0')}`,
      cashierId: actor.id,
      cashierName: actor.name,
      openedAt: new Date().toISOString(),
      closedAt: null,
      openingFloat: Number(openingFloat) || 0,
      declaredCash: null,
      status: 'open' as const,
    };
    db.shifts.unshift(shift);
    appendAudit(actor, 'CASHIER_SHIFT_OPENED', 'shift', shift.id, 'Shift started', `Opening float ${fmtMoney(shift.openingFloat)}`, false);
    saveDatabase();
    res.json({ shift, state: sanitizeClientResponse(db, actor) });
  });

  app.post('/api/shifts/:id/close', requireAuth(['cashier', 'manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const shift = db.shifts.find((s) => s.id === req.params.id);
    if (!shift || shift.status === 'closed') return res.status(400).json({ error: 'Open shift not found.' });
    const { declaredCash } = req.body as { declaredCash: number };
    shift.declaredCash = Number(declaredCash) || 0;
    shift.closedAt = new Date().toISOString();
    shift.status = 'closed';
    appendAudit(actor, 'CASHIER_SHIFT_CLOSED', 'shift', shift.id, 'Cash-up reconciliation submitted', `Declared cash ${fmtMoney(shift.declaredCash)}`, false);
    saveDatabase();
    res.json({ shift, state: sanitizeClientResponse(db, actor) });
  });

  // Guest List Management & Check-in
  app.post('/api/bookings/:id/guests', requireAuth(['manager', 'booking_officer', 'operations']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const { fullName, groupTag, tableLabel, dietaryNote, phone } = req.body as {
      fullName: string;
      groupTag: 'VIP' | 'Family' | 'Speaker' | 'General' | 'Vendor';
      tableLabel: string;
      dietaryNote: string;
      phone: string;
    };
    if (!fullName?.trim()) return res.status(400).json({ error: 'Guest full name is required.' });
    booking.guests.push({
      id: `gst-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      fullName: fullName.trim(),
      groupTag: groupTag || 'General',
      tableLabel: tableLabel?.trim() || 'Unassigned',
      dietaryNote: dietaryNote?.trim() || '',
      phone: phone?.trim() || '',
      checkedIn: false,
      checkedInAt: null,
    });
    booking.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Bulk Guest List Import (CSV / pasted roster)
  app.post('/api/bookings/:id/guests/bulk', requireAuth(['manager', 'booking_officer', 'operations']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const { guests } = req.body as {
      guests: {
        fullName?: string;
        groupTag?: 'VIP' | 'Family' | 'Speaker' | 'General' | 'Vendor';
        tableLabel?: string;
        dietaryNote?: string;
        phone?: string;
      }[];
    };
    if (!Array.isArray(guests) || guests.length === 0) {
      return res.status(400).json({ error: 'Provide at least one guest row to import.' });
    }
    const allowedTags = new Set(['VIP', 'Family', 'Speaker', 'General', 'Vendor']);
    const existingKeys = new Set(
      booking.guests.map((g) => `${g.fullName.toLowerCase()}|${g.phone.toLowerCase()}`)
    );
    let added = 0;
    const baseTs = Date.now();
    for (const row of guests.slice(0, 500)) {
      const cleanName = (row.fullName || '').trim();
      if (!cleanName) continue;
      const cleanPhone = (row.phone || '').trim();
      const dedupeKey = `${cleanName.toLowerCase()}|${cleanPhone.toLowerCase()}`;
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);
      added++;
      booking.guests.push({
        id: `gst-${baseTs}-${added}-${Math.floor(Math.random() * 100)}`,
        fullName: cleanName.slice(0, 120),
        groupTag: allowedTags.has(row.groupTag || '') ? (row.groupTag as 'VIP' | 'Family' | 'Speaker' | 'General' | 'Vendor') : 'General',
        tableLabel: (row.tableLabel || '').trim().slice(0, 60) || 'Unassigned',
        dietaryNote: (row.dietaryNote || '').trim().slice(0, 120),
        phone: cleanPhone.slice(0, 40),
        checkedIn: false,
        checkedInAt: null,
      });
    }
    if (added === 0) {
      return res.status(400).json({ error: 'No new guests found in import (all empty or duplicates).' });
    }
    booking.updatedAt = new Date().toISOString();
    appendAudit(
      actor,
      'GUEST_LIST_BULK_IMPORTED',
      'booking',
      booking.id,
      'Bulk guest roster import',
      `Imported ${added} guest(s) onto ${booking.eventTitle}.`,
      false
    );
    saveDatabase();
    res.json({ addedCount: added, state: sanitizeClientResponse(db, actor) });
  });

  app.post('/api/bookings/:id/guests/:guestId/checkin', requireAuth(['manager', 'booking_officer', 'operations', 'front_desk']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const guest = booking.guests.find((g) => g.id === req.params.guestId);
    if (!guest) return res.status(404).json({ error: 'Guest not found.' });
    guest.checkedIn = !guest.checkedIn;
    guest.checkedInAt = guest.checkedIn ? new Date().toISOString() : null;
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Catering kitchen status update
  app.post('/api/bookings/:id/catering/status', requireAuth(['manager', 'operations', 'booking_officer']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking || !booking.catering) return res.status(404).json({ error: 'Catering order not found.' });
    const { kitchenStatus } = req.body as { kitchenStatus: 'planned' | 'confirmed' | 'in_prep' | 'served' };
    booking.catering.kitchenStatus = kitchenStatus;
    booking.updatedAt = new Date().toISOString();
    appendAudit(actor, 'CATERING_STATUS_UPDATED', 'booking', booking.id, 'Kitchen coordination updated', `${booking.catering.name} marked ${kitchenStatus}.`, false);
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Post-event completion & equipment return/damage settlement
  app.post('/api/bookings/:id/complete', requireAuth(['manager', 'operations', 'booking_officer']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const { equipmentReturns, extrasAmount, extrasNotes } = req.body as {
      equipmentReturns: { equipmentId: string; returnedQty: number; damagedQty: number; damageFee: number }[];
      extrasAmount: number;
      extrasNotes: string;
    };

    let damageSum = 0;
    for (const ret of equipmentReturns || []) {
      const eq = booking.equipment.find((e) => e.equipmentId === ret.equipmentId);
      if (eq) {
        eq.returnedQty = Number(ret.returnedQty);
        eq.damagedQty = Number(ret.damagedQty) || 0;
        eq.damageFee = Number(ret.damageFee) || 0;
        damageSum += eq.damageFee;
      }
    }

    booking.extrasAmount = Math.max(0, Number(extrasAmount) || 0) + damageSum;
    booking.extrasNotes = extrasNotes?.trim() || (damageSum > 0 ? 'Post-event equipment damage fee applied' : '');
    for (const s of booking.sessions) {
      if (s.status === 'active') s.status = 'completed';
    }
    recalculateBookingTotals(booking);

    const paid = getVerifiedPaidForBooking(booking.id);
    booking.status = paid >= booking.grandTotal - 0.01 ? 'closed' : 'event_completed';
    booking.updatedAt = new Date().toISOString();

    appendAudit(
      actor,
      'EVENT_COMPLETED_AND_SETTLED',
      'booking',
      booking.id,
      'Post-event equipment inspection & final invoice',
      `Extras/damages: ${fmtMoney(booking.extrasAmount)}. New grand total: ${fmtMoney(booking.grandTotal)}. Status: ${booking.status}.`,
      damageSum > 0
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Manager Amendment on Locked Booking
  app.post('/api/bookings/:id/amend', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const { reason, discountAmount, hallId, newDate, startTime, endTime } = req.body as {
      reason: string;
      discountAmount?: number;
      hallId?: string;
      newDate?: string;
      startTime?: string;
      endTime?: string;
    };
    if (!reason?.trim()) return res.status(400).json({ error: 'Mandatory reason required for amendment.' });

    const targetHall = hallId || booking.hallId;
    if (newDate && booking.sessions[0]) {
      const testSessions = [{ date: newDate, startTime: startTime || booking.sessions[0].startTime, endTime: endTime || booking.sessions[0].endTime }];
      const conflicts = computeConflicts(targetHall, testSessions, [], booking.id);
      if (conflicts.length > 0) {
        return res.status(409).json({ error: 'Reschedule/hall change conflicts with existing schedule.', conflicts });
      }
      booking.sessions[0].date = newDate;
      if (startTime) booking.sessions[0].startTime = startTime;
      if (endTime) booking.sessions[0].endTime = endTime;
    }
    booking.hallId = targetHall;
    if (discountAmount !== undefined) booking.discountAmount = Number(discountAmount) || 0;
    recalculateBookingTotals(booking);
    booking.updatedAt = new Date().toISOString();

    const summary = `Hall: ${db.halls.find((h) => h.id === booking.hallId)?.name}, First Session: ${booking.sessions[0]?.date}, Total: ${fmtMoney(booking.grandTotal)}`;
    booking.amendments.unshift({
      id: `amd-${Date.now()}`,
      timestamp: new Date().toISOString(),
      approvedBy: actor.name,
      reason: reason.trim(),
      summary,
    });

    appendAudit(actor, 'BOOKING_AMENDED', 'booking', booking.id, reason.trim(), summary, true);
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Cancel booking (Manager only, mandatory reason, suggests refund from policy, frees hall/rooms/equipment, notifies waitlist)
  app.post('/api/bookings/:id/cancel', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const booking = db.bookings.find((b) => b.id === req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const { reason, sessionId, issueRefundVoucher, refundMethod } = req.body as {
      reason: string;
      sessionId?: string;
      issueRefundVoucher?: boolean;
      refundMethod?: 'Bank Transfer' | 'Cash' | 'Cheque';
    };
    if (!reason?.trim()) return res.status(400).json({ error: 'Mandatory cancellation reason required.' });

    const paid = getVerifiedPaidForBooking(booking.id);
    const firstDate = booking.sessions[0]?.date || new Date().toISOString().slice(0, 10);
    const daysUntil = Math.max(0, Math.round((new Date(firstDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const tier = [...db.profile.cancellationPolicy]
      .sort((a, b) => b.daysBefore - a.daysBefore)
      .find((t) => daysUntil >= t.daysBefore) || { refundPercent: 0 };

    if (sessionId) {
      const ses = booking.sessions.find((s) => s.id === sessionId);
      if (!ses) return res.status(404).json({ error: 'Session not found.' });
      ses.status = 'cancelled';
      recalculateBookingTotals(booking);
      notifyWaitlistForFreedHall(booking.hallId, [ses.date]);
      appendAudit(actor, 'SESSION_CANCELLED', 'booking', booking.id, reason.trim(), `Cancelled session ${ses.date} (${ses.startTime}-${ses.endTime}).`, true);
    } else {
      booking.status = 'cancelled';
      booking.cancellationReason = reason.trim();
      const suggestedRefund = Math.round(paid * (tier.refundPercent / 100) * 100) / 100;
      booking.suggestedRefund = suggestedRefund;

      const freedDates = booking.sessions.map((s) => s.date);
      const notified = notifyWaitlistForFreedHall(booking.hallId, freedDates);

      if (issueRefundVoucher && suggestedRefund > 0) {
        db.voucherCounter += 1;
        db.refunds.unshift({
          id: `ref-${Date.now()}`,
          voucherNumber: `VCH-2026-${String(db.voucherCounter).padStart(4, '0')}`,
          bookingId: booking.id,
          amount: suggestedRefund,
          reason: reason.trim(),
          method: refundMethod || 'Bank Transfer',
          issuedBy: actor.name,
          issuedAt: new Date().toISOString(),
        });
      }

      appendAudit(
        actor,
        'BOOKING_CANCELLED',
        'booking',
        booking.id,
        reason.trim(),
        `Booking cancelled. Policy refund (${tier.refundPercent}%): ${fmtMoney(suggestedRefund)}. Waitlist notified: ${notified}.`,
        true
      );
    }

    booking.updatedAt = new Date().toISOString();
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Add Waitlist entry
  app.post('/api/waitlist', requireAuth(['manager', 'booking_officer']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { hallId, desiredDate, startTime, endTime, clientName, clientPhone, eventTitle } = req.body as {
      hallId: string;
      desiredDate: string;
      startTime: string;
      endTime: string;
      clientName: string;
      clientPhone: string;
      eventTitle: string;
    };
    const entry = {
      id: `wl-${Date.now()}`,
      hallId,
      desiredDate,
      startTime,
      endTime,
      clientName,
      clientPhone,
      eventTitle,
      status: 'waiting' as const,
      notifiedAt: null,
      createdAt: new Date().toISOString(),
    };
    db.waitlist.unshift(entry);
    appendAudit(actor, 'WAITLIST_ADDED', 'waitlist', entry.id, 'Added client to waitlist', `${clientName} for ${desiredDate}`, false);
    saveDatabase();
    res.status(201).json({ state: sanitizeClientResponse(db, actor) });
  });

  // Waitlist Status Transition (Manager / Booking Officer)
  app.post('/api/waitlist/:id/status', requireAuth(['manager', 'booking_officer']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const entry = db.waitlist.find((w) => w.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Waitlist entry not found.' });
    const { status } = req.body as { status: 'waiting' | 'notified' | 'converted' | 'dismissed' };
    if (!['waiting', 'notified', 'converted', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid waitlist status.' });
    }
    entry.status = status;
    if (status === 'notified' && !entry.notifiedAt) {
      entry.notifiedAt = new Date().toISOString();
    }
    appendAudit(
      actor,
      'WAITLIST_STATUS_UPDATED',
      'waitlist',
      entry.id,
      `Waitlist entry marked ${status}`,
      `${entry.clientName} (${entry.eventTitle}) -> ${status}.`,
      false
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Maintenance block (System Admin ONLY)
  app.post('/api/setup/maintenance', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { hallId, date, startTime, endTime, reason } = req.body as {
      hallId: string;
      date: string;
      startTime: string;
      endTime: string;
      reason: string;
    };
    const hall = db.halls.find((h) => h.id === hallId);
    if (!hall) {
      return res.status(404).json({ error: 'Selected event hall was not found.' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'A valid maintenance date (YYYY-MM-DD) is required.' });
    }
    if (!startTime || !endTime || toMinutes(startTime) >= toMinutes(endTime)) {
      return res.status(400).json({ error: 'Maintenance end time must be after start time.' });
    }
    if (!reason?.trim()) {
      return res.status(400).json({ error: 'Mandatory maintenance reason is required.' });
    }

    const impactedBookings = db.bookings
      .filter(
        (b) =>
          !['cancelled', 'expired', 'closed'].includes(b.status) &&
          b.hallId === hall.id &&
          b.sessions.some(
            (s) =>
              s.status !== 'cancelled' &&
              s.date === date &&
              sessionsOverlap(startTime, endTime, s.startTime, s.endTime, hall.bufferMinutes)
          )
      )
      .map((b) => b.id);

    const block = {
      id: `mnt-${Date.now()}`,
      hallId: hall.id,
      date,
      startTime,
      endTime,
      reason: reason.trim(),
      createdBy: actor.name,
    };
    db.maintenanceBlocks.unshift(block);
    appendAudit(
      actor,
      'MAINTENANCE_BLOCK_ADDED',
      'hall',
      hall.id,
      reason.trim(),
      `System Admin ${actor.name} placed ${hall.name} under maintenance on ${date} (${startTime}-${endTime}).${impactedBookings.length > 0 ? ` Impacted bookings: ${impactedBookings.join(', ')}.` : ''}`,
      impactedBookings.length > 0
    );
    saveDatabase();
    res.status(201).json({ block, impactedBookings, state: sanitizeClientResponse(db, actor) });
  });

  // Clear / Lift maintenance block early (System Admin ONLY)
  app.delete('/api/setup/maintenance/:id', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const idx = db.maintenanceBlocks.findIndex((m) => m.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Maintenance block not found.' });
    }
    const [removed] = db.maintenanceBlocks.splice(idx, 1);
    const hall = db.halls.find((h) => h.id === removed.hallId);
    const notified = notifyWaitlistForFreedHall(removed.hallId, [removed.date]);
    appendAudit(
      actor,
      'MAINTENANCE_BLOCK_CLEARED',
      'hall',
      removed.hallId,
      'Venue cleared and reopened for scheduling',
      `System Admin ${actor.name} cleared maintenance hold on ${hall?.name || removed.hallId} (${removed.date} ${removed.startTime}-${removed.endTime}). Waitlist notified: ${notified}.`,
      false
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Hotel Policy, Bank Accounts & Cancellation Tiers (Manager ONLY)
  app.put('/api/setup/profile', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const updates = req.body as Partial<typeof db.profile>;
    if (Array.isArray(updates.bankAccounts)) {
      updates.bankAccounts = updates.bankAccounts
        .filter((b) => b && b.bankName?.trim() && b.accountNumber?.trim())
        .map((b, i) => ({
          id: b.id?.trim() || `bank-${Date.now()}-${i}`,
          bankName: b.bankName.trim(),
          accountName: (b.accountName || db.profile.hotelName).trim(),
          accountNumber: b.accountNumber.trim(),
          branch: (b.branch || 'Wuye, Abuja').trim(),
        }));
    }
    if (Array.isArray(updates.cancellationPolicy)) {
      updates.cancellationPolicy = updates.cancellationPolicy
        .filter((t) => t && Number.isFinite(Number(t.daysBefore)) && Number.isFinite(Number(t.refundPercent)))
        .map((t) => ({
          daysBefore: Math.max(0, Math.round(Number(t.daysBefore))),
          refundPercent: Math.max(0, Math.min(100, Math.round(Number(t.refundPercent)))),
          label: (t.label || `${Math.max(0, Math.round(Number(t.daysBefore)))}+ days prior`).trim(),
        }))
        .sort((a, b) => b.daysBefore - a.daysBefore);
    }
    db.profile = { ...db.profile, ...updates };
    appendAudit(
      actor,
      'HOTEL_SETUP_UPDATED',
      'profile',
      'hotel',
      'Hotel policy, banks & thresholds updated',
      `Updated hotel profile (${db.profile.currency}), ${db.profile.bankAccounts.length} bank account(s), ${db.profile.cancellationPolicy.length} cancellation tier(s).`,
      true
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Venue Physical Setup, Photography, Capacities & Service Status (System Admin ONLY)
  app.post('/api/setup/halls', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const body = req.body as {
      name: string;
      description?: string;
      imageUrl?: string;
      capacityBanquet?: number;
      capacityTheatre?: number;
      capacityClassroom?: number;
      capacityCocktail?: number;
      baseDayRate?: number;
      halfDayRate?: number;
      bufferMinutes?: number;
      layouts?: HallLayout[];
    };
    if (!body.name?.trim()) return res.status(400).json({ error: 'Hall name is required.' });
    if (body.baseDayRate !== undefined || body.halfDayRate !== undefined) {
      return res.status(403).json({
        error: 'Only the Hotel Manager can set hall pricing. System Admin manages hall pictures, descriptions, capacities, and maintenance.',
      });
    }
    const newHall = {
      id: `hall-${Date.now()}`,
      name: body.name.trim(),
      imageUrl: body.imageUrl?.trim() || '/src/assets/images/hall_grand_ballroom_1795436657988.jpg',
      description: body.description?.trim() || 'Hotel event hall.',
      capacityBanquet: Number(body.capacityBanquet) || 200,
      capacityTheatre: Number(body.capacityTheatre) || 350,
      capacityClassroom: Number(body.capacityClassroom) || 150,
      capacityCocktail: Number(body.capacityCocktail) || 400,
      baseDayRate: 1000000,
      halfDayRate: 650000,
      bufferMinutes: body.bufferMinutes !== undefined ? Math.max(0, Number(body.bufferMinutes) || 0) : 120,
      layouts: body.layouts?.length ? body.layouts : (['Banquet', 'Theatre', 'Classroom', 'Cocktail'] as HallLayout[]),
      sections: ['Main Hall'],
      active: true,
    };
    db.halls.push(newHall);
    appendAudit(actor, 'HALL_CREATED', 'hall', newHall.id, 'New physical venue registered by System Admin', `${newHall.name} (default tariff awaiting Manager pricing review).`, true);
    saveDatabase();
    res.status(201).json({ hall: newHall, state: sanitizeClientResponse(db, actor) });
  });

  app.put('/api/setup/halls/:id', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const hall = db.halls.find((h) => h.id === req.params.id);
    if (!hall) return res.status(404).json({ error: 'Hall not found.' });
    const updates = req.body as Partial<typeof hall>;

    const changingRate =
      (updates.baseDayRate !== undefined && Number(updates.baseDayRate) !== hall.baseDayRate) ||
      (updates.halfDayRate !== undefined && Number(updates.halfDayRate) !== hall.halfDayRate);

    if (changingRate) {
      return res.status(403).json({
        error: 'Hall pricing is restricted to the Hotel Manager. System Admin manages hall pictures, capacities, turnaround buffers, and maintenance status.',
      });
    }

    const previousActive = hall.active;
    if (updates.name !== undefined && updates.name.trim()) hall.name = updates.name.trim();
    if (updates.description !== undefined) hall.description = updates.description.trim();
    if (updates.imageUrl !== undefined) hall.imageUrl = updates.imageUrl.trim();
    if (updates.capacityBanquet !== undefined) hall.capacityBanquet = Number(updates.capacityBanquet) || hall.capacityBanquet;
    if (updates.capacityTheatre !== undefined) hall.capacityTheatre = Number(updates.capacityTheatre) || hall.capacityTheatre;
    if (updates.capacityClassroom !== undefined) hall.capacityClassroom = Number(updates.capacityClassroom) || hall.capacityClassroom;
    if (updates.capacityCocktail !== undefined) hall.capacityCocktail = Number(updates.capacityCocktail) || hall.capacityCocktail;
    if (updates.bufferMinutes !== undefined) hall.bufferMinutes = Math.max(0, Number(updates.bufferMinutes) || 0);
    if (updates.layouts !== undefined && updates.layouts.length > 0) hall.layouts = updates.layouts;
    if (updates.active !== undefined) hall.active = Boolean(updates.active);

    const statusChanged = updates.active !== undefined && hall.active !== previousActive;
    appendAudit(
      actor,
      statusChanged
        ? hall.active
          ? 'HALL_REOPENED_ACTIVE'
          : 'HALL_MARKED_OUT_OF_SERVICE'
        : 'HALL_MEDIA_UPDATED',
      'hall',
      hall.id,
      statusChanged
        ? hall.active
          ? 'Venue returned to active booking service by System Admin'
          : 'Venue placed Out of Service for maintenance by System Admin'
        : 'Venue picture, capacity, or turnaround buffer updated by System Admin',
      `Updated ${hall.name} (active=${hall.active}, buffer=${hall.bufferMinutes}m).`,
      true
    );
    saveDatabase();
    res.json({ hall, state: sanitizeClientResponse(db, actor) });
  });

  // Hall Commercial Pricing Rates (Manager ONLY)
  app.put('/api/setup/halls/:id/pricing', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const hall = db.halls.find((h) => h.id === req.params.id);
    if (!hall) return res.status(404).json({ error: 'Hall not found.' });
    const { baseDayRate, halfDayRate } = req.body as { baseDayRate?: number; halfDayRate?: number };
    if (baseDayRate !== undefined) {
      const val = Number(baseDayRate);
      if (!Number.isFinite(val) || val < 0) return res.status(400).json({ error: 'Valid full-day rate is required.' });
      hall.baseDayRate = Math.round(val);
    }
    if (halfDayRate !== undefined) {
      const val = Number(halfDayRate);
      if (!Number.isFinite(val) || val < 0) return res.status(400).json({ error: 'Valid half-day rate is required.' });
      hall.halfDayRate = Math.round(val);
    }
    appendAudit(
      actor,
      'HALL_PRICING_UPDATED',
      'hall',
      hall.id,
      'Commercial Naira hall tariff updated by Manager',
      `${hall.name}: Full-Day ${fmtMoney(hall.baseDayRate)}, Half-Day ${fmtMoney(hall.halfDayRate)}.`,
      true
    );
    saveDatabase();
    res.json({ hall, state: sanitizeClientResponse(db, actor) });
  });

  // Catering Packages CRUD (Manager ONLY — commercial pricing)
  app.post('/api/setup/catering', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { name, category, pricePerHead, description } = req.body as {
      name: string;
      category?: string;
      pricePerHead: number;
      description?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'Package name is required.' });
    const pkg = {
      id: `cat-${Date.now()}`,
      name: name.trim(),
      category: category?.trim() || 'Banquet',
      pricePerHead: Math.max(0, Number(pricePerHead) || 0),
      description: description?.trim() || 'Custom hotel banquet menu.',
      courses: [],
    };
    db.cateringPackages.push(pkg);
    appendAudit(actor, 'CATERING_PACKAGE_ADDED', 'catering', pkg.id, 'Menu pricing updated', `${pkg.name} (${fmtMoney(pkg.pricePerHead)}/head).`, false);
    saveDatabase();
    res.status(201).json({ state: sanitizeClientResponse(db, actor) });
  });

  app.delete('/api/setup/catering/:id', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const idx = db.cateringPackages.findIndex((c) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Catering package not found.' });
    const removed = db.cateringPackages.splice(idx, 1)[0];
    appendAudit(actor, 'CATERING_PACKAGE_REMOVED', 'catering', removed.id, 'Menu catalog updated', `Removed ${removed.name}.`, false);
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Equipment Stock & Pricing CRUD (Manager ONLY)
  app.post('/api/setup/equipment', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { name, category, totalStock, unitRate, replacementCost } = req.body as {
      name: string;
      category?: string;
      totalStock: number;
      unitRate: number;
      replacementCost?: number;
    };
    if (!name?.trim()) return res.status(400).json({ error: 'Equipment name is required.' });
    const item = {
      id: `eq-${Date.now()}`,
      name: name.trim(),
      category: category?.trim() || 'AV',
      totalStock: Math.max(1, Number(totalStock) || 1),
      unitRate: Math.max(0, Number(unitRate) || 0),
      replacementCost: Math.max(0, Number(replacementCost) || 250000),
    };
    db.equipment.push(item);
    appendAudit(actor, 'EQUIPMENT_ADDED', 'equipment', item.id, 'Inventory & rate updated', `${item.name} (${item.totalStock} in stock @ ${fmtMoney(item.unitRate)}).`, false);
    saveDatabase();
    res.status(201).json({ state: sanitizeClientResponse(db, actor) });
  });

  app.put('/api/setup/equipment/:id', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const item = db.equipment.find((e) => e.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipment item not found.' });
    const { totalStock, unitRate } = req.body as { totalStock?: number; unitRate?: number };
    if (totalStock !== undefined) item.totalStock = Math.max(0, Number(totalStock));
    if (unitRate !== undefined) item.unitRate = Math.max(0, Number(unitRate));
    appendAudit(actor, 'EQUIPMENT_UPDATED', 'equipment', item.id, 'Stock or rate adjusted', `${item.name}: ${item.totalStock} units @ ${fmtMoney(item.unitRate)}.`, false);
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Client Overdue Flag Clearance (Manager)
  app.post('/api/clients/:id/overdue', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const client = db.clients.find((c) => c.id === req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    const { overdueFlag, reason } = req.body as { overdueFlag: boolean; reason: string };
    if (!reason?.trim()) return res.status(400).json({ error: 'Mandatory reason required.' });
    client.overdueFlag = Boolean(overdueFlag);
    client.overdueNotes = overdueFlag ? reason.trim() : `Cleared by ${actor.name}: ${reason.trim()}`;
    appendAudit(actor, overdueFlag ? 'CLIENT_FLAGGED_OVERDUE' : 'CLIENT_OVERDUE_CLEARED', 'client', client.id, reason.trim(), `${client.name} overdueFlag=${client.overdueFlag}.`, true);
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Direct Staff Creation (Manager ONLY — new indoor registrations also verify through Manager)
  app.post('/api/staff', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { name, email, username, role, password } = req.body as {
      name: string;
      email?: string;
      username: string;
      role: StaffRole;
      password: string;
    };
    if (!name?.trim() || !username?.trim() || !password || password.length < 6) {
      return res.status(400).json({ error: 'Name, username, and password (min 6 chars) are required.' });
    }
    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = (email?.trim() || `${cleanUsername}@exclusiveserenehotel.com`).toLowerCase();
    if (
      db.staff.some(
        (s) =>
          s.username.toLowerCase() === cleanUsername ||
          (s.email && s.email.toLowerCase() === cleanEmail)
      )
    ) {
      return res.status(400).json({ error: 'Email or username already exists.' });
    }
    const nowIso = new Date().toISOString();
    const newStaff: ServerStaffRecord = {
      id: `stf-${Date.now()}`,
      name: name.trim(),
      email: cleanEmail,
      username: cleanUsername,
      role,
      active: true,
      approvalStatus: 'approved',
      approvedBy: actor.name,
      approvedAt: nowIso,
      locked: false,
      lockedReason: null,
      lockedAt: null,
      failedAttempts: 0,
      createdAt: nowIso,
      passwordHash: hashPassword(password),
    };
    db.staff.push(newStaff);
    appendAudit(actor, 'STAFF_ACCOUNT_CREATED', 'staff', newStaff.id, 'New staff member onboarded', `${newStaff.name} (${newStaff.role}) — ${newStaff.email}`, true);
    saveDatabase();
    res.status(201).json({ state: sanitizeClientResponse(db, actor) });
  });

  // Verify / Approve or Decline indoor staff registration (Manager ONLY)
  app.post('/api/staff/:id/verify-account', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const target = db.staff.find((s) => s.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });
    const { decision, role, reason } = req.body as {
      decision: 'approve' | 'reject';
      role?: StaffRole;
      reason?: string;
    };
    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approve or reject.' });
    }
    const nowIso = new Date().toISOString();
    if (decision === 'approve') {
      if (role) target.role = role;
      target.approvalStatus = 'approved';
      target.approvedBy = actor.name;
      target.approvedAt = nowIso;
      target.active = true;
      target.locked = false;
      target.failedAttempts = 0;
    } else {
      target.approvalStatus = 'rejected';
      target.approvedBy = actor.name;
      target.approvedAt = nowIso;
      target.active = false;
    }

    for (const t of db.tasks) {
      if (t.type === 'account_verification' && t.bookingId === target.id) {
        t.status = 'done';
      }
    }

    appendAudit(
      actor,
      decision === 'approve' ? 'STAFF_ACCOUNT_VERIFIED' : 'STAFF_ACCOUNT_REJECTED',
      'staff',
      target.id,
      reason?.trim() || (decision === 'approve' ? 'Verified indoor staff onboarding' : 'Registration request declined'),
      `${target.name} (@${target.username}) ${decision === 'approve' ? `approved as ${target.role}` : 'rejected'} by Manager ${actor.name}.`,
      true
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Unlock locked staff account (System Admin ONLY)
  app.post('/api/staff/:id/unlock', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const target = db.staff.find((s) => s.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });
    const { reason } = req.body as { reason?: string };
    target.locked = false;
    target.lockedReason = null;
    target.lockedAt = null;
    target.failedAttempts = 0;

    for (const t of db.tasks) {
      if (t.type === 'account_locked' && t.bookingId === target.id) {
        t.status = 'done';
      }
    }

    appendAudit(
      actor,
      'STAFF_ACCOUNT_UNLOCKED',
      'staff',
      target.id,
      reason?.trim() || 'Identity verified & account unlocked',
      `${target.name} (@${target.username}) unlocked by System Admin ${actor.name}.`,
      true
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Manually lock staff account (System Admin ONLY)
  app.post('/api/staff/:id/lock', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const target = db.staff.find((s) => s.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Staff account not found.' });
    if (target.id === actor.id) return res.status(400).json({ error: 'Cannot lock your own active System Admin session.' });
    const { reason } = req.body as { reason?: string };
    target.locked = true;
    target.lockedAt = new Date().toISOString();
    target.lockedReason = reason?.trim() || 'Locked by System Admin security hold';

    appendAudit(
      actor,
      'STAFF_ACCOUNT_LOCKED_MANUAL',
      'staff',
      target.id,
      target.lockedReason,
      `${target.name} (@${target.username}) manually locked by System Admin ${actor.name}.`,
      true
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // System Errors & Diagnostics Log (Log client/app errors & let System Admin resolve them)
  app.post('/api/system/errors', requireAuth(), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { source, severity, message, context } = req.body as {
      source?: SystemErrorRecord['source'];
      severity?: SystemErrorRecord['severity'];
      message?: string;
      context?: string;
    };
    if (!message?.trim()) return res.status(400).json({ error: 'Error message is required.' });
    const entry = recordSystemError(
      source || 'client',
      severity || 'error',
      message.trim(),
      context?.trim() || '',
      `${actor.name} (@${actor.username})`
    );
    saveDatabase();
    res.status(201).json({ entry, state: sanitizeClientResponse(db, actor) });
  });

  app.post('/api/system/errors/:id/resolve', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const errItem = db.systemErrors.find((e) => e.id === req.params.id);
    if (!errItem) return res.status(404).json({ error: 'System error record not found.' });
    const { resolutionNote } = req.body as { resolutionNote?: string };
    errItem.status = 'resolved';
    errItem.resolvedBy = actor.name;
    errItem.resolvedAt = new Date().toISOString();
    errItem.resolutionNote = resolutionNote?.trim() || 'Investigated and cleared by System Admin.';

    for (const t of db.tasks) {
      if (t.type === 'system_error' && t.bookingId === errItem.id) {
        t.status = 'done';
      }
    }

    appendAudit(
      actor,
      'SYSTEM_ERROR_RESOLVED',
      'system',
      errItem.id,
      errItem.resolutionNote,
      `Resolved ${errItem.source} ${errItem.severity}: ${errItem.message}`,
      false
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Assign or update technical password for any staff account (System Admin ONLY)
  app.post('/api/staff/:id/password', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const target = db.staff.find((s) => s.id === req.params.id && s.active);
    if (!target) return res.status(404).json({ error: 'Active staff member not found.' });
    const { password } = req.body as { password?: string };
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Customized password must be at least 6 characters.' });
    }
    target.passwordHash = hashPassword(password);
    appendAudit(
      actor,
      'STAFF_PASSWORD_ASSIGNED',
      'staff',
      target.id,
      'Technical credential reset by System Admin',
      `System Admin ${actor.name} updated sign-in password for ${target.name} (${target.role}).`,
      true
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Generate one-time password reset code for a staff member (System Admin ONLY)
  app.post('/api/staff/:id/reset-code', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const target = db.staff.find((s) => s.id === req.params.id && s.active);
    if (!target) return res.status(404).json({ error: 'Active staff member not found.' });

    const rawCode = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    db.resetTokens = db.resetTokens.filter((t) => t.username.toLowerCase() !== target.username.toLowerCase());
    db.resetTokens.push({
      username: target.username,
      codeHash: hashPassword(rawCode),
      expiresAt,
    });
    appendAudit(actor, 'STAFF_RESET_CODE_ISSUED', 'staff', target.id, 'Password recovery requested', `System Admin ${actor.name} issued 30-min reset code for ${target.name} (${target.username}).`, true);
    saveDatabase();
    res.json({ username: target.username, name: target.name, resetCode: rawCode, expiresAt });
  });

  // Reassign departing staff workload (Manager ONLY — operational & HR governance)
  app.post('/api/staff/:id/reassign', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { toStaffId, reason } = req.body as { toStaffId: string; reason: string };
    const fromStaff = db.staff.find((s) => s.id === req.params.id);
    const toStaff = db.staff.find((s) => s.id === toStaffId && s.active);
    if (!fromStaff || !toStaff) return res.status(404).json({ error: 'Source or target staff not found.' });
    if (!reason?.trim()) return res.status(400).json({ error: 'Mandatory reassignment reason required.' });

    let movedBookings = 0;
    for (const b of db.bookings) {
      if (b.assignedOfficerId === fromStaff.id && !['closed', 'cancelled', 'expired'].includes(b.status)) {
        b.assignedOfficerId = toStaff.id;
        movedBookings++;
      }
    }
    let movedTasks = 0;
    for (const t of db.tasks) {
      if (t.assignedToId === fromStaff.id && t.status === 'open') {
        t.assignedToId = toStaff.id;
        movedTasks++;
      }
    }
    appendAudit(
      actor,
      'STAFF_WORKLOAD_REASSIGNED',
      'staff',
      fromStaff.id,
      reason.trim(),
      `Manager ${actor.name} reassigned ${movedBookings} open booking(s) and ${movedTasks} task(s) from ${fromStaff.name} to ${toStaff.name}.`,
      true
    );
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Deactivate departing staff account (Manager ONLY — HR governance)
  app.post('/api/staff/:id/deactivate', requireAuth(['manager']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const target = db.staff.find((s) => s.id === req.params.id);
    if (!target) return res.status(404).json({ error: 'Staff member not found.' });
    if (target.id === actor.id) return res.status(400).json({ error: 'Cannot deactivate your own active session.' });

    const openBookings = db.bookings.filter(
      (b) => b.assignedOfficerId === target.id && !['closed', 'cancelled', 'expired'].includes(b.status)
    );
    const openTasks = db.tasks.filter((t) => t.assignedToId === target.id && t.status === 'open');
    if (openBookings.length > 0 || openTasks.length > 0) {
      return res.status(400).json({
        error: `Reassignment required before deactivation: ${openBookings.length} open booking(s) and ${openTasks.length} open task(s) still assigned to ${target.name}.`,
      });
    }

    target.active = false;
    appendAudit(actor, 'STAFF_ACCOUNT_DEACTIVATED', 'staff', target.id, 'Staff departure', `${target.name} deactivated by Manager ${actor.name} after workload clearance.`, true);
    saveDatabase();
    res.json({ state: sanitizeClientResponse(db, actor) });
  });

  // Automatic Scheduled Jobs Runner (System Admin ONLY)
  app.post('/api/jobs/run', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    let expiredHolds = 0;
    let completedEvents = 0;
    let flaggedOverdue = 0;

    for (const b of db.bookings) {
      // 1. Expire unpaid holds past deadline
      if (b.status === 'hold_proforma' && b.holdExpiresAt && new Date(b.holdExpiresAt) < now) {
        b.status = 'expired';
        expiredHolds++;
        notifyWaitlistForFreedHall(
          b.hallId,
          b.sessions.map((s) => s.date)
        );
      }

      // 2. Mark locked bookings past last session as event_completed
      const lastDate = b.sessions[b.sessions.length - 1]?.date;
      if (b.status === 'locked' && lastDate && lastDate < today) {
        b.status = 'event_completed';
        completedEvents++;
      }

      // 3. Flag overdue balances
      if (['event_completed', 'locked'].includes(b.status) && b.finalDueDate && b.finalDueDate < today) {
        const paid = getVerifiedPaidForBooking(b.id);
        if (paid < b.grandTotal - 0.01) {
          const client = db.clients.find((c) => c.id === b.clientId);
          if (client && !client.overdueFlag) {
            client.overdueFlag = true;
            client.overdueNotes = `Overdue balance on ${b.id} (due ${b.finalDueDate}).`;
            flaggedOverdue++;
            db.tasks.unshift({
              id: `tsk-${Date.now()}-${b.id}`,
              assignedToId: db.staff.find((s) => s.role === 'cashier' && s.active)?.id || null,
              roleTarget: 'cashier',
              bookingId: b.id,
              type: 'overdue_collection',
              title: `Overdue Balance — ${b.eventTitle}`,
              description: `Balance due ${b.finalDueDate}; client flagged automatically.`,
              status: 'open',
              createdAt: now.toISOString(),
            });
          }
        }
      }
    }

    appendAudit(
      actor,
      'SCHEDULED_MAINTENANCE_JOBS_RUN',
      'system',
      'scheduler',
      'Manual or scheduled batch run',
      `Expired holds: ${expiredHolds}, Auto-completed events: ${completedEvents}, Overdue clients flagged: ${flaggedOverdue}.`,
      false
    );
    saveDatabase();
    res.json({
      summary: { expiredHolds, completedEvents, flaggedOverdue },
      state: sanitizeClientResponse(db, actor),
    });
  });

  // Download full JSON backup (System Admin / Manager / Owner)
  app.get('/api/admin/backup', requireAuth(['sys_admin', 'manager', 'owner']), (_req, res) => {
    res.setHeader('Content-Disposition', `attachment; filename="hallbook-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(sanitizeClientResponse(db));
  });

  // Restore full JSON backup (System Admin ONLY)
  app.post('/api/admin/restore', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const backup = req.body as Partial<HallBookDatabase>;
    if (
      !backup ||
      typeof backup !== 'object' ||
      !backup.profile ||
      !Array.isArray(backup.halls) ||
      !Array.isArray(backup.bookings) ||
      !Array.isArray(backup.clients)
    ) {
      return res.status(400).json({ error: 'Invalid HallBook backup JSON file structure.' });
    }

    // Preserve active staff credential hashes & recovery keys safely
    const existingHashes = new Map<string, string>();
    for (const s of db.staff) {
      if (s.passwordHash) existingHashes.set(s.id, s.passwordHash);
    }

    db.profile = { ...db.profile, ...backup.profile };
    db.halls = backup.halls;
    if (Array.isArray(backup.equipment)) db.equipment = backup.equipment;
    if (Array.isArray(backup.cateringPackages)) db.cateringPackages = backup.cateringPackages;
    if (Array.isArray(backup.addons)) db.addons = backup.addons;
    db.clients = backup.clients;
    db.bookings = backup.bookings;
    if (Array.isArray(backup.payments)) db.payments = backup.payments;
    if (Array.isArray(backup.refunds)) db.refunds = backup.refunds;
    if (Array.isArray(backup.shifts)) db.shifts = backup.shifts;
    if (Array.isArray(backup.waitlist)) db.waitlist = backup.waitlist;
    if (Array.isArray(backup.maintenanceBlocks)) db.maintenanceBlocks = backup.maintenanceBlocks;
    if (Array.isArray(backup.tasks)) db.tasks = backup.tasks;
    if (Array.isArray(backup.auditLogs)) db.auditLogs = backup.auditLogs;
    if (Array.isArray(backup.systemErrors)) db.systemErrors = backup.systemErrors;

    if (Array.isArray(backup.staff) && backup.staff.length > 0) {
      const mergedStaff: ServerStaffRecord[] = backup.staff.map(({ hasPassword: _hp, ...incoming }) => ({
        ...incoming,
        passwordHash: existingHashes.get(incoming.id) || (incoming as ServerStaffRecord).passwordHash || null,
      }));
      if (!mergedStaff.some((s) => s.id === actor.id)) {
        mergedStaff.unshift(actor);
      }
      db.staff = mergedStaff;
    }

    appendAudit(
      actor,
      'DATABASE_BACKUP_RESTORED',
      'system',
      'database',
      'Restored from HallBook JSON backup',
      `System Admin ${actor.name} restored ${db.bookings.length} booking(s) and ${db.clients.length} client(s).`,
      true
    );
    saveDatabase();
    res.json({ ok: true, state: sanitizeClientResponse(db, actor) });
  });

  // Clean Production Reset: Clear sample demo data while preserving staff credentials, profile, halls & pricing (System Admin ONLY)
  app.post('/api/admin/reset-demo-data', requireAuth(['sys_admin']), (req: AuthedRequest, res) => {
    const actor = req.staffUser!;
    const { confirmPassword, confirmPhrase } = req.body as {
      confirmPassword?: string;
      confirmPhrase?: string;
    };
    if ((confirmPhrase || '').trim().toUpperCase() !== 'GO LIVE') {
      return res.status(400).json({ error: 'Type GO LIVE in the confirmation box to clear sample data.' });
    }
    if (!confirmPassword || !actor.passwordHash || !verifyPassword(confirmPassword, actor.passwordHash)) {
      return res.status(401).json({ error: 'Password confirmation failed. No records were modified.' });
    }

    const clearedSummary = `${db.bookings.length} booking(s), ${db.clients.length} client(s), ${db.payments.length} payment(s)`;
    db.bookings = [];
    db.clients = [];
    db.payments = [];
    db.refunds = [];
    db.shifts = [];
    db.waitlist = [];
    db.maintenanceBlocks = [];
    db.tasks = [];
    db.systemErrors = [];
    db.bookingCounter = 100;
    db.receiptCounter = 1000;
    db.voucherCounter = 100;

    appendAudit(
      actor,
      'PRODUCTION_DATA_RESET',
      'system',
      'go-live',
      'Cleared sample bookings & financial records for live hotel operations',
      `${actor.name} cleared ${clearedSummary}; staff credentials, bank accounts, halls, and pricing preserved.`,
      true
    );
    saveDatabase();
    res.json({ ok: true, state: sanitizeClientResponse(db, actor) });
  });

  // Server error capture middleware so System Admin diagnostics always sees unexpected API exceptions
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    recordSystemError('server', 'critical', err?.message || 'Unhandled server exception', `${req.method} ${req.originalUrl}`, 'Express Server');
    saveDatabase();
    res.status(500).json({ error: 'An internal server error occurred and was logged for System Admin review.' });
  });

  // Vite dev middleware or static dist serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`HallBook server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
