export type StaffRole =
  | 'manager'
  | 'booking_officer'
  | 'cashier'
  | 'front_desk'
  | 'operations'
  | 'owner'
  | 'sys_admin';

export const ROLE_LABELS: Record<StaffRole, string> = {
  manager: 'Manager',
  booking_officer: 'Booking Officer',
  cashier: 'Cashier',
  front_desk: 'Front Desk',
  operations: 'Operations',
  owner: 'Owner / Auditor',
  sys_admin: 'System Admin',
};

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: StaffRole;
  active: boolean;
  hasPassword?: boolean;
  approvalStatus?: 'approved' | 'pending' | 'rejected';
  approvedBy?: string | null;
  approvedAt?: string | null;
  locked?: boolean;
  lockedReason?: string | null;
  lockedAt?: string | null;
  failedAttempts?: number;
  createdAt: string;
}

export interface SystemErrorRecord {
  id: string;
  timestamp: string;
  severity: 'warning' | 'error' | 'critical';
  source: string;
  message: string;
  context?: string;
  reportedBy?: string;
  actorName?: string;
  status: 'open' | 'resolved';
  resolvedBy: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
}

export interface CancellationTier {
  daysBefore: number;
  refundPercent: number;
  label: string;
}

export interface TimeSlotTemplate {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
}

export interface HotelProfile {
  hotelName: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  taxRatePercent: number;
  defaultHoldHours: number;
  depositPercent: number;
  largeBookingDayThreshold: number;
  largeBookingRoomThreshold: number;
  twoManagerApprovalEnabled: boolean;
  bankAccounts: BankAccount[];
  cancellationPolicy: CancellationTier[];
  timeSlots: TimeSlotTemplate[];
}

export type HallLayout = 'Banquet' | 'Theatre' | 'Classroom' | 'Cocktail' | 'U-Shape';

export interface Hall {
  id: string;
  name: string;
  imageUrl: string;
  description: string;
  capacityBanquet: number;
  capacityTheatre: number;
  capacityClassroom: number;
  capacityCocktail: number;
  baseDayRate: number;
  halfDayRate: number;
  bufferMinutes: number;
  layouts: HallLayout[];
  sections: string[];
  active: boolean;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: string;
  totalStock: number;
  unitRate: number;
  replacementCost: number;
}

export interface CateringPackage {
  id: string;
  name: string;
  category: string;
  pricePerHead: number;
  description: string;
  courses: string[];
}

export interface AddonItem {
  id: string;
  name: string;
  unitRate: number;
  unitLabel: string;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  organization: string;
  overdueFlag: boolean;
  overdueNotes: string;
  createdAt: string;
}

export interface BookingSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  layout: HallLayout;
  expectedGuests: number;
  status: 'active' | 'cancelled' | 'completed';
}

export interface RoomLine {
  id: string;
  roomType: string;
  count: number;
  checkInDate: string;
  checkOutDate: string;
  ratePerNight: number;
  verificationStatus: 'pending' | 'full' | 'partial' | 'declined';
  verifiedCount: number;
  verifiedBy: string | null;
  verifiedAt: string | null;
  officerDecision: 'pending' | 'accepted' | 'dropped';
  frontDeskHotelRef: string;
  allocationNotes: string;
}

export interface EquipmentReservation {
  equipmentId: string;
  name: string;
  quantity: number;
  unitRate: number;
  returnedQty: number | null;
  damagedQty: number;
  damageFee: number;
}

export interface CateringOrder {
  mode: 'hotel' | 'external';
  packageId: string;
  name: string;
  guests: number;
  pricePerHead: number;
  stagingFee?: number;
  externalCatererName?: string;
  externalCatererContact?: string;
  serviceTime: string;
  dietaryNotes: string;
  kitchenStatus: 'planned' | 'confirmed' | 'in_prep' | 'served';
}

export interface AddonOrder {
  addonId: string;
  name: string;
  quantity: number;
  unitRate: number;
}

export interface GuestEntry {
  id: string;
  fullName: string;
  groupTag: 'VIP' | 'Family' | 'Speaker' | 'General' | 'Vendor';
  tableLabel: string;
  dietaryNote: string;
  phone: string;
  checkedIn: boolean;
  checkedInAt: string | null;
}

export interface AmendmentRecord {
  id: string;
  timestamp: string;
  approvedBy: string;
  reason: string;
  summary: string;
}

export type BookingStatus =
  | 'awaiting_room_verification'
  | 'awaiting_manager_approval'
  | 'hold_proforma'
  | 'locked'
  | 'event_completed'
  | 'closed'
  | 'cancelled'
  | 'expired';

export type EventType =
  | 'Wedding'
  | 'Church Program'
  | 'Corporate Conference'
  | 'Social Gala'
  | 'Other';

export interface Booking {
  id: string;
  clientId: string;
  hallId: string;
  eventTitle: string;
  eventType: EventType;
  bookingMode: 'single' | 'multi_day' | 'recurring';
  repeatRule: 'none' | 'weekly' | 'biweekly' | 'monthly';
  sessions: BookingSession[];
  roomLines: RoomLine[];
  equipment: EquipmentReservation[];
  catering: CateringOrder | null;
  addons: AddonOrder[];
  guests: GuestEntry[];
  status: BookingStatus;
  holdExpiresAt: string | null;
  requiresManagerApproval: boolean;
  managerApprovedBy: string | null;
  managerApprovedAt: string | null;
  discountAmount: number;
  discountReason: string;
  extrasAmount: number;
  extrasNotes: string;
  hallTotal: number;
  roomTotal: number;
  equipmentTotal: number;
  cateringTotal: number;
  addonTotal: number;
  taxAmount: number;
  grandTotal: number;
  depositRequired: number;
  finalDueDate: string | null;
  createdBy: string;
  assignedOfficerId: string;
  createdAt: string;
  updatedAt: string;
  amendments: AmendmentRecord[];
  cancellationReason: string | null;
  suggestedRefund: number;
  eventNotes: string;
  operationsBrief: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  amount: number;
  method: 'Bank Transfer' | 'POS' | 'Cash' | 'Cheque';
  reference: string;
  proofNote: string;
  recordedBy: string;
  recordedAt: string;
  status: 'pending_verification' | 'verified' | 'voided';
  verifiedBy: string | null;
  verifiedAt: string | null;
  receiptNumber: string | null;
  reprintCount: number;
  voidedBy: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  shiftId: string | null;
  managerOverrideOverpayment: boolean;
  overrideReason: string | null;
  proofImageUrl?: string | null;
}

export interface RefundVoucher {
  id: string;
  voucherNumber: string;
  bookingId: string;
  amount: number;
  reason: string;
  method: 'Bank Transfer' | 'Cash' | 'Cheque';
  issuedBy: string;
  issuedAt: string;
}

export interface CashierShift {
  id: string;
  cashierId: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  declaredCash: number | null;
  status: 'open' | 'closed';
}

export interface WaitlistEntry {
  id: string;
  hallId: string;
  desiredDate: string;
  startTime: string;
  endTime: string;
  clientName: string;
  clientPhone: string;
  eventTitle: string;
  status: 'waiting' | 'notified' | 'converted' | 'dismissed';
  notifiedAt: string | null;
  createdAt: string;
}

export interface MaintenanceBlock {
  id: string;
  hallId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
  createdBy: string;
}

export interface StaffTask {
  id: string;
  assignedToId: string | null;
  roleTarget: StaffRole;
  bookingId: string;
  type:
    | 'room_verification'
    | 'manager_approval'
    | 'overdue_collection'
    | 'waitlist_followup'
    | 'equipment_return'
    | 'account_verification'
    | 'account_locked'
    | 'system_error';
  title: string;
  description: string;
  status: 'open' | 'done';
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string;
  highImpact: boolean;
}

export interface SessionConflict {
  date: string;
  startTime: string;
  endTime: string;
  conflictType: 'booking' | 'hold' | 'maintenance' | 'equipment';
  conflictingId: string;
  conflictingTitle: string;
  message: string;
  alternativeHalls: { id: string; name: string }[];
}

export interface HallBookStateResponse {
  profile: HotelProfile;
  halls: Hall[];
  equipment: EquipmentItem[];
  cateringPackages: CateringPackage[];
  addons: AddonItem[];
  clients: Client[];
  bookings: Booking[];
  payments: PaymentRecord[];
  refunds: RefundVoucher[];
  shifts: CashierShift[];
  waitlist: WaitlistEntry[];
  maintenanceBlocks: MaintenanceBlock[];
  tasks: StaffTask[];
  auditLogs: AuditLogEntry[];
  staff: StaffUser[];
  systemErrors: SystemErrorRecord[];
}
