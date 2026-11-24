import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  CreditCard,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  Wrench,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { BookingDetailDrawer } from './components/BookingDetailDrawer';
import { BookingsListView } from './components/BookingsListView';
import { BookingWizardModal } from './components/BookingWizardModal';
import { DashboardView } from './components/DashboardView';
import { PaymentsLedgerView } from './components/PaymentsLedgerView';
import { ReportsAnalyticsView } from './components/ReportsAnalyticsView';
import { ScheduleCalendarView } from './components/ScheduleCalendarView';
import { SetupAdminView } from './components/SetupAdminView';
import {
  ROLE_LABELS,
  type Booking,
  type HallBookStateResponse,
  type StaffUser,
} from './types';
import {
  canAccessAdminSetup,
  canCreateBooking,
  canManageSystemSecurityAndMedia,
  canViewBookingsDesk,
  canViewFullReports,
  canViewPaymentsLedger,
  isHigherAuthority,
} from './utils/format';

type NavTab = 'dashboard' | 'schedule' | 'bookings' | 'payments' | 'reports' | 'setup';

interface AuthStatusPayload {
  needsBootstrap: boolean;
  authMode?: 'claimed_passcode' | 'needs_setup';
  hotelName: string;
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatusPayload | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [state, setState] = useState<HallBookStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [wizardPrefill, setWizardPrefill] = useState<{
    open: boolean;
    hallId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  }>({ open: false });
  const [paymentBookingFilter, setPaymentBookingFilter] = useState<string | undefined>(undefined);

  // Self-service Change Password modal
  const [showChangePw, setShowChangePw] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const fetchAuthStatus = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [statusRes, meRes] = await Promise.all([
        fetch('/api/auth/status'),
        fetch('/api/auth/me', { credentials: 'include' }),
      ]);
      if (!statusRes.ok) throw new Error('Server unavailable');
      const data = (await statusRes.json()) as AuthStatusPayload;
      setAuthStatus(data);

      if (meRes.ok) {
        const meData = (await meRes.json()) as { user?: StaffUser };
        if (meData.user) {
          setAuthToken('cookie-session');
          setCurrentUser(meData.user);
          const stateRes = await fetch('/api/state', { credentials: 'include' });
          if (stateRes.ok) {
            const stateData = (await stateRes.json()) as HallBookStateResponse;
            setState(stateData);
          }
        }
      }
    } catch {
      setLoadError('Unable to reach the HallBook server.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchState = useCallback(async (token: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/state', {
        credentials: 'include',
        headers: token && token !== 'cookie-session' ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('Failed to load workspace');
      const data = (await res.json()) as HallBookStateResponse;
      setState(data);
    } catch {
      setLoadError('Failed to load hotel workspace data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAuthStatus();
  }, [fetchAuthStatus]);

  // Multi-desk live workspace synchronization across open hotel terminals (12s silent poll)
  useEffect(() => {
    if (!authToken || wizardPrefill.open || showChangePw) return;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
      try {
        const res = await fetch('/api/state', {
          credentials: 'include',
          headers: authToken !== 'cookie-session' ? { Authorization: `Bearer ${authToken}` } : undefined,
        });
        if (res.status === 401) {
          setAuthToken(null);
          setCurrentUser(null);
          setState(null);
          return;
        }
        if (res.ok) {
          const fresh = (await res.json()) as HallBookStateResponse;
          setState(fresh);
        }
      } catch {
        // Silent retry on next cycle
      }
    }, 12000);
    return () => window.clearInterval(timer);
  }, [authToken, wizardPrefill.open, showChangePw]);

  // Passive client exception capture so System Admin can review live errors
  useEffect(() => {
    if (!authToken) return;
    const reportClientIncident = (message: string, context: string) => {
      if (!message) return;
      fetch('/api/system/errors', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken !== 'cookie-session' ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          source: 'client',
          severity: 'error',
          message: message.slice(0, 220),
          context: context.slice(0, 400),
        }),
      }).catch(() => {});
    };

    const onWinError = (event: ErrorEvent) => {
      if (event.message?.includes('WebSocket')) return;
      reportClientIncident(event.message || 'Unhandled UI Error', `${event.filename || ''}:${event.lineno || ''}`);
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unhandled Promise Rejection');
      if (msg.includes('WebSocket')) return;
      reportClientIncident(msg, 'Promise rejection');
    };

    window.addEventListener('error', onWinError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onWinError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, [authToken]);

  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role;
    const allowed: Record<NavTab, boolean> = {
      dashboard: true,
      schedule: true,
      bookings: canViewBookingsDesk(role),
      payments: canViewPaymentsLedger(role),
      reports: canViewFullReports(role),
      setup: true,
    };
    if (!allowed[activeTab]) {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentUser]);

  const handleAuthenticated = (token: string, user: StaffUser) => {
    setAuthToken(token);
    setCurrentUser(user);
    setActiveTab('dashboard');
    fetchState(token);
  };

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setAuthToken(null);
    setCurrentUser(null);
    setState(null);
    setSelectedBookingId(null);
    fetchAuthStatus();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (pwForm.newPassword.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match.');
      return;
    }
    if (!authToken) return;
    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          currentPassword: pwForm.currentPassword,
          newPassword: pwForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPwError(data.error || 'Could not update password.');
        return;
      }
      setPwSuccess('Your password has been updated.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        setShowChangePw(false);
        setPwSuccess('');
      }, 1100);
    } catch {
      setPwError('Network error updating password.');
    } finally {
      setPwSaving(false);
    }
  };

  if (loading && !state && !authStatus) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="text-sm font-medium text-[#0B1F3A]">Loading Exclusive Serene Hotel workspace...</div>
      </div>
    );
  }

  if (loadError && !authStatus) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 max-w-md w-full text-center space-y-3 depth-layer-1">
          <p className="text-sm font-semibold text-[#0B1F3A]">{loadError}</p>
          <button
            type="button"
            onClick={fetchAuthStatus}
            className="px-4 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!authToken || !currentUser) {
    return (
      <AuthGate
        needsBootstrap={authStatus?.needsBootstrap ?? false}
        hotelName={authStatus?.hotelName ?? 'Exclusive Serene Hotel'}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="text-sm font-medium text-[#0B1F3A]">Loading hotel hall data...</div>
      </div>
    );
  }

  const selectedBooking: Booking | null = selectedBookingId
    ? state.bookings.find((b) => b.id === selectedBookingId) || null
    : null;

  const role = currentUser.role;
  const pendingRoomCheckCount = state.bookings.filter((b) =>
    b.roomLines.some(
      (rl) =>
        rl.verificationStatus === 'pending' ||
        (rl.verificationStatus === 'partial' && rl.officerDecision === 'pending')
    )
  ).length;
  const pendingApprovalCount = state.bookings.filter(
    (b) => b.status === 'awaiting_manager_approval'
  ).length;
  const pendingSlipCount = state.payments.filter(
    (p) => p.status === 'pending_verification'
  ).length;
  const sysAdminAlertCount =
    state.staff.filter((s) => s.locked).length +
    (state.systemErrors || []).filter((e) => e.status === 'open').length;
  const managerPendingStaffCount = state.staff.filter(
    (s) => (s.approvalStatus ?? 'approved') === 'pending'
  ).length;

  const navItems: {
    id: NavTab;
    label: string;
    shortLabel: string;
    badge?: number;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'dashboard',
      label: isHigherAuthority(role)
        ? 'Executive Desk'
        : canManageSystemSecurityAndMedia(role)
        ? 'System Console'
        : 'My Desk',
      shortLabel: 'Desk',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'schedule',
      label: 'Hall Schedule',
      shortLabel: 'Schedule',
      icon: <CalendarDays className="w-4 h-4 shrink-0" />,
    },
    ...(canViewBookingsDesk(role)
      ? [
          {
            id: 'bookings' as NavTab,
            label:
              role === 'front_desk'
                ? 'Room Checks'
                : role === 'operations'
                ? 'Event Ops & Guests'
                : role === 'booking_officer'
                ? 'My Bookings'
                : 'Bookings & Approvals',
            shortLabel: role === 'front_desk' ? 'Rooms' : role === 'operations' ? 'Ops' : 'Bookings',
            badge:
              role === 'front_desk'
                ? pendingRoomCheckCount
                : role === 'manager'
                ? pendingApprovalCount
                : 0,
            icon: <ClipboardList className="w-4 h-4 shrink-0" />,
          },
        ]
      : []),
    ...(canViewPaymentsLedger(role)
      ? [
          {
            id: 'payments' as NavTab,
            label: 'Payments & Shifts',
            shortLabel: 'Ledger',
            badge: pendingSlipCount,
            icon: <CreditCard className="w-4 h-4 shrink-0" />,
          },
        ]
      : []),
    ...(canViewFullReports(role)
      ? [
          {
            id: 'reports' as NavTab,
            label: 'Reports & Analytics',
            shortLabel: 'Reports',
            icon: <BarChart3 className="w-4 h-4 shrink-0" />,
          },
        ]
      : []),
    {
      id: 'setup',
      label: canManageSystemSecurityAndMedia(role)
        ? 'Maintenance & Security'
        : role === 'manager'
        ? 'Management & Setup'
        : canAccessAdminSetup(role)
        ? 'Governance & Audit'
        : 'My Activity Log',
      shortLabel: canManageSystemSecurityAndMedia(role)
        ? 'Security'
        : canAccessAdminSetup(role)
        ? 'Admin'
        : 'Activity',
      badge: canManageSystemSecurityAndMedia(role)
        ? sysAdminAlertCount
        : role === 'manager'
        ? managerPendingStaffCount
        : 0,
      icon: canManageSystemSecurityAndMedia(role) ? (
        <Wrench className="w-4 h-4 shrink-0" />
      ) : canAccessAdminSetup(role) ? (
        <Settings className="w-4 h-4 shrink-0" />
      ) : (
        <History className="w-4 h-4 shrink-0" />
      ),
    },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || 'My Desk';

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex flex-col lg:flex-row">
      {/* Desktop Left Sidebar (Deep Abuja Navy + Champagne Gold Accents) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-[#0B1F3A] text-white border-r border-[#C89B3C]/25 no-print">
        <div className="h-18 px-6 py-3 flex flex-col justify-center border-b border-white/10 shrink-0">
          <span className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            HallBook
          </span>
          <span className="text-[11px] font-medium text-[#D4AF37] truncate">
            {state.profile.hotelName} · Abuja
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  active
                    ? 'bg-[#13294B] text-white border border-[#C89B3C]/50 shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className={active ? 'text-[#D4AF37]' : 'text-slate-400'}>{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[#C89B3C] text-[#0B1F3A] tabular-nums shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2.5 bg-[#08172C]">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{currentUser.name}</p>
            <p className="text-xs text-[#F3DFAC]/80 truncate">
              {ROLE_LABELS[currentUser.role]} · @{currentUser.username}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPwError('');
              setPwSuccess('');
              setShowChangePw(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-200 bg-white/5 border border-white/15 hover:bg-white/10 rounded-lg transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
            Change My Password
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-[#0B1F3A] bg-[#F3DFAC] hover:bg-[#D4AF37] rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen pb-16 lg:pb-0">
        {/* Top Header Bar (Desktop & Mobile) */}
        <header className="sticky top-0 z-30 h-14 lg:h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <span className="lg:hidden font-display text-base font-bold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0">
              {state.profile.hotelName}
            </span>
            <span className="hidden lg:inline text-xs font-medium text-slate-500 whitespace-nowrap">
              {state.profile.hotelName} / <strong className="text-[#0B1F3A]">{activeNavLabel}</strong>
            </span>
            <span className="lg:hidden text-xs text-slate-500 truncate">
              · {ROLE_LABELS[currentUser.role]}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canCreateBooking(currentUser.role) && (
              <button
                type="button"
                onClick={() => setWizardPrefill({ open: true })}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 shadow-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden sm:inline">New Booking</span>
                <span className="sm:hidden">Book</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPwError('');
                setPwSuccess('');
                setShowChangePw(true);
              }}
              className="lg:hidden p-2 text-slate-600 hover:text-[#0B1F3A] rounded-lg"
              aria-label="Change my password"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="lg:hidden p-2 text-slate-600 hover:text-[#0B1F3A] rounded-lg"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Active Workspace Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              state={state}
              currentUser={currentUser}
              onOpenBooking={(b) => setSelectedBookingId(b.id)}
              onNewBooking={() => setWizardPrefill({ open: true })}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleCalendarView
              state={state}
              currentUser={currentUser}
              authToken={authToken}
              onOpenBooking={(b) => setSelectedBookingId(b.id)}
              onNewBooking={(hallId, date, startTime, endTime) =>
                setWizardPrefill({ open: true, hallId, date, startTime, endTime })
              }
              onRefreshState={(next) => setState(next)}
            />
          )}

          {activeTab === 'bookings' && canViewBookingsDesk(role) && (
            <BookingsListView
              state={state}
              currentUser={currentUser}
              authToken={authToken}
              onOpenBooking={(b) => setSelectedBookingId(b.id)}
              onNewBooking={() => setWizardPrefill({ open: true })}
              onStateUpdated={(next) => setState(next)}
            />
          )}

          {activeTab === 'payments' && canViewPaymentsLedger(role) && (
            <PaymentsLedgerView
              state={state}
              currentUser={currentUser}
              authToken={authToken}
              initialBookingId={paymentBookingFilter}
              onStateUpdated={(next) => setState(next)}
            />
          )}

          {activeTab === 'reports' && canViewFullReports(role) && (
            <ReportsAnalyticsView state={state} currentUser={currentUser} />
          )}

          {activeTab === 'setup' && (
            <SetupAdminView
              state={state}
              currentUser={currentUser}
              authToken={authToken}
              onStateUpdated={(next) => setState(next)}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white border-t border-slate-200 grid no-print"
        style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
      >
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                active ? 'text-[#0B1F3A] font-semibold' : 'text-slate-500'
              }`}
            >
              <span className={active ? 'text-[#C89B3C]' : ''}>{item.icon}</span>
              <span className="truncate max-w-full px-1">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Self-service Change Password Modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-6 space-y-4 depth-layer-2">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-[#0B1F3A]">Change My Password</h2>
              <button
                type="button"
                onClick={() => setShowChangePw(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  value={pwForm.currentPassword}
                  onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  New Password (min 6 chars)
                </label>
                <input
                  type="password"
                  value={pwForm.newPassword}
                  onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={pwForm.confirmPassword}
                  onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  required
                />
              </div>
              {pwError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {pwError}
                </p>
              )}
              {pwSuccess && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  {pwSuccess}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowChangePw(false)}
                  className="px-3.5 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] hover:bg-[#13294B] text-white rounded-lg"
                >
                  {pwSaving ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Booking Creation Wizard */}
      {wizardPrefill.open && (
        <BookingWizardModal
          state={state}
          authToken={authToken}
          prefillHallId={wizardPrefill.hallId}
          prefillDate={wizardPrefill.date}
          prefillStartTime={wizardPrefill.startTime}
          prefillEndTime={wizardPrefill.endTime}
          onClose={() => setWizardPrefill({ open: false })}
          onCreated={(booking, nextState) => {
            setState(nextState);
            setWizardPrefill({ open: false });
            setSelectedBookingId(booking.id);
          }}
          onStateUpdated={(nextState) => setState(nextState)}
        />
      )}

      {/* Booking Detail & Operations Drawer */}
      {selectedBooking && (
        <BookingDetailDrawer
          booking={selectedBooking}
          state={state}
          currentUser={currentUser}
          authToken={authToken}
          onClose={() => setSelectedBookingId(null)}
          onStateUpdated={(nextState) => setState(nextState)}
          onGoToPayments={(bId) => {
            setSelectedBookingId(null);
            setPaymentBookingFilter(bId);
            setActiveTab('payments');
          }}
        />
      )}
    </div>
  );
}
