import type { BookingStatus, StaffRole } from '../types';

export function formatCurrency(amount: number, currency = 'NGN'): string {
  const num = Number(amount) || 0;
  if (currency === 'NGN') {
    const formatted = new Intl.NumberFormat('en-NG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
    return `₦${formatted}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatDateTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return isoStr;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const BOOKING_STATUS_META: Record<
  BookingStatus,
  { label: string; textClass: string; dotClass: string }
> = {
  awaiting_room_verification: {
    label: 'Awaiting Room Check',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-600',
  },
  awaiting_manager_approval: {
    label: 'Awaiting Manager Approval',
    textClass: 'text-amber-700',
    dotClass: 'bg-amber-600',
  },
  hold_proforma: {
    label: '48h Hold · Proforma',
    textClass: 'text-sky-700',
    dotClass: 'bg-sky-600',
  },
  locked: {
    label: 'Locked & Confirmed',
    textClass: 'text-emerald-700',
    dotClass: 'bg-emerald-600',
  },
  event_completed: {
    label: 'Event Completed',
    textClass: 'text-indigo-700',
    dotClass: 'bg-indigo-600',
  },
  closed: {
    label: 'Settled & Closed',
    textClass: 'text-slate-600',
    dotClass: 'bg-slate-500',
  },
  cancelled: {
    label: 'Cancelled',
    textClass: 'text-red-700',
    dotClass: 'bg-red-600',
  },
  expired: {
    label: 'Hold Expired',
    textClass: 'text-red-700',
    dotClass: 'bg-red-600',
  },
};

export function canCreateBooking(role: StaffRole): boolean {
  return role === 'manager' || role === 'booking_officer';
}

export function canRecordPayments(role: StaffRole): boolean {
  return role === 'manager' || role === 'cashier';
}

export function canVerifyRooms(role: StaffRole): boolean {
  return role === 'manager' || role === 'front_desk';
}

export function canApproveOrVoid(role: StaffRole): boolean {
  return role === 'manager';
}

export function canChangePricing(role: StaffRole): boolean {
  return role === 'manager';
}

export function canVerifyNewAccounts(role: StaffRole): boolean {
  return role === 'manager';
}

export function canManageStaffLifecycle(role: StaffRole): boolean {
  return role === 'manager';
}

export function canManageMaintenance(role: StaffRole): boolean {
  return role === 'sys_admin';
}

export function canManageVenueMedia(role: StaffRole): boolean {
  return role === 'sys_admin';
}

export function canManageSecurityAndResets(role: StaffRole): boolean {
  return role === 'sys_admin';
}

export function canRunSystemJobsAndRestore(role: StaffRole): boolean {
  return role === 'sys_admin';
}

export function canManageSystemSecurityAndMedia(role: StaffRole): boolean {
  return role === 'sys_admin';
}

export function canManageOperations(role: StaffRole): boolean {
  return role === 'manager' || role === 'operations' || role === 'booking_officer';
}

export function canAccessAdminSetup(role: StaffRole): boolean {
  return role === 'manager' || role === 'sys_admin' || role === 'owner';
}

export function canViewPaymentsLedger(role: StaffRole): boolean {
  return role === 'manager' || role === 'owner' || role === 'cashier';
}

export function canViewFullReports(role: StaffRole): boolean {
  return role === 'manager' || role === 'owner';
}

export function canViewBookingFinancials(role: StaffRole): boolean {
  return (
    role === 'manager' ||
    role === 'owner' ||
    role === 'cashier' ||
    role === 'booking_officer'
  );
}

export function canViewBookingsDesk(role: StaffRole): boolean {
  return role !== 'sys_admin';
}

export function canViewWaitlistAndOverdue(role: StaffRole): boolean {
  return role === 'manager' || role === 'owner' || role === 'booking_officer';
}

export function canViewGuestsTab(role: StaffRole): boolean {
  return (
    role === 'manager' ||
    role === 'owner' ||
    role === 'booking_officer' ||
    role === 'operations' ||
    role === 'front_desk'
  );
}

export function canViewCateringOpsTab(role: StaffRole): boolean {
  return (
    role === 'manager' ||
    role === 'owner' ||
    role === 'booking_officer' ||
    role === 'operations'
  );
}

export function canViewRoomsTab(role: StaffRole): boolean {
  return (
    role === 'manager' ||
    role === 'owner' ||
    role === 'booking_officer' ||
    role === 'front_desk'
  );
}

export function canViewDocsTab(role: StaffRole): boolean {
  return (
    role === 'manager' ||
    role === 'owner' ||
    role === 'booking_officer' ||
    role === 'cashier' ||
    role === 'operations'
  );
}

export function isHigherAuthority(role: StaffRole): boolean {
  return role === 'manager' || role === 'owner';
}

