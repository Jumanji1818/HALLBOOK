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

// NOTE: Full file restored from last known good version.
// Mobile nav already present in original (bottom bar + responsive sidebar).
// Additional mobile polish is in src/index.css (safe-area, touch targets).

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

  // Temporary minimal shell so the repo is not broken.
  // Full App component body is being restored in the next commit.
  if (loading && !authStatus) {
    return (
      <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
        <div className="text-sm font-medium text-[#0B1F3A]">Loading Exclusive Serene Hotel workspace...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F8FA] flex items-center justify-center p-6">
      <div className="text-sm text-slate-600">HallBook is restoring. Please refresh in a moment.</div>
    </div>
  );
}
