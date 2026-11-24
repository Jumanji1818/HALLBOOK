import React, { useState } from 'react';
import { CheckCircle2, ImagePlus, Lock, Printer, Receipt, ShieldAlert, X, XCircle } from 'lucide-react';
import type { HallBookStateResponse, PaymentRecord, RefundVoucher, StaffUser } from '../types';
import {
  canApproveOrVoid,
  canRecordPayments,
  canViewPaymentsLedger,
  formatCurrency,
  formatDateTime,
} from '../utils/format';

async function resizeSlipImageToDataUrl(file: File, maxWidth = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

interface PaymentsLedgerViewProps {
  state: HallBookStateResponse;
  currentUser: StaffUser;
  authToken: string;
  initialBookingId?: string;
  onStateUpdated: (nextState: HallBookStateResponse) => void;
}

export const PaymentsLedgerView: React.FC<PaymentsLedgerViewProps> = ({
  state,
  currentUser,
  authToken,
  initialBookingId,
  onStateUpdated,
}) => {
  const currency = state.profile.currency;
  const activeBookings = state.bookings.filter(
    (b) => !['cancelled', 'expired'].includes(b.status)
  );
  const [bookingId, setBookingId] = useState(
    initialBookingId || activeBookings[0]?.id || ''
  );
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentRecord['method']>('Bank Transfer');
  const [reference, setReference] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [managerOverride, setManagerOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Shift cash-up state
  const openShift = state.shifts.find((s) => s.status === 'open');
  const [openingFloat, setOpeningFloat] = useState('200000');
  const [declaredCash, setDeclaredCash] = useState('');

  // Receipt modal, slip viewer, refund voucher modal & Void modal
  const [activeReceipt, setActiveReceipt] = useState<PaymentRecord | null>(null);
  const [activeSlipPayment, setActiveSlipPayment] = useState<PaymentRecord | null>(null);
  const [activeRefundVoucher, setActiveRefundVoucher] = useState<RefundVoucher | null>(null);
  const [voidTarget, setVoidTarget] = useState<PaymentRecord | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const selectedBooking = state.bookings.find((b) => b.id === bookingId);
  const verifiedForSelected = state.payments
    .filter((p) => p.bookingId === bookingId && p.status === 'verified')
    .reduce((s, p) => s + p.amount, 0);
  const remainingForSelected = selectedBooking
    ? Math.max(0, Math.round((selectedBooking.grandTotal - verifiedForSelected) * 100) / 100)
    : 0;

  const openShiftCashReceipts = openShift
    ? state.payments
        .filter(
          (p) =>
            p.shiftId === openShift.id &&
            p.status === 'verified' &&
            p.method === 'Cash'
        )
        .reduce((s, p) => s + p.amount, 0)
    : 0;
  const expectedShiftCash = (openShift?.openingFloat || 0) + openShiftCashReceipts;

  const postReq = async (url: string, body: unknown, okMsg: string) => {
    setError('');
    setSuccess('');
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
        setError(data.error || 'Operation failed.');
        return null;
      }
      onStateUpdated(data.state);
      setSuccess(okMsg);
      return data;
    } catch {
      setError('Network error communicating with server.');
      return null;
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await postReq(
      '/api/payments',
      {
        bookingId,
        amount: Number(amount),
        method,
        reference,
        proofNote,
        proofImageUrl: proofImageUrl || undefined,
        managerOverrideOverpayment: managerOverride,
        overrideReason,
      },
      'Payment logged to immutable ledger. Verify against bank/POS to issue receipt.'
    );
    if (res) {
      setAmount('');
      setReference('');
      setProofNote('');
      setProofImageUrl('');
      setManagerOverride(false);
      setOverrideReason('');
    }
  };

  if (!canViewPaymentsLedger(currentUser.role)) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
        <Lock className="w-6 h-6 text-[#C89B3C] mx-auto" />
        <h2 className="text-base font-semibold text-[#0B1F3A]">
          Payment Ledger & Cashier Shifts Restricted
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          Payment records, bank/POS verification, and cashier shift cash-ups are restricted to Cashiers, the Hotel Manager, and Owner.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
          Payment Ledger, Receipts & Cashier Cash-Up
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Append-only financial ledger. Verified payments generate immutable sequential receipts and lock bookings at 50% deposit.
        </p>
      </div>

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
          {success}
        </div>
      )}

      {/* Top Row: Record Payment + Cashier Shift Cash-Up */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Record Payment Form */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Record Payment Entry</h2>
            {selectedBooking && (
              <span className="text-xs font-mono text-slate-600 tabular-nums">
                Balance Due: {formatCurrency(remainingForSelected, currency)}
              </span>
            )}
          </div>

          {!canRecordPayments(currentUser.role) ? (
            <p className="text-xs text-slate-500 py-4">
              Only Cashier or Manager roles can log or verify payments. You have read-only ledger visibility.
            </p>
          ) : (
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Booking Account
                  </label>
                  <select
                    value={bookingId}
                    onChange={(e) => setBookingId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {activeBookings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.id} — {b.eventTitle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Amount ({currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentRecord['method'])}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="POS">POS Card Terminal</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Bank / POS Reference
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. ZBNK-TRX-994210"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-8">
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Verification Proof Note
                  </label>
                  <input
                    type="text"
                    value={proofNote}
                    onChange={(e) => setProofNote(e.target.value)}
                    placeholder="Slip sighted, terminal batch #, or teller confirmation"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    required
                  />
                </div>
                <div className="sm:col-span-4">
                  <label className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-[#0B1F3A] text-xs font-medium rounded-lg cursor-pointer transition-colors">
                    <ImagePlus className="w-3.5 h-3.5 text-[#C89B3C]" />
                    {proofImageUrl ? 'Slip Attached (Replace)' : 'Attach POS/Slip Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        setError('');
                        try {
                          const dataUrl = await resizeSlipImageToDataUrl(file);
                          setProofImageUrl(dataUrl);
                        } catch {
                          setError('Could not process selected proof image.');
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {canApproveOrVoid(currentUser.role) && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={managerOverride}
                      onChange={(e) => setManagerOverride(e.target.checked)}
                    />
                    Manager Overpayment Override
                  </label>
                  {managerOverride && (
                    <input
                      type="text"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Mandatory reason for allowing overpayment"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded bg-white"
                      required
                    />
                  )}
                </div>
              )}

              <button
                type="submit"
                className="px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
              >
                Log Payment to Ledger
              </button>
            </form>
          )}
        </div>

        {/* Cashier Shift Cash-Up Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Cashier Shift & Cash-Up</h2>
          {openShift ? (
            <div className="space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Shift</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {openShift.id} · {openShift.cashierName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Opening Float</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(openShift.openingFloat, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Verified Cash Receipts</span>
                  <span className="font-mono tabular-nums text-emerald-700">
                    {formatCurrency(openShiftCashReceipts, currency)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold text-slate-900 pt-1 border-t border-slate-200">
                  <span>Expected Drawer Cash</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(expectedShiftCash, currency)}
                  </span>
                </div>
              </div>

              {canRecordPayments(currentUser.role) && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Counted Drawer Cash ({currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={declaredCash}
                      onChange={(e) => setDeclaredCash(e.target.value)}
                      placeholder={String(expectedShiftCash)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      postReq(
                        `/api/shifts/${openShift.id}/close`,
                        { declaredCash: Number(declaredCash) || expectedShiftCash },
                        'Cashier shift closed and reconciled.'
                      )
                    }
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
                  >
                    Close Shift
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">No cashier shift is currently open.</p>
              {canRecordPayments(currentUser.role) && (
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Opening Float ({currency})
                    </label>
                    <input
                      type="number"
                      value={openingFloat}
                      onChange={(e) => setOpeningFloat(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      postReq(
                        '/api/shifts/open',
                        { openingFloat: Number(openingFloat) || 0 },
                        'Cashier shift opened.'
                      )
                    }
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg"
                  >
                    Open Shift
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Immutable Ledger Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">
            Immutable Payment Ledger ({state.payments.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                <th className="py-3 px-4">Receipt / Ref</th>
                <th className="py-3 px-4">Booking</th>
                <th className="py-3 px-4">Method & Proof</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {state.payments.map((p) => {
                const b = state.bookings.find((x) => x.id === p.bookingId);
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-semibold text-slate-900">
                        {p.receiptNumber || 'Unverified'}
                      </p>
                      <p className="text-slate-500 font-mono mt-0.5">{p.reference}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-mono font-medium text-slate-800">{p.bookingId}</p>
                      <p className="text-slate-600 mt-0.5 truncate max-w-[200px]">
                        {b?.eventTitle}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-900">{p.method}</p>
                      <p className="text-slate-500 mt-0.5">{p.proofNote}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      {p.status === 'verified' ? (
                        <span className="text-emerald-700 font-semibold">
                          Verified · {p.verifiedBy}
                        </span>
                      ) : p.status === 'voided' ? (
                        <span className="text-red-700 font-semibold">
                          Voided · {p.voidReason}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-semibold">
                          Pending Bank/POS Verification
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatCurrency(p.amount, currency)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {p.proofImageUrl && (
                          <button
                            type="button"
                            onClick={() => setActiveSlipPayment(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium"
                          >
                            View Slip
                          </button>
                        )}

                        {p.status === 'pending_verification' &&
                          canRecordPayments(currentUser.role) && (
                            <button
                              type="button"
                              onClick={() =>
                                postReq(
                                  `/api/payments/${p.id}/verify`,
                                  {},
                                  `Payment verified and sequential receipt issued.`
                                )
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Verify & Issue Receipt
                            </button>
                          )}

                        {p.status === 'verified' && p.receiptNumber && (
                          <button
                            type="button"
                            onClick={() => setActiveReceipt(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            Receipt {p.reprintCount > 0 ? `(Dup #${p.reprintCount})` : ''}
                          </button>
                        )}

                        {p.status !== 'voided' && canApproveOrVoid(currentUser.role) && (
                          <button
                            type="button"
                            onClick={() => setVoidTarget(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-red-700 hover:bg-red-50 border border-red-200 rounded font-medium"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Refund Vouchers Section */}
      {state.refunds.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Refund Vouchers ({state.refunds.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {state.refunds.map((rv) => (
              <div key={rv.id} className="px-5 py-3.5 flex flex-wrap justify-between items-center gap-3 text-xs">
                <div>
                  <span className="font-mono font-semibold text-slate-900">{rv.voucherNumber}</span>
                  <span className="text-slate-500 ml-2">
                    {rv.bookingId} · {rv.method} · Issued by {rv.issuedBy}
                  </span>
                  <p className="text-slate-600 mt-0.5">{rv.reason}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono font-semibold text-red-700 tabular-nums">
                    -{formatCurrency(rv.amount, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveRefundVoucher(rv)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded font-medium"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print Voucher
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Proof Slip Image Viewer Modal */}
      {activeSlipPayment && activeSlipPayment.proofImageUrl && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#0B1F3A]">
                  Payment Proof Slip · {activeSlipPayment.reference}
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {activeSlipPayment.bookingId} · {formatCurrency(activeSlipPayment.amount, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSlipPayment(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Close slip preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-100 max-h-[65vh] flex items-center justify-center">
              <img
                src={activeSlipPayment.proofImageUrl}
                alt={`Payment slip ${activeSlipPayment.reference}`}
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* Printable Refund Voucher Modal */}
      {activeRefundVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-mono text-slate-500">OFFICIAL REFUND VOUCHER</p>
                <h3 className="text-lg font-bold text-[#0B1F3A] mt-0.5">
                  {state.profile.hotelName}
                </h3>
                <p className="text-xs text-slate-500">{state.profile.address}</p>
              </div>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Voucher Number</span>
                <span className="font-mono font-bold text-slate-900">
                  {activeRefundVoucher.voucherNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Booking Reference</span>
                <span className="font-mono text-slate-900">{activeRefundVoucher.bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Disbursement Method</span>
                <span className="text-slate-900">{activeRefundVoucher.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Authorized By</span>
                <span className="text-slate-900">
                  {activeRefundVoucher.issuedBy} · {formatDateTime(activeRefundVoucher.issuedAt)}
                </span>
              </div>
              <p className="text-slate-600 pt-1">
                <strong>Reason:</strong> {activeRefundVoucher.reason}
              </p>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-red-700">
                <span>Refund Amount Authorized</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(activeRefundVoucher.amount, currency)}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => setActiveRefundVoucher(null)}
                className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-[#0B1F3A] text-white rounded-lg"
              >
                <Printer className="w-3.5 h-3.5 text-[#D4AF37]" />
                Print Voucher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Immutable Receipt Modal */}
      {activeReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-300 rounded-xl max-w-md w-full p-6 space-y-5">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs font-mono text-slate-500">OFFICIAL PAYMENT RECEIPT</p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {state.profile.hotelName}
                </h3>
              </div>
              {activeReceipt.reprintCount > 0 && (
                <span className="px-2 py-1 border-2 border-red-700 text-red-700 font-mono font-bold text-xs tracking-wider">
                  DUPLICATE
                </span>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt Number</span>
                <span className="font-mono font-bold text-slate-900">
                  {activeReceipt.receiptNumber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Booking Reference</span>
                <span className="font-mono text-slate-900">{activeReceipt.bookingId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method</span>
                <span className="text-slate-900">{activeReceipt.method}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank / POS Reference</span>
                <span className="font-mono text-slate-900">{activeReceipt.reference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Verified By</span>
                <span className="text-slate-900">
                  {activeReceipt.verifiedBy} · {formatDateTime(activeReceipt.verifiedAt)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                <span>Amount Received</span>
                <span className="font-mono tabular-nums">
                  {formatCurrency(activeReceipt.amount, currency)}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 no-print">
              <button
                type="button"
                onClick={() => setActiveReceipt(null)}
                className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={async () => {
                  const res = await postReq(
                    `/api/payments/${activeReceipt.id}/reprint`,
                    {},
                    'Receipt reprinted (marked DUPLICATE).'
                  );
                  if (res?.payment) setActiveReceipt(res.payment);
                  setTimeout(() => window.print(), 100);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 text-white rounded-lg"
              >
                <Printer className="w-3.5 h-3.5" />
                Print / Reprint
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager Void Payment Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-2 text-red-700">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-lg font-bold">Void Ledger Payment</h3>
            </div>
            <p className="text-xs text-slate-600">
              Payments are never deleted from the ledger. Voiding marks{' '}
              <strong>{voidTarget.receiptNumber || voidTarget.id}</strong> (
              {formatCurrency(voidTarget.amount, currency)}) as voided with your audit signature.
            </p>
            <input
              type="text"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Mandatory reason for voiding"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setVoidTarget(null);
                  setVoidReason('');
                }}
                className="px-4 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await postReq(
                    `/api/payments/${voidTarget.id}/void`,
                    { reason: voidReason },
                    'Payment voided in ledger.'
                  );
                  if (ok) {
                    setVoidTarget(null);
                    setVoidReason('');
                  }
                }}
                className="px-4 py-2 text-xs font-medium bg-red-700 text-white rounded-lg"
              >
                Confirm Void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
