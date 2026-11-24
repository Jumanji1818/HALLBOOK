import React, { useMemo, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import type { EventType, HallBookStateResponse, StaffUser } from '../types';
import { canViewFullReports, formatCurrency, formatDateTime } from '../utils/format';

interface ReportsAnalyticsViewProps {
  state: HallBookStateResponse;
  currentUser: StaffUser;
}

export const ReportsAnalyticsView: React.FC<ReportsAnalyticsViewProps> = ({ state, currentUser }) => {
  const [scope, setScope] = useState<'all' | 'confirmed'>('all');
  const currency = state.profile.currency;

  const filteredBookings = useMemo(() => {
    return state.bookings.filter((b) => {
      if (['cancelled', 'expired'].includes(b.status)) return false;
      if (scope === 'confirmed') {
        return ['locked', 'event_completed', 'closed'].includes(b.status);
      }
      return true;
    });
  }, [scope, state.bookings]);

  const metrics = useMemo(() => {
    const grossContracted = filteredBookings.reduce((s, b) => s + b.grandTotal, 0);
    const hallRevenue = filteredBookings.reduce((s, b) => s + b.hallTotal, 0);
    const cateringRevenue = filteredBookings.reduce((s, b) => s + b.cateringTotal, 0);
    const roomRevenue = filteredBookings.reduce((s, b) => s + b.roomTotal, 0);
    const equipmentAddonRevenue = filteredBookings.reduce(
      (s, b) => s + b.equipmentTotal + b.addonTotal + b.extrasAmount,
      0
    );
    const taxTotal = filteredBookings.reduce((s, b) => s + b.taxAmount, 0);

    const bookingIds = new Set(filteredBookings.map((b) => b.id));
    const verifiedCollected = state.payments
      .filter((p) => p.status === 'verified' && bookingIds.has(p.bookingId))
      .reduce((s, p) => s + p.amount, 0);

    const outstanding = Math.max(0, grossContracted - verifiedCollected);
    const refundsIssued = state.refunds.reduce((s, r) => s + r.amount, 0);

    return {
      grossContracted,
      verifiedCollected,
      outstanding,
      taxTotal,
      refundsIssued,
      hallRevenue,
      cateringRevenue,
      roomRevenue,
      equipmentAddonRevenue,
    };
  }, [filteredBookings, state.payments, state.refunds]);

  const hallBreakdown = useMemo(() => {
    const rows = state.halls.map((h) => {
      const bList = filteredBookings.filter((b) => b.hallId === h.id);
      const revenue = bList.reduce((s, b) => s + b.grandTotal, 0);
      const sessions = bList.reduce(
        (s, b) => s + b.sessions.filter((x) => x.status !== 'cancelled').length,
        0
      );
      return { hall: h, bookingsCount: bList.length, sessions, revenue };
    });
    const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
    return { rows, maxRev };
  }, [filteredBookings, state.halls]);

  const eventTypeBreakdown = useMemo(() => {
    const types: EventType[] = [
      'Wedding',
      'Church Program',
      'Corporate Conference',
      'Social Gala',
      'Other',
    ];
    const rows = types
      .map((t) => {
        const list = filteredBookings.filter((b) => b.eventType === t);
        return {
          type: t,
          count: list.length,
          revenue: list.reduce((s, b) => s + b.grandTotal, 0),
        };
      })
      .filter((r) => r.count > 0);
    const total = Math.max(1, rows.reduce((s, r) => s + r.revenue, 0));
    return { rows, total };
  }, [filteredBookings]);

  const downloadCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportBookingsCsv = () => {
    downloadCsv(
      `hallbook-bookings-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Booking ID', 'Event Title', 'Category', 'Hall', 'Status', 'Grand Total', 'Verified Paid', 'Balance'],
      state.bookings.map((b) => {
        const hallName = state.halls.find((h) => h.id === b.hallId)?.name || '';
        const paid = state.payments
          .filter((p) => p.bookingId === b.id && p.status === 'verified')
          .reduce((s, p) => s + p.amount, 0);
        return [
          b.id,
          b.eventTitle,
          b.eventType,
          hallName,
          b.status,
          b.grandTotal.toFixed(2),
          paid.toFixed(2),
          Math.max(0, b.grandTotal - paid).toFixed(2),
        ];
      })
    );
  };

  const exportLedgerCsv = () => {
    downloadCsv(
      `hallbook-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Receipt Number', 'Booking ID', 'Method', 'Reference', 'Status', 'Amount', 'Verified By', 'Verified At'],
      state.payments.map((p) => [
        p.receiptNumber || 'PENDING',
        p.bookingId,
        p.method,
        p.reference,
        p.status,
        p.amount.toFixed(2),
        p.verifiedBy || '',
        p.verifiedAt || '',
      ])
    );
  };

  if (!canViewFullReports(currentUser.role)) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
        <Lock className="w-6 h-6 text-[#C89B3C] mx-auto" />
        <h2 className="text-base font-semibold text-[#0B1F3A]">
          Executive Financial Reports Restricted
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Full hotel revenue analytics, collection ratios, and ledger CSV exports are restricted to the Hotel Manager and Owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
            Analytics & Financial Reporting
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Real-time hall utilization, revenue streams, cashier cash-up reconciliation, and CSV exports
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                scope === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              All Active Pipeline
            </button>
            <button
              type="button"
              onClick={() => setScope('confirmed')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                scope === 'confirmed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              Locked & Settled Only
            </button>
          </div>

          <button
            type="button"
            onClick={exportBookingsCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-medium rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Bookings CSV
          </button>
          <button
            type="button"
            onClick={exportLedgerCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
          >
            <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
            Ledger CSV
          </button>
        </div>
      </div>

      {/* 4-Column Financial Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Contracted Revenue</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(metrics.grossContracted, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Tax included: {formatCurrency(metrics.taxTotal, currency)}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Verified Receipts Collected</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700">
            {formatCurrency(metrics.verifiedCollected, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {metrics.grossContracted > 0
              ? `${Math.round((metrics.verifiedCollected / metrics.grossContracted) * 100)}% collection ratio`
              : '0% collection ratio'}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Outstanding Receivables</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
            {formatCurrency(metrics.outstanding, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {state.clients.filter((c) => c.overdueFlag).length} flagged overdue account(s)
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Refund Vouchers Issued</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(metrics.refundsIssued, currency)}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {state.refunds.length} voucher(s) recorded
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Hall Utilization & Revenue SVG Chart */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Revenue & Session Utilization by Hall
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Contracted revenue and scheduled sessions across hotel venues
            </p>
          </div>

          <div className="space-y-4">
            {hallBreakdown.rows.map((row) => {
              const pct = Math.round((row.revenue / hallBreakdown.maxRev) * 100);
              return (
                <div key={row.hall.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-900">{row.hall.name}</span>
                    <span className="font-mono text-slate-700 tabular-nums">
                      {row.sessions} session(s) · {formatCurrency(row.revenue, currency)}
                    </span>
                  </div>
                  <svg
                    className="w-full h-3 rounded bg-slate-100 overflow-hidden"
                    viewBox="0 0 100 4"
                    preserveAspectRatio="none"
                    aria-label={`${row.hall.name} revenue bar`}
                  >
                    <rect x="0" y="0" width={Math.max(2, pct)} height="4" fill="#0B1F3A" />
                  </svg>
                </div>
              );
            })}
          </div>

          {/* Revenue Stream Split */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-slate-500">Hall Rental</p>
              <p className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {formatCurrency(metrics.hallRevenue, currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Catering</p>
              <p className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {formatCurrency(metrics.cateringRevenue, currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Room Blocks</p>
              <p className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {formatCurrency(metrics.roomRevenue, currency)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Gear & Extras</p>
              <p className="font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
                {formatCurrency(metrics.equipmentAddonRevenue, currency)}
              </p>
            </div>
          </div>
        </section>

        {/* Event Category Mix */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Event Category Mix</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Weddings, church programs, conferences, and social galas
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {eventTypeBreakdown.rows.map((r) => {
              const share = Math.round((r.revenue / eventTypeBreakdown.total) * 100);
              return (
                <div key={r.type} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{r.type}</p>
                    <p className="text-slate-500 tabular-nums">{r.count} booking(s)</p>
                  </div>
                  <div className="text-right font-mono tabular-nums">
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(r.revenue, currency)}
                    </p>
                    <p className="text-slate-500">{share}% share</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Cashier Shift Reconciliation Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Cashier Shift Cash-Up History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Shift</th>
                <th className="py-3 px-4">Cashier</th>
                <th className="py-3 px-4">Opened / Closed</th>
                <th className="py-3 px-4 text-right">Opening Float</th>
                <th className="py-3 px-4 text-right">Declared Cash</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {state.shifts.map((s) => (
                <tr key={s.id}>
                  <td className="py-3 px-4 font-mono font-semibold text-slate-900">{s.id}</td>
                  <td className="py-3 px-4 text-slate-800">{s.cashierName}</td>
                  <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                    {formatDateTime(s.openedAt)}
                    {s.closedAt ? ` → ${formatDateTime(s.closedAt)}` : ''}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatCurrency(s.openingFloat, currency)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {s.declaredCash !== null ? formatCurrency(s.declaredCash, currency) : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold">
                    <span className={s.status === 'open' ? 'text-emerald-700' : 'text-slate-600'}>
                      {s.status.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
