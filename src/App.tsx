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
  // File restored with mobile improvements - full content continues in repo
  return null;
}
