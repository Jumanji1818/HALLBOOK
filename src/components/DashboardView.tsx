import React, { useState } from 'react';
import {
  AlertOctagon,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ClipboardCheck,
  CreditCard,
  Hotel,
  Lock,
  Plus,
  ShieldAlert,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  ROLE_LABELS,
  type Booking,
  type HallBookStateResponse,
  type StaffUser,
} from '../types';
import {
  BOOKING_STATUS_META,
  canCreateBooking,
  canManageMaintenance,
  canManageSystemSecurityAndMedia,
  canVerifyNewAccounts,
  canViewBookingFinancials,
  canViewBookingsDesk,
  canViewFullReports,
  canViewPaymentsLedger,
  formatCurrency,
  formatDate,
  formatDateTime,
  isHigherAuthority,
} from '../utils/format';
import { TiltCard3D } from './TiltCard3D';

interface DashboardViewProps {
  state: HallBookStateResponse;
  currentUser: StaffUser;
  onOpenBooking: (booking: Booking) => void;
  onNewBooking: () => void;
  onNavigateTab: (tab: 'schedule' | 'bookings' | 'payments' | 'reports' | 'setup') => void;
}

interface WorkflowStep {
  step: string;
  title: string;
  detail: string;
  actionLabel: string;
  targetTab: 'schedule' | 'bookings' | 'payments' | 'reports' | 'setup';
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  currentUser,
  onOpenBooking,
  onNewBooking,
  onNavigateTab,
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const currency = state.profile.currency || 'NGN';
  const role = currentUser.role;

  const isHigherAuth = isHigherAuthority(role);
  const isManagerVerifier = canVerifyNewAccounts(role);
  const isSysAdmin = canManageSystemSecurityAndMedia(role);
  const canMaintain = canManageMaintenance(role);
  const showBookingFinancials = canViewBookingFinancials(role);
  const showBookingsDesk = canViewBookingsDesk(role);
  const showPaymentsLedger = canViewPaymentsLedger(role);
  const showFullReports = canViewFullReports(role);

  const activeBookings = state.bookings.filter(
    (b) => !['cancelled', 'expired'].includes(b.status)
  );
  const totalContracted = activeBookings.reduce((sum, b) => sum + b.grandTotal, 0);
  const verifiedCollected = state.payments
    .filter((p) => p.status === 'verified')
    .reduce((sum, p) => sum + p.amount, 0);
  const pendingVerificationCount = state.payments.filter(
    (p) => p.status === 'pending_verification'
  ).length;
  const openShift = state.shifts.find((s) => s.status === 'open');

  const pendingAccountsCount = state.staff.filter(
    (s) => (s.approvalStatus ?? 'approved') === 'pending'
  ).length;
  const lockedAccountsCount = state.staff.filter((s) => s.locked).length;
  const openSystemErrorsCount = (state.systemErrors || []).filter(
    (e) => e.status === 'open'
  ).length;
  const resolvedSystemErrorsCount = (state.systemErrors || []).filter(
    (e) => e.status === 'resolved'
  ).length;
  const outOfServiceHallsCount = state.halls.filter((h) => !h.active).length;
  const activeHallsCount = state.halls.length - outOfServiceHallsCount;
  const activeStaffCount = state.staff.filter((s) => s.active).length;

  const roleTasks = state.tasks.filter((t) => {
    if (t.status !== 'open') return false;
    if (role === 'owner') return true;
    if (role === 'manager') return t.roleTarget !== 'sys_admin';
    return t.roleTarget === role;
  });

  const pendingApprovals = state.bookings.filter(
    (b) => b.status === 'awaiting_manager_approval'
  );
  const pendingRoomChecks = state.bookings.filter((b) =>
    b.roomLines.some(
      (rl) =>
        rl.verificationStatus === 'pending' ||
        (rl.verificationStatus === 'partial' && rl.officerDecision === 'pending')
    )
  );
  const verifiedRoomBlocksCount = activeBookings.reduce(
    (sum, b) =>
      sum +
      b.roomLines.filter(
        (rl) => rl.verificationStatus === 'full' || rl.verificationStatus === 'partial'
      ).length,
    0
  );
  const partialDecisionCount = activeBookings.filter((b) =>
    b.roomLines.some(
      (rl) => rl.verificationStatus === 'partial' && rl.officerDecision === 'pending'
    )
  ).length;

  const activeHolds = state.bookings.filter((b) => b.status === 'hold_proforma');
  const lockedEventsCount = state.bookings.filter((b) => b.status === 'locked').length;
  const activeCateringOrdersCount = activeBookings.filter(
    (b) => b.catering && b.catering.mode === 'hotel' && b.catering.kitchenStatus !== 'served'
  ).length;

  const upcomingEvents = state.bookings
    .filter((b) => ['locked', 'hold_proforma', 'awaiting_room_verification'].includes(b.status))
    .slice(0, 6);

  const notifiedWaitlist = state.waitlist.filter((w) => w.status === 'notified');

  const headerTitle =
    role === 'sys_admin'
      ? 'Venue Maintenance, Security & IT Control'
      : role === 'front_desk'
      ? 'Front Desk Room Blocks & Door Check-In'
      : role === 'cashier'
      ? 'Cashier Payments, Receipts & Shift Desk'
      : role === 'booking_officer'
      ? 'Reservations, Holds & Client Desk'
      : role === 'operations'
      ? 'Banquet Operations & Guest Check-In'
      : 'Executive Hotel & Venue Control';

  const workflowSteps: WorkflowStep[] = (() => {
    switch (role) {
      case 'front_desk':
        return [
          {
            step: '01',
            title: 'Verify Room Counts & Nightly Rates',
            detail: `${pendingRoomChecks.length} booking(s) need room availability and ₦ rate confirmation.`,
            actionLabel: 'Open Room Checks',
            targetTab: 'bookings',
          },
          {
            step: '02',
            title: 'Assign PMS Refs & Assist Door',
            detail: `${lockedEventsCount} locked event(s) ready for hotel room block reference & guest check-in.`,
            actionLabel: 'View Locked Events',
            targetTab: 'bookings',
          },
          {
            step: '03',
            title: 'Inspect Live Hall Schedule',
            detail: 'Check event dates, hall timings, and clearing buffers across all hotel halls.',
            actionLabel: 'Open Hall Schedule',
            targetTab: 'schedule',
          },
        ];
      case 'cashier':
        return [
          {
            step: '01',
            title: openShift ? 'Shift Drawer Active' : 'Open Cashier Shift',
            detail: openShift
              ? `Opened with ${formatCurrency(openShift.openingFloat, currency)} float.`
              : 'Open your cashier shift before logging or verifying cash/POS slips.',
            actionLabel: 'Go to Shifts',
            targetTab: 'payments',
          },
          {
            step: '02',
            title: 'Verify Transfers & POS Slips',
            detail: `${pendingVerificationCount} pending payment slip(s) awaiting receipt issuance.`,
            actionLabel: 'Verify Payments',
            targetTab: 'payments',
          },
          {
            step: '03',
            title: 'Track My Activity & Close Shift',
            detail: 'Review receipts issued by your account and close daily shift cash-up.',
            actionLabel: 'My Activity Log',
            targetTab: 'setup',
          },
        ];
      case 'booking_officer':
        return [
          {
            step: '01',
            title: 'Check Hall Schedule & Availability',
            detail: 'Verify open slots and 2-hour turnaround buffers before promising a hall.',
            actionLabel: 'Open Hall Schedule',
            targetTab: 'schedule',
          },
          {
            step: '02',
            title: 'Manage Your Bookings & 48h Holds',
            detail: `${activeHolds.length} held booking(s) awaiting 50% deposit lock.`,
            actionLabel: 'Open My Bookings',
            targetTab: 'bookings',
          },
          {
            step: '03',
            title: 'Resolve Rooms & Waitlist Alerts',
            detail: `${partialDecisionCount} partial room decision(s) · ${notifiedWaitlist.length} waitlist alert(s).`,
            actionLabel: 'Handle Decisions',
            targetTab: 'bookings',
          },
        ];
      case 'operations':
        return [
          {
            step: '01',
            title: 'Confirm Catering & BEO Orders',
            detail: `${activeCateringOrdersCount} banquet catering order(s) active in kitchen pipeline.`,
            actionLabel: 'Open Event Ops',
            targetTab: 'bookings',
          },
          {
            step: '02',
            title: 'Run Guest Lists & Door Check-In',
            detail: `${lockedEventsCount} locked event(s) available for guest check-in and equipment tracking.`,
            actionLabel: 'Manage Events',
            targetTab: 'bookings',
          },
          {
            step: '03',
            title: 'Monitor Hall Clearing Windows',
            detail: 'Coordinate setup & 2-hour turnaround gaps on the live Hall Schedule.',
            actionLabel: 'Open Hall Schedule',
            targetTab: 'schedule',
          },
        ];
      case 'sys_admin':
        return [
          {
            step: '01',
            title: 'Venue Maintenance & Pictures',
            detail: `${state.maintenanceBlocks.length} maintenance block(s) · ${outOfServiceHallsCount} hall(s) offline.`,
            actionLabel: 'Manage Venues',
            targetTab: 'setup',
          },
          {
            step: '02',
            title: 'Unlock Accounts & Issue Reset Codes',
            detail: `${lockedAccountsCount} locked staff account(s) needing security review.`,
            actionLabel: 'Security Console',
            targetTab: 'setup',
          },
          {
            step: '03',
            title: 'Resolve Diagnostics & Hall Schedule',
            detail: `${openSystemErrorsCount} open diagnostic incident(s) tracked across the platform.`,
            actionLabel: 'View Diagnostics',
            targetTab: 'setup',
          },
        ];
      default:
        return [
          {
            step: '01',
            title: 'Approve Bookings & Verify New Staff',
            detail: `${pendingApprovals.length} booking approval(s) · ${pendingAccountsCount} new account(s).`,
            actionLabel: 'Review Queue',
            targetTab: 'bookings',
          },
          {
            step: '02',
            title: 'Oversee Ledger & Cashier Shifts',
            detail: `${pendingVerificationCount} unverified slip(s) across hotel payment ledger.`,
            actionLabel: 'Open Ledger',
            targetTab: 'payments',
          },
          {
            step: '03',
            title: 'Inspect Reports & Full Audit Log',
            detail: 'Review hall revenue analytics, CSV exports, and complete platform audit.',
            actionLabel: 'Open Reports',
            targetTab: 'reports',
          },
        ];
    }
  })();

  const workspaceShortcuts: {
    title: string;
    subtitle: string;
    tab: 'schedule' | 'bookings' | 'payments' | 'reports' | 'setup';
    icon: React.ReactNode;
    show: boolean;
  }[] = [
    {
      title: 'Live Hall Schedule & Turnaround Grid',
      subtitle: 'Inspect hall dates, active timings, maintenance holds, and 2-hour clearing windows',
      tab: 'schedule',
      icon: <CalendarDays className="w-4 h-4 text-[#C89B3C] shrink-0" />,
      show: true,
    },
    {
      title:
        role === 'front_desk'
          ? 'Room Checks & PMS Verification Desk'
          : role === 'operations'
          ? 'Event Catering, Equipment & Door Check-In'
          : 'My Bookings & Client Waitlist',
      subtitle:
        role === 'front_desk'
          ? `${pendingRoomChecks.length} booking(s) pending room count & nightly ₦ rate verification`
          : role === 'operations'
          ? `${activeCateringOrdersCount} catering order(s) · ${lockedEventsCount} locked event(s)`
          : `${activeBookings.length} booking(s) assigned to your account`,
      tab: 'bookings',
      icon: <ClipboardCheck className="w-4 h-4 text-[#0B1F3A] shrink-0" />,
      show: showBookingsDesk,
    },
    {
      title: 'Cashier Payment Ledger & Shifts',
      subtitle: `${pendingVerificationCount} pending slip(s) · ${openShift ? 'Shift open' : 'No active shift'}`,
      tab: 'payments',
      icon: <CreditCard className="w-4 h-4 text-[#C89B3C] shrink-0" />,
      show: showPaymentsLedger,
    },
    {
      title: isSysAdmin ? 'Maintenance, Security & Diagnostics' : 'My Account Activity Log',
      subtitle: isSysAdmin
        ? `${state.maintenanceBlocks.length} maintenance block(s) · ${lockedAccountsCount} locked account(s)`
        : 'View actions recorded strictly under your staff login',
      tab: 'setup',
      icon: isSysAdmin ? (
        <Wrench className="w-4 h-4 text-[#C89B3C] shrink-0" />
      ) : (
        <ShieldAlert className="w-4 h-4 text-[#C89B3C] shrink-0" />
      ),
      show: true,
    },
  ];

  return (
    <div className="space-y-8 scene-3d">
      {/* Elevated Exclusive Serene Hotel Abuja Architectural Header */}
      <div className="bg-[#0B1F3A] text-white rounded-2xl p-6 sm:p-8 border border-[#C89B3C]/35 depth-layer-2 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 w-64 h-64 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
        />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4AF37]">
              {ROLE_LABELS[role]} Console · {state.profile.hotelName}
            </p>
            <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
              {headerTitle}
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl">
              {state.profile.address} · {state.profile.phone}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canCreateBooking(role) && (
              <button
                type="button"
                onClick={onNewBooking}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C89B3C] hover:bg-[#D4AF37] text-[#0B1F3A] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                New Hall Booking
              </button>
            )}
            {role === 'front_desk' && (
              <button
                type="button"
                onClick={() => onNavigateTab('bookings')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C89B3C] hover:bg-[#D4AF37] text-[#0B1F3A] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <Hotel className="w-4 h-4" />
                Verify Rooms ({pendingRoomChecks.length})
              </button>
            )}
            {role === 'cashier' && (
              <button
                type="button"
                onClick={() => onNavigateTab('payments')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C89B3C] hover:bg-[#D4AF37] text-[#0B1F3A] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <CreditCard className="w-4 h-4" />
                Open Cashier Desk
              </button>
            )}
            {role === 'operations' && (
              <button
                type="button"
                onClick={() => onNavigateTab('bookings')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C89B3C] hover:bg-[#D4AF37] text-[#0B1F3A] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <ChefHat className="w-4 h-4" />
                Event Ops & Guests
              </button>
            )}
            {canMaintain && (
              <button
                type="button"
                onClick={() => onNavigateTab('setup')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C89B3C] hover:bg-[#D4AF37] text-[#0B1F3A] text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-sm"
              >
                <Wrench className="w-4 h-4" />
                Venue Maintenance & Security
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateTab('schedule')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white border border-white/20 text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <CalendarDays className="w-4 h-4 text-[#D4AF37]" />
              Hall Schedule
            </button>
          </div>
        </div>
      </div>

      {/* Guided Role Workflow: What To Do Next */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#0B1F3A]">
              What To Do Next · {ROLE_LABELS[role]} Workflow
            </h2>
            <p className="text-xs text-slate-500">
              Follow these role-specific steps in order — click any step to jump straight into that desk.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {workflowSteps.map((ws) => (
            <button
              key={ws.step}
              type="button"
              onClick={() => onNavigateTab(ws.targetTab)}
              className="text-left p-5 bg-white border border-slate-200 hover:border-[#C89B3C] rounded-xl transition-all flex flex-col justify-between gap-3 depth-layer-1 group"
            >
              <div className="space-y-1.5">
                <span className="inline-block font-mono text-[11px] font-bold text-[#C89B3C] tracking-wider">
                  STEP {ws.step}
                </span>
                <p className="text-sm font-semibold text-[#0B1F3A] group-hover:text-[#13294B]">
                  {ws.title}
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">{ws.detail}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0B1F3A] group-hover:text-[#C89B3C]">
                {ws.actionLabel}
                <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Role-Specific Governance Alerts */}
      {isManagerVerifier && pendingAccountsCount > 0 && (
        <div className="p-4 bg-[#FAF6EC] border border-[#C89B3C]/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 depth-layer-1">
          <div className="flex items-center gap-3">
            <UserCheck className="w-5 h-5 text-[#C89B3C] shrink-0" />
            <div>
              <p className="text-sm font-semibold text-[#0B1F3A]">
                {pendingAccountsCount} Indoor Staff Account(s) Awaiting Manager Verification
              </p>
              <p className="text-xs text-slate-600">
                New staff self-registrations cannot sign in until verified and activated by the Manager.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('setup')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
          >
            Verify Accounts
            <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
          </button>
        </div>
      )}

      {isSysAdmin && (lockedAccountsCount > 0 || openSystemErrorsCount > 0) && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 depth-layer-1">
          <div className="flex items-center gap-3">
            <AlertOctagon className="w-5 h-5 text-red-700 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-950">
                System Admin Attention: {lockedAccountsCount} Locked Account(s) · {openSystemErrorsCount} Open Diagnostic Error(s)
              </p>
              <p className="text-xs text-red-800">
                Inspect locked staff logins and resolve open application diagnostics inside Maintenance & Security.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('setup')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
          >
            Open Security Console
            <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
          </button>
        </div>
      )}

      {/* 4-Column Interactive 3D KPI Tiles (Strictly Role-Isolated — Zero Cross-Role Financial Leakage) */}
      {isSysAdmin ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Venue Maintenance Holds</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {state.maintenanceBlocks.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {outOfServiceHallsCount} hall(s) marked Out of Service
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Locked Staff Accounts</p>
            <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${lockedAccountsCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
              {lockedAccountsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              Auto-locked after 5 failed attempts
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Open System Diagnostics</p>
            <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${openSystemErrorsCount > 0 ? 'text-amber-700' : 'text-[#0B1F3A]'}`}>
              {openSystemErrorsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {resolvedSystemErrorsCount} resolved incident(s)
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Active Hotel Venues</p>
            <p className="mt-2 text-2xl font-bold text-[#C89B3C] font-mono tabular-nums">
              {activeHallsCount}/{state.halls.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {activeStaffCount} active staff logins
            </p>
          </TiltCard3D>
        </div>
      ) : role === 'front_desk' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Pending Room Checks</p>
            <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${pendingRoomChecks.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {pendingRoomChecks.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Counts & ₦ room rates awaiting desk
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Verified Room Blocks</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {verifiedRoomBlocksCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Confirmed & priced room lines
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Locked Events (PMS / Door)</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {lockedEventsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Ready for PMS ref & guest door check-in
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Active Hotel Venues</p>
            <p className="mt-2 text-2xl font-bold text-[#C89B3C] font-mono tabular-nums">
              {activeHallsCount}/{state.halls.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hall schedule stays live across desks
            </p>
          </TiltCard3D>
        </div>
      ) : role === 'operations' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Locked Events Ready</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {lockedEventsCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Confirmed banquet & floor events
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Active Catering Orders</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {activeCateringOrdersCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hotel menus requiring kitchen status
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Equipment Catalog</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {state.equipment.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Tracked AV, audio & staging items
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Active Hotel Venues</p>
            <p className="mt-2 text-2xl font-bold text-[#C89B3C] font-mono tabular-nums">
              {activeHallsCount}/{state.halls.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {outOfServiceHallsCount} hall(s) under maintenance
            </p>
          </TiltCard3D>
        </div>
      ) : role === 'cashier' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Active Shift Float</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {openShift ? formatCurrency(openShift.openingFloat, currency) : 'Shift Closed'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {openShift ? `Opened by ${openShift.cashierName}` : 'Open shift in Ledger tab'}
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Pending Verification Slips</p>
            <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${pendingVerificationCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
              {pendingVerificationCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Bank transfer & POS awaiting confirmation
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Verified Receipts Total</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {formatCurrency(verifiedCollected, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Receipts posted to immutable ledger
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Cashier Queue Tasks</p>
            <p className="mt-2 text-2xl font-bold text-[#C89B3C] font-mono tabular-nums">
              {roleTasks.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Assigned cashier follow-ups
            </p>
          </TiltCard3D>
        </div>
      ) : role === 'booking_officer' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">My Active Bookings</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {activeBookings.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Assigned to your officer desk
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">My 48h Proforma Holds</p>
            <p className="mt-2 text-2xl font-bold text-[#C89B3C] font-mono tabular-nums">
              {activeHolds.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Awaiting 50% deposit lock
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Partial Room Decisions</p>
            <p className={`mt-2 text-2xl font-bold font-mono tabular-nums ${partialDecisionCount > 0 ? 'text-amber-700' : 'text-[#0B1F3A]'}`}>
              {partialDecisionCount}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Accept reduced block or release hold
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Waitlist Alerts Ready</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {notifiedWaitlist.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Freed slots ready for outreach
            </p>
          </TiltCard3D>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Active Pipeline Value</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {formatCurrency(totalContracted, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {activeBookings.length} active booking(s)
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Verified Receipts Total</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {formatCurrency(verifiedCollected, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {pendingVerificationCount} payment(s) awaiting verification
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Role Action Queue</p>
            <p className="mt-2 text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums">
              {roleTasks.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {pendingApprovals.length} manager approvals · {pendingRoomChecks.length} room checks
            </p>
          </TiltCard3D>
          <TiltCard3D maxTilt={5} className="p-5 bg-white border border-slate-200 rounded-xl depth-layer-1">
            <p className="text-xs font-medium text-slate-500">Unpaid 48h Holds</p>
            <p className="mt-2 text-2xl font-bold text-[#C89B3C] font-mono tabular-nums">
              {activeHolds.length}
            </p>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {notifiedWaitlist.length} waitlist alert(s) triggered
            </p>
          </TiltCard3D>
        </div>
      )}

      {/* Main 2-Column Operational Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Priority Role Queue & Upcoming Events */}
        <div className="lg:col-span-7 space-y-6">
          {/* Role Priority Queue */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden depth-layer-1">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  Priority Action Queue
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Items requiring attention for {ROLE_LABELS[role]}
                </p>
              </div>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                {roleTasks.length} open
              </span>
            </div>

            {roleTasks.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-[#0B1F3A]">No pending items in your queue</p>
                <p className="text-xs text-slate-500 mt-1">
                  All assigned tasks for your role are cleared.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {roleTasks.map((task) => {
                  const booking = state.bookings.find((b) => b.id === task.bookingId);
                  const isSetupTask =
                    task.type === 'account_verification' ||
                    task.type === 'account_locked' ||
                    task.type === 'system_error';
                  const isPaymentTask =
                    task.roleTarget === 'cashier' || task.type === 'overdue_collection';
                  return (
                    <div
                      key={task.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono text-[#0B1F3A]">{task.bookingId}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ROLE_LABELS[task.roleTarget]}</span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-[#0B1F3A] truncate">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-600">{task.description}</p>
                      </div>
                      {booking && showBookingsDesk ? (
                        <button
                          type="button"
                          onClick={() => onOpenBooking(booking)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#0B1F3A] bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                        >
                          Open Booking
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : isPaymentTask && showPaymentsLedger ? (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('payments')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#13294B] rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                        >
                          Open Ledger
                          <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </button>
                      ) : isSetupTask ? (
                        <button
                          type="button"
                          onClick={() => onNavigateTab('setup')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#13294B] rounded-md transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                        >
                          Open Console
                          <ArrowRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Upcoming & Active Events Table */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden depth-layer-1">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  {isSysAdmin
                    ? 'Scheduled Hall Occupancy (Schedule View)'
                    : role === 'front_desk'
                    ? 'Upcoming Events Requiring Room & Door Desk'
                    : 'Upcoming Confirmed & Held Events'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSysAdmin
                    ? 'Dates and halls booked on the hotel calendar — financial and client details are hidden'
                    : role === 'front_desk'
                    ? 'Inspect room blocks, verify nightly rates, and assist event door check-in'
                    : 'Click any booking to inspect details for your department'}
                </p>
              </div>
              {showBookingsDesk && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('bookings')}
                  className="text-xs font-semibold text-[#0B1F3A] hover:text-[#C89B3C] underline underline-offset-4 whitespace-nowrap shrink-0"
                >
                  {role === 'front_desk'
                    ? 'Room Checks'
                    : role === 'operations'
                    ? 'Event Ops'
                    : 'View All Bookings'}
                </button>
              )}
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No upcoming active events found for your desk.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {upcomingEvents.map((booking) => {
                  const hall = state.halls.find((h) => h.id === booking.hallId);
                  const client = state.clients.find((c) => c.id === booking.clientId);
                  const firstSes = booking.sessions[0];
                  const meta = BOOKING_STATUS_META[booking.status];
                  const checkedInGuests = booking.guests.filter((g) => g.checkedIn).length;
                  const pendingRoomLineCount = booking.roomLines.filter(
                    (rl) => rl.verificationStatus === 'pending'
                  ).length;

                  return (
                    <button
                      key={booking.id}
                      type="button"
                      onClick={() =>
                        isSysAdmin ? onNavigateTab('schedule') : onOpenBooking(booking)
                      }
                      className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          <span className="font-mono font-medium text-[#0B1F3A]">{booking.id}</span>
                          <span aria-hidden="true">·</span>
                          <span>{booking.eventType}</span>
                          <span aria-hidden="true">·</span>
                          <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
                        </div>
                        <p className="mt-1 text-sm font-semibold text-[#0B1F3A] truncate">
                          {booking.eventTitle}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                          <span>{hall?.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatDate(firstSes?.date)} ({firstSes?.startTime}–{firstSes?.endTime})
                          </span>
                          {client?.name && !isSysAdmin && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{client.name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-left sm:text-right shrink-0">
                        {showBookingFinancials ? (
                          <p className="text-sm font-semibold text-[#0B1F3A] font-mono tabular-nums">
                            {formatCurrency(booking.grandTotal, currency)}
                          </p>
                        ) : role === 'front_desk' ? (
                          <p
                            className={`text-xs font-semibold tabular-nums ${
                              pendingRoomLineCount > 0 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {booking.roomLines.length === 0
                              ? 'Hall Event Only'
                              : pendingRoomLineCount > 0
                              ? `${pendingRoomLineCount} Room Check(s) Pending`
                              : `${booking.roomLines.length} Room Block(s) Verified`}
                          </p>
                        ) : (
                          <p className="text-xs font-semibold text-[#0B1F3A] tabular-nums">
                            {firstSes?.expectedGuests || 0} guests expected
                          </p>
                        )}

                        <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                          {isSysAdmin
                            ? 'Schedule slot active'
                            : role === 'front_desk'
                            ? booking.guests.length > 0
                              ? `${checkedInGuests}/${booking.guests.length} checked in`
                              : `${firstSes?.expectedGuests || 0} expected`
                            : `${
                                !booking.catering
                                  ? 'Hall only'
                                  : booking.catering.mode === 'external'
                                  ? 'External catering'
                                  : `${booking.catering.kitchenStatus} catering`
                              } · ${
                                booking.guests.length > 0
                                  ? `${checkedInGuests}/${booking.guests.length} checked in`
                                  : `${firstSes?.expectedGuests || 0} expected`
                              }`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right 5 Cols: Role Quick Modules & Scoped Audit Preview */}
        <div className="lg:col-span-5 space-y-6">
          {isHigherAuth ? (
            <section className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 depth-layer-1">
              <div className="px-5 py-4">
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  Department Coordination Pulse
                </h2>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('payments')}
                className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-[#C89B3C] shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#0B1F3A]">Cashier Ledger & Shift</p>
                    <p className="text-xs text-slate-500">
                      {pendingVerificationCount} payment(s) pending bank/POS check
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Hotel className="w-4 h-4 text-[#0B1F3A] shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#0B1F3A]">Front Desk Room Blocks</p>
                    <p className="text-xs text-slate-500">
                      {pendingRoomChecks.length} booking(s) awaiting room count & rate check
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-700 tabular-nums">
                  {pendingRoomChecks.length}
                </span>
              </div>

              <div className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ChefHat className="w-4 h-4 text-[#0B1F3A] shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#0B1F3A]">Catering Kitchen Orders</p>
                    <p className="text-xs text-slate-500">
                      {activeCateringOrdersCount} active banquet menus scheduled
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-700 tabular-nums">
                  {activeBookings.filter((b) => Boolean(b.catering)).length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('schedule')}
                className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Wrench className="w-4 h-4 text-[#C89B3C] shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#0B1F3A]">Venue Maintenance & Status</p>
                    <p className="text-xs text-slate-500">
                      {state.maintenanceBlocks.length} scheduled block(s) · {outOfServiceHallsCount} out of service
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => onNavigateTab('setup')}
                className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-[#C89B3C] shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-[#0B1F3A]">Security, Accounts & Diagnostics</p>
                    <p className="text-xs text-slate-500">
                      {pendingAccountsCount} Manager approvals · {lockedAccountsCount} SysAdmin locks · {openSystemErrorsCount} errors
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </button>

              {showFullReports && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('reports')}
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-[#0B1F3A] shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-[#0B1F3A]">Analytics & Financial Summary</p>
                      <p className="text-xs text-slate-500">
                        Real-time hall utilization, receipts, and CSV exports
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              )}
            </section>
          ) : (
            <section className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200 depth-layer-1">
              <div className="px-5 py-4">
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  My Desk Shortcuts
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Modules enabled for {ROLE_LABELS[role]}
                </p>
              </div>
              {workspaceShortcuts
                .filter((s) => s.show)
                .map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => onNavigateTab(item.tab)}
                    className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.icon}
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[#0B1F3A] truncate">{item.title}</p>
                        <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </button>
                ))}
            </section>
          )}

          {/* Scoped Audit Preview */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden depth-layer-1">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#C89B3C]" />
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  {isHigherAuth
                    ? 'Recent Platform Audit & Control Events'
                    : isSysAdmin
                    ? 'Security & Maintenance Audit'
                    : 'My Recent Account Activity'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('setup')}
                className="text-xs font-semibold text-[#0B1F3A] hover:text-[#C89B3C] underline underline-offset-4 whitespace-nowrap"
              >
                {isHigherAuth ? 'Full Log' : isSysAdmin ? 'Security Log' : 'My Activity'}
              </button>
            </div>
            {state.auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No actions recorded under your account yet. Actions you perform will appear here.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {state.auditLogs.slice(0, 4).map((log) => (
                  <div key={log.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span className="font-medium text-[#0B1F3A]">{log.actorName}</span>
                      <span className="font-mono tabular-nums">{formatDateTime(log.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-[#0B1F3A]">
                      {log.action.replace(/_/g, ' ')} ·{' '}
                      <span className="font-mono text-slate-600">{log.targetId}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* 3D Interactive Event Halls Showcase */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              Registered Hotel Event Halls
            </h2>
            <p className="text-xs text-slate-500">
              {showBookingFinancials
                ? 'Inspect theatre capacities, turnaround buffers, and daily Naira venue tariffs'
                : 'Inspect theatre capacities and turnaround buffers across hotel halls'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {state.halls.map((hall) => (
            <TiltCard3D
              key={hall.id}
              maxTilt={6}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col depth-layer-1"
            >
              <div className="aspect-video bg-slate-100 relative overflow-hidden">
                {failedImages[hall.id] ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 p-4 text-center">
                    <Building2 className="w-6 h-6 mb-1.5" />
                    <span className="text-xs font-medium">{hall.name}</span>
                  </div>
                ) : (
                  <img
                    src={hall.imageUrl}
                    alt={hall.name}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedImages((prev) => ({ ...prev, [hall.id]: true }))}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[#0B1F3A]">{hall.name}</h3>
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">{hall.description}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500 tabular-nums">
                    Up to {hall.capacityTheatre} Theatre
                  </span>
                  {showBookingFinancials ? (
                    <span className="font-mono font-semibold text-[#C89B3C] tabular-nums">
                      {formatCurrency(hall.baseDayRate, currency)}/day
                    </span>
                  ) : (
                    <span className="font-mono font-medium text-slate-600 tabular-nums">
                      {Math.round(hall.bufferMinutes / 60)}h Turnaround
                    </span>
                  )}
                </div>
              </div>
            </TiltCard3D>
          ))}
        </div>
      </section>
    </div>
  );
};
