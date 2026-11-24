import React, { useState } from 'react';
import {
  AlertOctagon,
  Building2,
  CheckCircle2,
  Download,
  ImagePlus,
  KeyRound,
  Lock,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  UserPlus,
  Wrench,
  XCircle,
} from 'lucide-react';
import {
  ROLE_LABELS,
  type BankAccount,
  type CancellationTier,
  type Hall,
  type HallBookStateResponse,
  type HallLayout,
  type StaffRole,
  type StaffUser,
  type SystemErrorRecord,
} from '../types';
import {
  canAccessAdminSetup,
  canChangePricing,
  canManageMaintenance,
  canManageSecurityAndResets,
  canManageStaffLifecycle,
  canManageSystemSecurityAndMedia,
  canManageVenueMedia,
  canRunSystemJobsAndRestore,
  canVerifyNewAccounts,
  formatCurrency,
  formatDate,
  formatDateTime,
  isHigherAuthority,
} from '../utils/format';
import { TiltCard3D } from './TiltCard3D';

interface SetupAdminViewProps {
  state: HallBookStateResponse;
  currentUser: StaffUser;
  authToken: string;
  onStateUpdated: (nextState: HallBookStateResponse) => void;
}

type SetupSubTab = 'policy' | 'halls' | 'catalog' | 'staff' | 'errors' | 'audit';

async function resizeImageToDataUrl(file: File, maxWidth = 900): Promise<string> {
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
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export const SetupAdminView: React.FC<SetupAdminViewProps> = ({
  state,
  currentUser,
  authToken,
  onStateUpdated,
}) => {
  const canMaintain = canManageMaintenance(currentUser.role);
  const canEditVenueMedia = canManageVenueMedia(currentUser.role);
  const canEditPricing = canChangePricing(currentUser.role);
  const canVerifyAccounts = canVerifyNewAccounts(currentUser.role);
  const canManageHR = canManageStaffLifecycle(currentUser.role);
  const canManageSecurity = canManageSecurityAndResets(currentUser.role);
  const canRunSysJobs = canRunSystemJobsAndRestore(currentUser.role);
  const isSysAdmin = canManageSystemSecurityAndMedia(currentUser.role);
  const isPrivileged = canAccessAdminSetup(currentUser.role);
  const isHigherAuth = isHigherAuthority(currentUser.role);
  const currency = state.profile.currency || 'NGN';

  const authHeaders = (withJson = false): HeadersInit => ({
    ...(withJson ? { 'Content-Type': 'application/json' } : {}),
    ...(authToken && authToken !== 'cookie-session'
      ? { Authorization: `Bearer ${authToken}` }
      : {}),
  });

  const [subTab, setSubTab] = useState<SetupSubTab>(
    canEditVenueMedia
      ? 'halls'
      : canVerifyAccounts
      ? 'staff'
      : canEditPricing
      ? 'catalog'
      : isPrivileged
      ? 'errors'
      : 'audit'
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Policy form (Manager ONLY)
  const [profileForm, setProfileForm] = useState({
    hotelName: state.profile.hotelName,
    currency: state.profile.currency || 'NGN',
    taxRatePercent: state.profile.taxRatePercent,
    defaultHoldHours: state.profile.defaultHoldHours,
    depositPercent: state.profile.depositPercent,
    largeBookingDayThreshold: state.profile.largeBookingDayThreshold,
    largeBookingRoomThreshold: state.profile.largeBookingRoomThreshold,
    twoManagerApprovalEnabled: Boolean(state.profile.twoManagerApprovalEnabled),
  });
  const [bankAccountsForm, setBankAccountsForm] = useState<BankAccount[]>(
    state.profile.bankAccounts || []
  );
  const [policyTiersForm, setPolicyTiersForm] = useState<CancellationTier[]>(
    state.profile.cancellationPolicy || []
  );

  // Backup restore & Clean Go-Live Production Reset controls
  const [pendingRestoreJson, setPendingRestoreJson] = useState<{
    fileName: string;
    payload: unknown;
  } | null>(null);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [showGoLiveReset, setShowGoLiveReset] = useState(false);
  const [goLivePhrase, setGoLivePhrase] = useState('');
  const [goLivePassword, setGoLivePassword] = useState('');
  const [resettingGoLive, setResettingGoLive] = useState(false);

  // Hall editor / creator (System Admin ONLY — physical specs, pictures, out-of-service)
  const [editingHall, setEditingHall] = useState<Hall | null>(null);
  const [creatingHall, setCreatingHall] = useState(false);
  const [hallForm, setHallForm] = useState({
    name: '',
    description: '',
    imageUrl: '',
    capacityBanquet: 250,
    capacityTheatre: 400,
    bufferMinutes: 120,
    active: true,
  });
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Venue maintenance hold form (System Admin ONLY)
  const [maintForm, setMaintForm] = useState({
    hallId: state.halls[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '08:00',
    endTime: '14:00',
    reason: '',
  });

  // Manager Hall Commercial Naira Rates editor
  const [hallRateInputs, setHallRateInputs] = useState<
    Record<string, { baseDayRate: number; halfDayRate: number }>
  >(() =>
    Object.fromEntries(
      state.halls.map((h) => [
        h.id,
        { baseDayRate: h.baseDayRate, halfDayRate: h.halfDayRate },
      ])
    )
  );

  // Catering & equipment catalog (Manager ONLY)
  const [newCatering, setNewCatering] = useState({
    name: '',
    category: 'Wedding & Social',
    pricePerHead: 18000,
    description: '',
  });
  const [newEquipment, setNewEquipment] = useState({
    name: '',
    category: 'Audio',
    totalStock: 4,
    unitRate: 60000,
  });

  // Staff verification, creation, locking, custom password & reassignment
  const [verifyRoleMap, setVerifyRoleMap] = useState<Record<string, StaffRole>>({});
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    username: '',
    role: 'booking_officer' as StaffRole,
    password: '',
  });
  const [passwordInputs, setPasswordInputs] = useState<Record<string, string>>({});
  const [lockReasonMap, setLockReasonMap] = useState<Record<string, string>>({});
  const [reassignFrom, setReassignFrom] = useState('');
  const [reassignTo, setReassignTo] = useState('');
  const [reassignReason, setReassignReason] = useState('');

  // System Errors diagnostics (System Admin resolves, any authed can report)
  const [newErrForm, setNewErrForm] = useState<{
    source: SystemErrorRecord['source'];
    severity: SystemErrorRecord['severity'];
    message: string;
    context: string;
  }>({
    source: 'operations',
    severity: 'warning',
    message: '',
    context: '',
  });
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});

  // Audit & client overdue controls
  const [auditFilter, setAuditFilter] = useState<'all' | 'high'>('all');
  const [overdueReasonMap, setOverdueReasonMap] = useState<Record<string, string>>({});

  const pendingAccounts = state.staff.filter(
    (s) => (s.approvalStatus ?? 'approved') === 'pending'
  );
  const lockedAccounts = state.staff.filter((s) => s.locked);
  const openErrorsCount = (state.systemErrors || []).filter((e) => e.status === 'open').length;

  const openEditHall = (hall: Hall) => {
    setCreatingHall(false);
    setEditingHall(hall);
    setHallForm({
      name: hall.name,
      description: hall.description,
      imageUrl: hall.imageUrl,
      capacityBanquet: hall.capacityBanquet,
      capacityTheatre: hall.capacityTheatre,
      bufferMinutes: hall.bufferMinutes,
      active: hall.active,
    });
  };

  const openCreateHall = () => {
    setEditingHall(null);
    setCreatingHall(true);
    setHallForm({
      name: '',
      description: '',
      imageUrl: '/src/assets/images/hall_grand_ballroom_1795436657988.jpg',
      capacityBanquet: 250,
      capacityTheatre: 400,
      bufferMinutes: 120,
      active: true,
    });
  };

  const handleHallPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setHallForm((prev) => ({ ...prev, imageUrl: dataUrl }));
    } catch {
      setError('Could not process selected image file.');
    }
  };

  const handleSaveHall = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const url = editingHall ? `/api/setup/halls/${editingHall.id}` : '/api/setup/halls';
    const method = editingHall ? 'PUT' : 'POST';

    const payload: Record<string, unknown> = {
      name: hallForm.name,
      description: hallForm.description,
      imageUrl: hallForm.imageUrl,
      capacityBanquet: hallForm.capacityBanquet,
      capacityTheatre: hallForm.capacityTheatre,
      bufferMinutes: hallForm.bufferMinutes,
      active: hallForm.active,
      layouts: (editingHall?.layouts || ['Banquet', 'Theatre', 'Classroom', 'Cocktail']) as HallLayout[],
    };

    const res = await fetch(url, {
      method,
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not save hall details.');
      return;
    }
    onStateUpdated(data.state);
    setEditingHall(null);
    setCreatingHall(false);
    setMessage(editingHall ? `Updated ${data.hall.name}.` : `Added ${data.hall.name} (Manager can set Naira tariffs in Commercial Pricing).`);
  };

  const handleToggleHallServiceStatus = async (hall: Hall) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/setup/halls/${hall.id}`, {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify({ active: !hall.active }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not update hall service status.');
      return;
    }
    onStateUpdated(data.state);
    setMessage(
      data.hall.active
        ? `${data.hall.name} reopened and active for new bookings.`
        : `${data.hall.name} placed Out of Service by System Admin.`
    );
  };

  const handleAddMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!maintForm.reason.trim()) {
      setError('Enter a maintenance reason.');
      return;
    }
    const res = await fetch('/api/setup/maintenance', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify(maintForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not place maintenance hold.');
      return;
    }
    onStateUpdated(data.state);
    setMaintForm((prev) => ({ ...prev, reason: '' }));
    if (Array.isArray(data.impactedBookings) && data.impactedBookings.length > 0) {
      setMessage(
        `Maintenance block scheduled. Overlapping bookings flagged for Manager review: ${data.impactedBookings.join(', ')}.`
      );
    } else {
      setMessage('Venue maintenance block scheduled cleanly.');
    }
  };

  const handleClearMaintenance = async (blockId: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/setup/maintenance/${blockId}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: authHeaders(false),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not clear maintenance hold.');
      return;
    }
    onStateUpdated(data.state);
    setMessage('Maintenance block cleared; venue reopened for scheduling.');
  };

  const handleSaveHallPricing = async (hall: Hall) => {
    setError('');
    setMessage('');
    const rates = hallRateInputs[hall.id] || {
      baseDayRate: hall.baseDayRate,
      halfDayRate: hall.halfDayRate,
    };
    const res = await fetch(`/api/setup/halls/${hall.id}/pricing`, {
      method: 'PUT',
      credentials: 'include',
      headers: authHeaders(true),
      body: JSON.stringify(rates),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not update hall Naira rates.');
      return;
    }
    onStateUpdated(data.state);
    setMessage(`Updated commercial Naira rates for ${hall.name}.`);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch('/api/setup/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        ...profileForm,
        bankAccounts: bankAccountsForm,
        cancellationPolicy: policyTiersForm,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not update hotel setup.');
      return;
    }
    onStateUpdated(data.state);
    setBankAccountsForm(data.state.profile.bankAccounts || []);
    setPolicyTiersForm(data.state.profile.cancellationPolicy || []);
    setMessage('Hotel pricing policy, remittance bank accounts, and cancellation rules updated.');
  };

  const handleAddCatering = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch('/api/setup/catering', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(newCatering),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not add catering package.');
      return;
    }
    onStateUpdated(data.state);
    setNewCatering({ name: '', category: 'Wedding & Social', pricePerHead: 18000, description: '' });
    setMessage('Added new hotel catering package.');
  };

  const handleDeleteCatering = async (id: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/setup/catering/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not remove catering package.');
      return;
    }
    onStateUpdated(data.state);
    setMessage('Removed catering package from catalog.');
  };

  const handleAddEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch('/api/setup/equipment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(newEquipment),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not add equipment item.');
      return;
    }
    onStateUpdated(data.state);
    setNewEquipment({ name: '', category: 'Audio', totalStock: 4, unitRate: 60000 });
    setMessage('Equipment stock item added.');
  };

  const handleRunJobs = async () => {
    setError('');
    setMessage('');
    const res = await fetch('/api/jobs/run', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Scheduled jobs failed.');
      return;
    }
    onStateUpdated(data.state);
    setMessage(
      `Scheduled jobs completed: ${data.summary.expiredHolds} hold(s) expired, ${data.summary.completedEvents} event(s) auto-completed, ${data.summary.flaggedOverdue} client(s) flagged overdue.`
    );
  };

  const handleDownloadBackup = async () => {
    const res = await fetch('/api/admin/backup', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hallbook-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelectRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setPendingRestoreJson({ fileName: file.name, payload: parsed });
    } catch {
      setError('Selected file is not valid JSON.');
    }
  };

  const handleConfirmRestoreBackup = async () => {
    if (!pendingRestoreJson) return;
    setError('');
    setMessage('');
    setRestoringBackup(true);
    try {
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(pendingRestoreJson.payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not restore JSON backup.');
        return;
      }
      onStateUpdated(data.state);
      setPendingRestoreJson(null);
      setMessage(`Database restored cleanly from ${pendingRestoreJson.fileName}.`);
    } catch {
      setError('Network error while restoring backup.');
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleConfirmGoLiveReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setResettingGoLive(true);
    try {
      const res = await fetch('/api/admin/reset-demo-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          confirmPhrase: goLivePhrase,
          confirmPassword: goLivePassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not clear demo records.');
        return;
      }
      onStateUpdated(data.state);
      setShowGoLiveReset(false);
      setGoLivePhrase('');
      setGoLivePassword('');
      setMessage('Sample demo bookings, clients, and ledger entries cleared. HallBook is ready for live hotel operations.');
    } catch {
      setError('Network error resetting demo records.');
    } finally {
      setResettingGoLive(false);
    }
  };

  const handleVerifyAccount = async (
    id: string,
    decision: 'approve' | 'reject',
    fallbackRole: StaffRole
  ) => {
    setError('');
    setMessage('');
    const chosenRole = verifyRoleMap[id] || fallbackRole;
    const res = await fetch(`/api/staff/${id}/verify-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ decision, role: chosenRole }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Account verification update failed.');
      return;
    }
    onStateUpdated(data.state);
    setMessage(
      decision === 'approve'
        ? `Staff account verified & activated as ${ROLE_LABELS[chosenRole]}.`
        : 'Staff registration request declined.'
    );
  };

  const handleUnlockAccount = async (id: string, name: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/staff/${id}/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        reason: lockReasonMap[id]?.trim() || 'Identity verified and lock cleared by System Admin',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not unlock account.');
      return;
    }
    onStateUpdated(data.state);
    setLockReasonMap((prev) => ({ ...prev, [id]: '' }));
    setMessage(`Unlocked account for ${name}. Failed login attempts reset to 0.`);
  };

  const handleLockAccount = async (id: string, name: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/staff/${id}/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        reason: lockReasonMap[id]?.trim() || 'Manual security lock placed by System Admin',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not lock account.');
      return;
    }
    onStateUpdated(data.state);
    setLockReasonMap((prev) => ({ ...prev, [id]: '' }));
    setMessage(`Placed security lock on ${name}.`);
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(newStaff),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to add staff member.');
      return;
    }
    onStateUpdated(data.state);
    setNewStaff({ name: '', email: '', username: '', role: 'booking_officer', password: '' });
    setMessage('Staff member onboarded and activated.');
  };

  const handleSetStaffPassword = async (id: string, memberName: string) => {
    const pw = passwordInputs[id] || '';
    setError('');
    setMessage('');
    if (pw.length < 6) {
      setError(`Enter a password of at least 6 characters for ${memberName}.`);
      return;
    }
    const res = await fetch(`/api/staff/${id}/password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ password: pw }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not update staff password.');
      return;
    }
    onStateUpdated(data.state);
    setPasswordInputs((prev) => ({ ...prev, [id]: '' }));
    setMessage(`Customized password saved for ${memberName}.`);
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!reassignFrom || !reassignTo) return;
    const res = await fetch(`/api/staff/${reassignFrom}/reassign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ toStaffId: reassignTo, reason: reassignReason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Reassignment failed.');
      return;
    }
    onStateUpdated(data.state);
    setReassignReason('');
    setMessage('Open bookings and tasks reassigned.');
  };

  const handleDeactivateStaff = async (id: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/staff/${id}/deactivate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Cannot deactivate staff member.');
      return;
    }
    onStateUpdated(data.state);
    setMessage('Staff account deactivated cleanly.');
  };

  const handleIssueResetCode = async (id: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/staff/${id}/reset-code`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not generate reset code.');
      return;
    }
    setMessage(
      `One-time reset code for ${data.name} (${data.username}): ${data.resetCode} — valid for 30 minutes via "Forgot password?" on Sign In.`
    );
  };

  const handleReportSystemError = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    const res = await fetch('/api/system/errors', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(newErrForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not log diagnostic issue.');
      return;
    }
    onStateUpdated(data.state);
    setNewErrForm({ source: 'operations', severity: 'warning', message: '', context: '' });
    setMessage('Diagnostic error logged and queued for System Admin resolution.');
  };

  const handleResolveSystemError = async (id: string) => {
    setError('');
    setMessage('');
    const res = await fetch(`/api/system/errors/${id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        resolutionNote:
          resolutionNotes[id]?.trim() || 'Investigated and verified clean by System Admin.',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not resolve system error.');
      return;
    }
    onStateUpdated(data.state);
    setResolutionNotes((prev) => ({ ...prev, [id]: '' }));
    setMessage('System error marked resolved.');
  };

  const handleToggleOverdue = async (clientId: string, overdueFlag: boolean) => {
    setError('');
    setMessage('');
    const reason = overdueReasonMap[clientId]?.trim() || '';
    if (!reason) {
      setError('Enter a reason before updating client overdue status.');
      return;
    }
    const res = await fetch(`/api/clients/${clientId}/overdue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ overdueFlag, reason }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not update client overdue status.');
      return;
    }
    onStateUpdated(data.state);
    setOverdueReasonMap((prev) => ({ ...prev, [clientId]: '' }));
    setMessage('Client overdue status updated in audit log.');
  };

  const filteredLogs = state.auditLogs.filter((l) =>
    auditFilter === 'high' ? l.highImpact : true
  );

  const subTabs: { id: SetupSubTab; label: string; show: boolean }[] = [
    {
      id: 'halls',
      label: `Venue Maintenance & Pictures${
        state.maintenanceBlocks.length > 0 ? ` (${state.maintenanceBlocks.length})` : ''
      }`,
      show: canEditVenueMedia,
    },
    {
      id: 'staff',
      label: isSysAdmin
        ? `Security, Locks & Resets${lockedAccounts.length > 0 ? ` (${lockedAccounts.length})` : ''}`
        : `Staff Hiring & Approvals${
            pendingAccounts.length > 0 ? ` (${pendingAccounts.length})` : ''
          }`,
      show: canManageSecurity || canVerifyAccounts,
    },
    { id: 'catalog', label: 'Commercial Pricing & Catalog', show: canEditPricing },
    { id: 'policy', label: 'Hotel & Pricing Policy', show: canEditPricing },
    {
      id: 'errors',
      label: `System Errors${openErrorsCount > 0 ? ` (${openErrorsCount})` : ''}`,
      show: isPrivileged,
    },
    {
      id: 'audit',
      label: isHigherAuth
        ? 'Clients & Full Audit Log'
        : isSysAdmin
        ? 'Security & Maintenance Audit'
        : 'My Account Activity Log',
      show: true,
    },
  ];

  return (
    <div className="space-y-6 scene-3d">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1F3A]">
            {isSysAdmin
              ? 'System Administration, Maintenance & Security'
              : canEditPricing
              ? 'Hotel Management, Pricing & Staff Governance'
              : isHigherAuth
              ? 'Executive Governance & Platform Audit'
              : 'My Account Activity Log'}
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            {isSysAdmin
              ? 'System Admin Console: venue maintenance holds, out-of-service toggles, venue pictures, locked account recovery, reset codes, diagnostics, and database restore.'
              : canEditPricing
              ? 'Manager Console: verify new staff accounts, reassign/deactivate departing staff, set Naira hall/banquet/gear tariffs, remittance banks, and credit overrides.'
              : isHigherAuth
              ? 'Executive Oversight: review hotel-wide audit trail, database backups, and platform governance.'
              : `Account-scoped audit trail for ${currentUser.name} (@${currentUser.username}). Only actions performed by your account are displayed here.`}
          </p>
        </div>

        {isPrivileged && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canRunSysJobs && (
              <button
                type="button"
                onClick={handleRunJobs}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <Play className="w-3.5 h-3.5 text-[#D4AF37]" />
                Run Scheduled Jobs
              </button>
            )}
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-[#0B1F3A] text-xs font-medium rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Database Backup
            </button>
            {canRunSysJobs && (
              <label className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-[#0B1F3A] text-xs font-medium rounded-lg transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#C89B3C]" />
                Restore Backup
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={handleSelectRestoreFile}
                  className="hidden"
                />
              </label>
            )}
            {canRunSysJobs && (
              <button
                type="button"
                onClick={() => setShowGoLiveReset((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 text-xs font-semibold rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Go-Live Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Inline Restore Backup Confirmation */}
      {pendingRestoreJson && canRunSysJobs && (
        <div className="p-5 bg-white border border-[#C89B3C] rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 depth-layer-1">
          <div className="text-xs">
            <p className="text-sm font-semibold text-[#0B1F3A]">
              Confirm Database Restore from {pendingRestoreJson.fileName}
            </p>
            <p className="text-slate-600 mt-0.5">
              Restoring overwrites active bookings, clients, halls, and financial ledger entries while preserving existing staff passwords. Download a fresh backup first if needed.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setPendingRestoreJson(null)}
              className="px-3.5 py-2 text-xs font-medium bg-slate-100 text-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={restoringBackup}
              onClick={handleConfirmRestoreBackup}
              className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] hover:bg-[#13294B] text-white rounded-lg"
            >
              {restoringBackup ? 'Restoring...' : 'Confirm & Restore'}
            </button>
          </div>
        </div>
      )}

      {/* Clean Go-Live Production Reset Panel (System Admin ONLY) */}
      {showGoLiveReset && canRunSysJobs && (
        <form
          onSubmit={handleConfirmGoLiveReset}
          className="p-5 bg-amber-50/70 border border-amber-300 rounded-xl space-y-4 depth-layer-1"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#0B1F3A]">
                Prepare Exclusive Serene Hotel for Live Operations (Clear Demo Data)
              </h2>
              <p className="text-xs text-slate-700 mt-0.5">
                Removes sample demo bookings, clients, payments, shifts, and waitlist records and resets receipt/booking numbering cleanly. Staff accounts, passwords, bank accounts, halls, photos, catering menus, and Naira pricing stay intact.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGoLiveReset(false)}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 shrink-0"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Type GO LIVE to confirm
              </label>
              <input
                type="text"
                value={goLivePhrase}
                onChange={(e) => setGoLivePhrase(e.target.value)}
                placeholder="GO LIVE"
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Your System Admin Password
              </label>
              <input
                type="password"
                value={goLivePassword}
                onChange={(e) => setGoLivePassword(e.target.value)}
                placeholder="Verify identity"
                className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white"
                required
              />
            </div>
            <button
              type="submit"
              disabled={resettingGoLive}
              className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white text-xs font-semibold rounded-lg"
            >
              {resettingGoLive ? 'Clearing Demo Data...' : 'Clear Sample Data for Go-Live'}
            </button>
          </div>
        </form>
      )}

      {/* Role Governance Notice */}
      {(isSysAdmin || canEditPricing) && (
        <div className="p-4 bg-[#0B1F3A] text-white rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-[#C89B3C]/40 depth-layer-1">
          <div className="flex items-start gap-2.5 text-xs">
            <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-[#F3DFAC]">
                {isSysAdmin
                  ? 'System Admin Scope: Venue Maintenance, Out-of-Service Control, Pictures, Security Locks & Diagnostics'
                  : 'Manager Scope: Commercial Pricing, Bookings & Approvals, Bank Policy & Staff Hiring'}
              </p>
              <p className="text-slate-200">
                {isSysAdmin
                  ? 'You are exclusively in charge of putting halls under maintenance, venue photography & capacities, unlocking locked accounts, issuing reset codes, resolving system errors, and database backup/restore. Commercial pricing, bookings, payments, and new staff approvals remain strictly with the Hotel Manager.'
                  : 'You are exclusively in charge of Naira hall/banquet/equipment pricing, tax & bank policies, booking approvals, payment voids, client credit clearance, and hiring/verifying/reassigning staff. Venue maintenance holds, security unlocks, password resets, and system diagnostics remain strictly with System Admin.'}
              </p>
            </div>
          </div>
          <span className="font-mono text-[11px] text-[#D4AF37] whitespace-nowrap shrink-0">
            Currency: {currency} (₦)
          </span>
        </div>
      )}

      {/* Segmented Navigation (hidden when staff only has their personal activity log) */}
      {isPrivileged && (
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl w-fit max-w-full overflow-x-auto">
          {subTabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 transition-colors ${
                  subTab === t.id
                    ? 'bg-[#0B1F3A] text-white shadow-sm'
                    : 'text-slate-600 hover:text-[#0B1F3A]'
                }`}
              >
                {t.label}
              </button>
            ))}
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
          {message}
        </div>
      )}

      {/* VENUE MAINTENANCE & PICTURES TAB (SYSTEM ADMIN ONLY) */}
      {subTab === 'halls' && canEditVenueMedia && (
        <div className="space-y-6">
          {/* System Admin Exclusive Venue Maintenance Control */}
          {canMaintain && (
            <section className="bg-white border border-amber-300/80 rounded-xl overflow-hidden depth-layer-1">
              <div className="px-5 py-4 bg-[#0B1F3A] text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-[#D4AF37]" />
                  <div>
                    <h2 className="text-sm font-semibold">
                      Venue Maintenance Holds ({state.maintenanceBlocks.length} Active)
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      Only System Admin can place a hall under scheduled maintenance or clear a hold. Turnaround buffers are automatically enforced.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
                <form onSubmit={handleAddMaintenance} className="lg:col-span-5 p-5 space-y-3 bg-slate-50/70">
                  <p className="text-xs font-semibold text-[#0B1F3A]">
                    Schedule Venue Maintenance Block
                  </p>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Target Hall
                    </label>
                    <select
                      value={maintForm.hallId}
                      onChange={(e) => setMaintForm({ ...maintForm, hallId: e.target.value })}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      {state.halls.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name} {!h.active ? '(Out of Service)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Date
                      </label>
                      <input
                        type="date"
                        value={maintForm.date}
                        onChange={(e) => setMaintForm({ ...maintForm, date: e.target.value })}
                        className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        Start
                      </label>
                      <input
                        type="time"
                        value={maintForm.startTime}
                        onChange={(e) => setMaintForm({ ...maintForm, startTime: e.target.value })}
                        className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">
                        End
                      </label>
                      <input
                        type="time"
                        value={maintForm.endTime}
                        onChange={(e) => setMaintForm({ ...maintForm, endTime: e.target.value })}
                        className="w-full px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Maintenance Reason
                    </label>
                    <input
                      type="text"
                      value={maintForm.reason}
                      onChange={(e) => setMaintForm({ ...maintForm, reason: e.target.value })}
                      placeholder="e.g. HVAC chiller servicing & lighting rig check"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
                  >
                    Place Venue Under Maintenance
                  </button>
                </form>

                <div className="lg:col-span-7 divide-y divide-slate-200 max-h-80 overflow-y-auto">
                  {state.maintenanceBlocks.length === 0 ? (
                    <div className="p-6 text-xs text-slate-500">
                      No timed maintenance blocks scheduled across hotel halls.
                    </div>
                  ) : (
                    state.maintenanceBlocks.map((m) => {
                      const hall = state.halls.find((h) => h.id === m.hallId);
                      return (
                        <div
                          key={m.id}
                          className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-[#0B1F3A]">
                              {hall?.name || m.hallId}{' '}
                              <span className="font-mono text-amber-800">
                                · {formatDate(m.date)} ({m.startTime}–{m.endTime})
                              </span>
                            </p>
                            <p className="text-slate-600 mt-0.5">
                              {m.reason} · Scheduled by {m.createdBy}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleClearMaintenance(m.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg font-semibold shrink-0 self-start sm:self-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Clear Hold
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          )}

          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Event Halls, Pictures & Service Availability ({state.halls.length})
              </h2>
              <p className="text-xs text-slate-500">
                Upload venue photography, maintain seating capacities & turnaround buffers, or place a hall Out of Service. Commercial Naira pricing is locked to the Hotel Manager.
              </p>
            </div>
            <button
              type="button"
              onClick={openCreateHall}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
              Add Physical Hall
            </button>
          </div>

          {(editingHall || creatingHall) && (
            <form
              onSubmit={handleSaveHall}
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-5 depth-layer-1"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-semibold text-[#0B1F3A]">
                  {editingHall ? `Edit Physical Venue — ${editingHall.name}` : 'Register New Event Hall'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingHall(null);
                    setCreatingHall(false);
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-4 space-y-3">
                  <div className="aspect-[16/10] bg-slate-100 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center">
                    {hallForm.imageUrl ? (
                      <img
                        src={hallForm.imageUrl}
                        alt={hallForm.name || 'Hall preview'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Building2 className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <label className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors">
                    <ImagePlus className="w-4 h-4 text-[#D4AF37]" />
                    Upload Venue Picture (JPG/PNG)
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleHallPhotoFile}
                      className="hidden"
                    />
                  </label>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Or Paste Image Path / URL
                    </label>
                    <input
                      type="text"
                      value={hallForm.imageUrl}
                      onChange={(e) => setHallForm({ ...hallForm, imageUrl: e.target.value })}
                      placeholder="/src/assets/images/..."
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Hall Name</label>
                    <input
                      type="text"
                      value={hallForm.name}
                      onChange={(e) => setHallForm({ ...hallForm, name: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={hallForm.description}
                      onChange={(e) => setHallForm({ ...hallForm, description: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Banquet Capacity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={hallForm.capacityBanquet}
                      onChange={(e) =>
                        setHallForm({ ...hallForm, capacityBanquet: Number(e.target.value) || 1 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Theatre Capacity
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={hallForm.capacityTheatre}
                      onChange={(e) =>
                        setHallForm({ ...hallForm, capacityTheatre: Number(e.target.value) || 1 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Turnaround / Clearing Buffer (Minutes)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={hallForm.bufferMinutes}
                      onChange={(e) =>
                        setHallForm({ ...hallForm, bufferMinutes: Number(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-xs font-semibold text-[#0B1F3A] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hallForm.active}
                        onChange={(e) => setHallForm({ ...hallForm, active: e.target.checked })}
                      />
                      Active & Open for Bookings (uncheck to mark Out of Service)
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
                >
                  {editingHall ? 'Save Venue Specs & Picture' : 'Create Venue'}
                </button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {state.halls.map((hall) => (
              <TiltCard3D
                key={hall.id}
                maxTilt={4}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col depth-layer-1"
              >
                <div className="aspect-[16/9] bg-slate-100 relative overflow-hidden">
                  {failedImages[hall.id] || !hall.imageUrl ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400">
                      <Building2 className="w-7 h-7 mb-1" />
                      <span className="text-xs">{hall.name}</span>
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
                <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-[#0B1F3A]">{hall.name}</h3>
                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          hall.active ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {hall.active ? 'Active Service' : 'Out of Service'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{hall.description}</p>
                    <p className="text-xs font-mono text-slate-500 mt-2 tabular-nums">
                      Banquet {hall.capacityBanquet} · Theatre {hall.capacityTheatre} · {hall.bufferMinutes}m buffer
                    </p>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                      Manager Tariff: {formatCurrency(hall.baseDayRate, currency)}/day ·{' '}
                      {formatCurrency(hall.halfDayRate, currency)} half-day
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => openEditHall(hall)}
                      className="py-2 text-xs font-semibold text-[#0B1F3A] bg-slate-100 hover:bg-[#0B1F3A] hover:text-white rounded-lg transition-colors"
                    >
                      Edit Picture & Specs
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleHallServiceStatus(hall)}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                        hall.active
                          ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-emerald-700 hover:bg-emerald-800 text-white'
                      }`}
                    >
                      {hall.active ? 'Mark Out of Service' : 'Reopen Venue'}
                    </button>
                  </div>
                </div>
              </TiltCard3D>
            ))}
          </div>
        </div>
      )}

      {/* MANAGER HR VERIFICATION & ROSTER OR SYSTEM ADMIN SECURITY LOCKS & RESETS */}
      {subTab === 'staff' && (canManageSecurity || canVerifyAccounts) && (
        <div className="space-y-6">
          {/* MANAGER ONLY: Pending Indoor Account Verification Queue */}
          {canVerifyAccounts && (
            <section className="bg-white border border-[#C89B3C]/50 rounded-xl overflow-hidden depth-layer-1">
              <div className="px-5 py-4 bg-[#0B1F3A] text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#D4AF37]" />
                  <div>
                    <h2 className="text-sm font-semibold">
                      Pending Indoor Account Verifications ({pendingAccounts.length})
                    </h2>
                    <p className="text-[11px] text-slate-300">
                      Only the Hotel Manager can approve newly registered staff logins and finalize their department role.
                    </p>
                  </div>
                </div>
              </div>

              {pendingAccounts.length === 0 ? (
                <div className="p-5 text-xs text-slate-500">
                  No pending staff account requests at this time.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {pendingAccounts.map((applicant) => {
                    const selectedRole = verifyRoleMap[applicant.id] || applicant.role;
                    return (
                      <div
                        key={applicant.id}
                        className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[#0B1F3A]">{applicant.name}</p>
                          <p className="font-mono text-slate-600 mt-0.5">
                            {applicant.email} · @{applicant.username} · Requested{' '}
                            <strong className="text-[#C89B3C]">{ROLE_LABELS[applicant.role]}</strong>
                          </p>
                          <p className="text-slate-400 font-mono mt-0.5">
                            Submitted {formatDateTime(applicant.createdAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <select
                            value={selectedRole}
                            onChange={(e) =>
                              setVerifyRoleMap((prev) => ({
                                ...prev,
                                [applicant.id]: e.target.value as StaffRole,
                              }))
                            }
                            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            {Object.entries(ROLE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleVerifyAccount(applicant.id, 'approve', applicant.role)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Verify & Activate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleVerifyAccount(applicant.id, 'reject', applicant.role)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-semibold rounded-lg"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Decline
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* SYSTEM ADMIN ONLY: Locked & At-Risk Accounts Console */}
          {isSysAdmin && (
            <section className="bg-white border border-red-200 rounded-xl overflow-hidden depth-layer-1">
              <div className="px-5 py-4 bg-red-950 text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#D4AF37]" />
                  <div>
                    <h2 className="text-sm font-semibold">
                      System Admin Locked Account Recovery ({lockedAccounts.length} Locked)
                    </h2>
                    <p className="text-[11px] text-red-200">
                      Accounts auto-lock after 5 failed attempts. Verify staff identity and unlock here.
                    </p>
                  </div>
                </div>
              </div>

              {lockedAccounts.length === 0 ? (
                <div className="p-5 text-xs text-slate-500">
                  Zero locked staff accounts currently reported.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {lockedAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="text-sm font-semibold text-red-900">
                          {acc.name}{' '}
                          <span className="font-normal text-slate-600">({ROLE_LABELS[acc.role]})</span>
                        </p>
                        <p className="font-mono text-slate-600 mt-0.5">
                          @{acc.username} · Locked at {formatDateTime(acc.lockedAt)} ·{' '}
                          <span className="text-red-700 font-semibold">{acc.lockedReason}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={lockReasonMap[acc.id] || ''}
                          onChange={(e) =>
                            setLockReasonMap((prev) => ({ ...prev, [acc.id]: e.target.value }))
                          }
                          placeholder="Unlock verification note"
                          className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg w-48"
                        />
                        <button
                          type="button"
                          onClick={() => handleUnlockAccount(acc.id, acc.name)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Unlock Account
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  {canManageSecurity
                    ? 'Staff Credentials, Reset Codes & Security Locks'
                    : 'Active Hotel Staff Directory'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {canManageSecurity
                    ? 'System Admin controls technical sign-in passwords, 30-min one-time reset codes, and manual security locks.'
                    : 'Manager reviews active staff status and deactivates departing personnel. Password resets and security unlocks belong to System Admin.'}
                </p>
              </div>
              <div className="divide-y divide-slate-200">
                {state.staff.map((member) => {
                  const statusLabel =
                    (member.approvalStatus ?? 'approved') === 'pending'
                      ? 'Pending Manager Verification'
                      : (member.approvalStatus ?? 'approved') === 'rejected'
                      ? 'Declined'
                      : member.locked
                      ? 'Locked'
                      : !member.active
                      ? 'Deactivated'
                      : member.hasPassword
                      ? 'Active · Custom password set'
                      : 'Active · Password not set yet';

                  return (
                    <div key={member.id} className="px-5 py-4 space-y-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[#0B1F3A]">{member.name}</p>
                            <span className="font-semibold text-[#C89B3C]">
                              {ROLE_LABELS[member.role]}
                            </span>
                          </div>
                          <p className="text-slate-500 font-mono mt-0.5">
                            {member.email} · @{member.username} ·{' '}
                            <span
                              className={
                                member.locked || (member.approvalStatus ?? 'approved') === 'rejected'
                                  ? 'text-red-700 font-semibold'
                                  : (member.approvalStatus ?? 'approved') === 'pending'
                                  ? 'text-amber-700 font-semibold'
                                  : member.hasPassword
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-amber-700 font-semibold'
                              }
                            >
                              {statusLabel}
                            </span>
                            {(member.failedAttempts || 0) > 0 && !member.locked && (
                              <span className="text-amber-700">
                                {' '}
                                · {member.failedAttempts} failed login(s)
                              </span>
                            )}
                          </p>
                        </div>
                        {member.active && (
                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {canManageSecurity && (
                              <button
                                type="button"
                                onClick={() => handleIssueResetCode(member.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-md font-medium"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                Reset Code
                              </button>
                            )}
                            {canManageSecurity && member.id !== currentUser.id && !member.locked && (
                              <button
                                type="button"
                                onClick={() => handleLockAccount(member.id, member.name)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-amber-800 hover:bg-amber-50 border border-amber-300 rounded-md font-medium"
                              >
                                <Lock className="w-3.5 h-3.5" />
                                Lock
                              </button>
                            )}
                            {canManageSecurity && member.locked && (
                              <button
                                type="button"
                                onClick={() => handleUnlockAccount(member.id, member.name)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-md font-medium"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                Unlock
                              </button>
                            )}
                            {canManageHR && member.id !== currentUser.id && (
                              <button
                                type="button"
                                onClick={() => handleDeactivateStaff(member.id)}
                                className="px-2.5 py-1.5 text-red-700 hover:bg-red-50 border border-red-200 rounded-md font-medium"
                              >
                                Deactivate
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {member.active && canManageSecurity && (
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input
                              type="password"
                              value={passwordInputs[member.id] || ''}
                              onChange={(e) =>
                                setPasswordInputs({ ...passwordInputs, [member.id]: e.target.value })
                              }
                              placeholder={`Set technical password for ${ROLE_LABELS[member.role]} (min 6 chars)`}
                              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSetStaffPassword(member.id, member.name)}
                            className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white font-semibold rounded-lg whitespace-nowrap shrink-0"
                          >
                            {member.hasPassword ? 'Update Password' : 'Assign Password'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="lg:col-span-5 space-y-6">
              {/* Direct Add Staff & Reassignment (Manager ONLY) */}
              {canVerifyAccounts ? (
                <>
                  <form
                    onSubmit={handleCreateStaff}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <h3 className="text-sm font-semibold text-[#0B1F3A] flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-[#C89B3C]" />
                      Directly Onboard Verified Staff
                    </h3>
                    <input
                      type="text"
                      value={newStaff.name}
                      onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                      placeholder="Full Name"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                    <input
                      type="email"
                      value={newStaff.email}
                      onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                      placeholder="Work Email (e.g. john@exclusiveserenehotel.com)"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newStaff.username}
                        onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                        placeholder="Username"
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
                        required
                      />
                      <select
                        value={newStaff.role}
                        onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value as StaffRole })}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        {Object.entries(ROLE_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="password"
                      value={newStaff.password}
                      onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                      placeholder="Initial Password (min 6 chars)"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
                    >
                      Create & Activate Staff Login
                    </button>
                  </form>

                  <form
                    onSubmit={handleReassign}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <h3 className="text-sm font-semibold text-[#0B1F3A]">
                      Reassign Departing Staff Workload
                    </h3>
                    <select
                      value={reassignFrom}
                      onChange={(e) => setReassignFrom(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      required
                    >
                      <option value="">From staff member...</option>
                      {state.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({ROLE_LABELS[s.role]})
                        </option>
                      ))}
                    </select>
                    <select
                      value={reassignTo}
                      onChange={(e) => setReassignTo(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      required
                    >
                      <option value="">To active replacement...</option>
                      {state.staff
                        .filter((s) => s.active)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({ROLE_LABELS[s.role]})
                          </option>
                        ))}
                    </select>
                    <input
                      type="text"
                      value={reassignReason}
                      onChange={(e) => setReassignReason(e.target.value)}
                      placeholder="Mandatory reassignment reason"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      required
                    />
                    <button
                      type="submit"
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-[#0B1F3A] text-xs font-semibold rounded-lg"
                    >
                      Reassign Open Bookings & Tasks
                    </button>
                  </form>
                </>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-2.5 text-xs text-slate-600">
                  <p className="font-semibold text-[#0B1F3A]">
                    IT Security & Password Support Only
                  </p>
                  <p>
                    As System Admin, you handle locked accounts (after 5 failed logins), manual security locks, 30-minute recovery reset codes, and technical password resets.
                  </p>
                  <p>
                    Hiring, approving new indoor registrations, reassigning open bookings, and deactivating departing staff remain exclusively with the <strong>Hotel Manager</strong>.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* SYSTEM ERRORS & DIAGNOSTICS TAB */}
      {subTab === 'errors' && isPrivileged && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-[#C89B3C]" />
                <div>
                  <h2 className="text-base font-semibold text-[#0B1F3A]">
                    System Error & Exception Diagnostics ({openErrorsCount} Open)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Captured server/client runtime incidents. System Admin investigates and marks resolved.
                  </p>
                </div>
              </div>
            </div>

            {(state.systemErrors || []).length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
                No diagnostic errors logged. System operating normally.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {(state.systemErrors || []).map((errItem) => (
                  <div key={errItem.id} className="p-5 space-y-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`font-mono font-semibold uppercase ${
                            errItem.status === 'resolved'
                              ? 'text-emerald-700'
                              : errItem.severity === 'critical'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {errItem.status} · {errItem.severity}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-600">{errItem.source}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">
                          Reported by {errItem.reportedBy || errItem.actorName || 'System'}
                        </span>
                      </div>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {formatDateTime(errItem.timestamp)}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-[#0B1F3A]">{errItem.message}</p>
                    {errItem.context && (
                      <p className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
                        {errItem.context}
                      </p>
                    )}

                    {errItem.status === 'resolved' ? (
                      <p className="text-emerald-800">
                        <strong>Resolved by {errItem.resolvedBy}:</strong> {errItem.resolutionNote} (
                        {formatDateTime(errItem.resolvedAt)})
                      </p>
                    ) : isSysAdmin ? (
                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={resolutionNotes[errItem.id] || ''}
                          onChange={(e) =>
                            setResolutionNotes((prev) => ({
                              ...prev,
                              [errItem.id]: e.target.value,
                            }))
                          }
                          placeholder="Resolution summary / root cause fix note"
                          className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => handleResolveSystemError(errItem.id)}
                          className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white font-semibold rounded-lg whitespace-nowrap"
                        >
                          Mark Resolved
                        </button>
                      </div>
                    ) : (
                      <p className="text-amber-800 italic">
                        Awaiting System Admin resolution.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <form
            onSubmit={handleReportSystemError}
            className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-3"
          >
            <h3 className="text-sm font-semibold text-[#0B1F3A]">Log Diagnostic Incident</h3>
            <p className="text-xs text-slate-500">
              Record hardware, printer, POS sync, or operational software errors for System Admin triage.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={newErrForm.source}
                onChange={(e) =>
                  setNewErrForm({
                    ...newErrForm,
                    source: e.target.value as SystemErrorRecord['source'],
                  })
                }
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="operations">Operations</option>
                <option value="client">Client App</option>
                <option value="auth">Authentication</option>
                <option value="server">Server / DB</option>
              </select>
              <select
                value={newErrForm.severity}
                onChange={(e) =>
                  setNewErrForm({
                    ...newErrForm,
                    severity: e.target.value as SystemErrorRecord['severity'],
                  })
                }
                className="px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="warning">Warning</option>
                <option value="error">Error</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <input
              type="text"
              value={newErrForm.message}
              onChange={(e) => setNewErrForm({ ...newErrForm, message: e.target.value })}
              placeholder="Concise issue summary (e.g. Receipt printer offline at Cashier Desk 2)"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              required
            />
            <textarea
              rows={3}
              value={newErrForm.context}
              onChange={(e) => setNewErrForm({ ...newErrForm, context: e.target.value })}
              placeholder="Terminal ID, booking ref, or error trace details"
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono"
            />
            <button
              type="submit"
              className="w-full py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
            >
              Submit Diagnostic Report
            </button>
          </form>
        </div>
      )}

      {/* COMMERCIAL PRICING, HALL TARIFFS & CATALOG TAB (MANAGER ONLY) */}
      {subTab === 'catalog' && canEditPricing && (
        <div className="space-y-6">
          {/* Manager Exclusive Hall Commercial Tariffs */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden depth-layer-1">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  Event Hall Commercial Tariffs ({currency})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manager-exclusive Naira hall rates. Venue photos, capacities, maintenance blocks, and out-of-service holds are managed by System Admin.
                </p>
              </div>
            </div>
            <div className="divide-y divide-slate-200">
              {state.halls.map((hall) => {
                const rates = hallRateInputs[hall.id] || {
                  baseDayRate: hall.baseDayRate,
                  halfDayRate: hall.halfDayRate,
                };
                return (
                  <div
                    key={hall.id}
                    className="px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={hall.imageUrl}
                        alt={hall.name}
                        referrerPolicy="no-referrer"
                        className="w-16 h-11 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-100"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#0B1F3A] truncate">
                          {hall.name}{' '}
                          {!hall.active && (
                            <span className="text-xs font-semibold text-red-700">
                              (Out of Service — System Admin)
                            </span>
                          )}
                        </p>
                        <p className="font-mono text-slate-500 mt-0.5 tabular-nums">
                          Banquet {hall.capacityBanquet} · Theatre {hall.capacityTheatre} · {hall.bufferMinutes}m buffer
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-2.5 shrink-0">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Full-Day Rate ({currency})
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={rates.baseDayRate}
                          onChange={(e) =>
                            setHallRateInputs((prev) => ({
                              ...prev,
                              [hall.id]: {
                                ...rates,
                                baseDayRate: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Half-Day Rate ({currency})
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={rates.halfDayRate}
                          onChange={(e) =>
                            setHallRateInputs((prev) => ({
                              ...prev,
                              [hall.id]: {
                                ...rates,
                                halfDayRate: Number(e.target.value) || 0,
                              },
                            }))
                          }
                          className="w-36 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSaveHallPricing(hall)}
                        className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white font-semibold rounded-lg"
                      >
                        Save Rates
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Catering Packages */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                Hotel Banquet Menus ({state.cateringPackages.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Clients can choose any package below, bring self-organized catering, or rent hall-only.
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {state.cateringPackages.map((pkg) => (
                <div key={pkg.id} className="px-5 py-3.5 flex items-start justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#0B1F3A]">{pkg.name}</p>
                    <p className="text-slate-500 mt-0.5">
                      {pkg.category} ·{' '}
                      <span className="font-mono font-semibold text-slate-800">
                        {formatCurrency(pkg.pricePerHead, currency)}/head
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCatering(pkg.id)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded-md"
                    aria-label={`Remove ${pkg.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddCatering} className="p-5 bg-slate-50 border-t border-slate-200 space-y-3">
              <p className="text-xs font-semibold text-slate-800">Add Banquet Package</p>
              <input
                type="text"
                value={newCatering.name}
                onChange={(e) => setNewCatering({ ...newCatering, name: e.target.value })}
                placeholder="Package name (e.g. Serene Abuja Silver Reception)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={newCatering.category}
                  onChange={(e) => setNewCatering({ ...newCatering, category: e.target.value })}
                  placeholder="Category"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="number"
                  min={0}
                  value={newCatering.pricePerHead}
                  onChange={(e) =>
                    setNewCatering({ ...newCatering, pricePerHead: Number(e.target.value) || 0 })
                  }
                  placeholder={`Price per head (${currency})`}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
              >
                Add Catering Package
              </button>
            </form>
          </section>

          {/* Equipment Inventory */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-[#0B1F3A]">
                AV & Staging Equipment Stock ({state.equipment.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Stock counts are enforced automatically during hall conflict checks.
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {state.equipment.map((eq) => (
                <div key={eq.id} className="px-5 py-3.5 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#0B1F3A]">{eq.name}</p>
                    <p className="text-slate-500 font-mono tabular-nums mt-0.5">
                      {eq.category} · {eq.totalStock} units · {formatCurrency(eq.unitRate, currency)}/event
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleAddEquipment} className="p-5 bg-slate-50 border-t border-slate-200 space-y-3">
              <p className="text-xs font-semibold text-slate-800">Add Equipment Stock</p>
              <input
                type="text"
                value={newEquipment.name}
                onChange={(e) => setNewEquipment({ ...newEquipment, name: e.target.value })}
                placeholder="Item name (e.g. Cold Spark Fountain Set)"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newEquipment.category}
                  onChange={(e) => setNewEquipment({ ...newEquipment, category: e.target.value })}
                  placeholder="Category"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
                <input
                  type="number"
                  min={1}
                  value={newEquipment.totalStock}
                  onChange={(e) =>
                    setNewEquipment({ ...newEquipment, totalStock: Number(e.target.value) || 1 })
                  }
                  placeholder="Qty"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
                <input
                  type="number"
                  min={0}
                  value={newEquipment.unitRate}
                  onChange={(e) =>
                    setNewEquipment({ ...newEquipment, unitRate: Number(e.target.value) || 0 })
                  }
                  placeholder={`Rate (${currency})`}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
              >
                Add Equipment Item
              </button>
            </form>
          </section>
          </div>
        </div>
      )}

      {/* HOTEL & PRICING POLICY TAB (MANAGER ONLY) */}
      {subTab === 'policy' && canEditPricing && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#0B1F3A]">
              Hotel Policy, Currency & Approval Thresholds
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Hotel Name</label>
                <input
                  type="text"
                  value={profileForm.hotelName}
                  onChange={(e) => setProfileForm({ ...profileForm, hotelName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Base Currency</label>
                <select
                  value={profileForm.currency}
                  onChange={(e) => setProfileForm({ ...profileForm, currency: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono"
                >
                  <option value="NGN">NGN (₦ Nigerian Naira)</option>
                  <option value="USD">USD ($ US Dollar)</option>
                  <option value="GBP">GBP (£ British Pound)</option>
                  <option value="EUR">EUR (€ Euro)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Tax Rate (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={profileForm.taxRatePercent}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, taxRatePercent: Number(e.target.value) || 0 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Default Hold Window (Hours)
                </label>
                <input
                  type="number"
                  value={profileForm.defaultHoldHours}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      defaultHoldHours: Number(e.target.value) || 48,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Lock Deposit Threshold (%)
                </label>
                <input
                  type="number"
                  value={profileForm.depositPercent}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, depositPercent: Number(e.target.value) || 50 })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Large Booking Days Threshold
                </label>
                <input
                  type="number"
                  value={profileForm.largeBookingDayThreshold}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      largeBookingDayThreshold: Number(e.target.value) || 3,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Large Booking Rooms Threshold
                </label>
                <input
                  type="number"
                  value={profileForm.largeBookingRoomThreshold}
                  onChange={(e) =>
                    setProfileForm({
                      ...profileForm,
                      largeBookingRoomThreshold: Number(e.target.value) || 25,
                    })
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={profileForm.twoManagerApprovalEnabled}
                    onChange={(e) =>
                      setProfileForm({
                        ...profileForm,
                        twoManagerApprovalEnabled: e.target.checked,
                      })
                    }
                  />
                  Require Dual-Manager Co-Approval on Large Exceptions
                </label>
              </div>
            </div>
          </section>

          {/* Hotel Remittance Bank Accounts Editor */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  Remittance Bank Accounts (Printed on Proformas & Invoices)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure the Exclusive Serene Hotel Abuja collection accounts shown to corporate and wedding clients.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBankAccountsForm((prev) => [
                    ...prev,
                    {
                      id: `bank-${Date.now()}`,
                      bankName: '',
                      accountName: state.profile.hotelName,
                      accountNumber: '',
                      branch: 'Wuye, Abuja',
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0B1F3A] text-xs font-semibold rounded-lg shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Bank Account
              </button>
            </div>
            <div className="space-y-3">
              {bankAccountsForm.map((acct, idx) => (
                <div
                  key={acct.id || idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg items-center"
                >
                  <input
                    type="text"
                    value={acct.bankName}
                    onChange={(e) =>
                      setBankAccountsForm((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, bankName: e.target.value } : row))
                      )
                    }
                    placeholder="Bank Name (e.g. Zenith Bank Plc)"
                    className="sm:col-span-3 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    required
                  />
                  <input
                    type="text"
                    value={acct.accountName}
                    onChange={(e) =>
                      setBankAccountsForm((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, accountName: e.target.value } : row
                        )
                      )
                    }
                    placeholder="Account Title"
                    className="sm:col-span-4 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    required
                  />
                  <input
                    type="text"
                    value={acct.accountNumber}
                    onChange={(e) =>
                      setBankAccountsForm((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, accountNumber: e.target.value } : row
                        )
                      )
                    }
                    placeholder="NUBAN Account No."
                    className="sm:col-span-2 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    required
                  />
                  <input
                    type="text"
                    value={acct.branch}
                    onChange={(e) =>
                      setBankAccountsForm((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, branch: e.target.value } : row))
                      )
                    }
                    placeholder="Branch"
                    className="sm:col-span-2 px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setBankAccountsForm((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="sm:col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg justify-self-end"
                    aria-label="Remove bank account"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Cancellation Policy Refund Tiers Editor */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  Cancellation Policy & Suggested Refund Tiers
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automatically calculates suggested refund vouchers when the Manager cancels a booking.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setPolicyTiersForm((prev) => [
                    ...prev,
                    { daysBefore: 7, refundPercent: 25, label: '7+ days prior to event' },
                  ])
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#0B1F3A] text-xs font-semibold rounded-lg shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Tier
              </button>
            </div>
            <div className="space-y-2.5">
              {policyTiersForm.map((tier, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-lg items-center"
                >
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Min Days Before Event
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={tier.daysBefore}
                      onChange={(e) =>
                        setPolicyTiersForm((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, daysBefore: Number(e.target.value) || 0 } : row
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">
                      Refund Eligible (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={tier.refundPercent}
                      onChange={(e) =>
                        setPolicyTiersForm((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, refundPercent: Number(e.target.value) || 0 }
                              : row
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                    />
                  </div>
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Policy Label</label>
                    <input
                      type="text"
                      value={tier.label}
                      onChange={(e) =>
                        setPolicyTiersForm((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, label: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setPolicyTiersForm((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="sm:col-span-1 p-2 text-red-600 hover:bg-red-50 rounded-lg justify-self-end"
                    aria-label="Remove cancellation tier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
              >
                Save Policy, Bank Accounts & Refund Rules
              </button>
            </div>
          </section>
        </form>
      )}

      {/* CLIENTS & AUDIT LOG TAB */}
      {subTab === 'audit' && (
        <div className="space-y-6">
          {currentUser.role === 'manager' && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h2 className="text-base font-semibold text-[#0B1F3A]">
                  Client Credit & Overdue Clearance
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Flagged clients require Manager approval on new bookings until cleared.
                </p>
              </div>
              <div className="divide-y divide-slate-200">
                {state.clients.map((c) => (
                  <div
                    key={c.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-[#0B1F3A]">
                        {c.name} <span className="font-normal text-slate-500">({c.organization})</span>
                      </p>
                      <p className="font-mono text-slate-500 mt-0.5">
                        {c.phone} ·{' '}
                        <span className={c.overdueFlag ? 'text-red-700 font-semibold' : 'text-emerald-700'}>
                          {c.overdueFlag ? `Overdue Flagged: ${c.overdueNotes}` : 'Good Standing'}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={overdueReasonMap[c.id] || ''}
                        onChange={(e) =>
                          setOverdueReasonMap({ ...overdueReasonMap, [c.id]: e.target.value })
                        }
                        placeholder="Mandatory reason"
                        className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs w-44"
                      />
                      <button
                        type="button"
                        onClick={() => handleToggleOverdue(c.id, !c.overdueFlag)}
                        className={`px-3 py-1.5 rounded-lg font-semibold ${
                          c.overdueFlag
                            ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                            : 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                        }`}
                      >
                        {c.overdueFlag ? 'Clear Flag' : 'Flag Overdue'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Role-Scoped Audit Log */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#C89B3C]" />
                <div>
                  <h2 className="text-base font-semibold text-[#0B1F3A]">
                    {isHigherAuth
                      ? 'Append-Only Platform Audit Log'
                      : isSysAdmin
                      ? 'System Admin Security, Maintenance & Diagnostics Audit'
                      : `My Account Activity Log (@${currentUser.username})`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {isHigherAuth
                      ? 'Immutable hotel-wide trace of all bookings, receipts, voids, pricing changes, maintenance, and account governance.'
                      : isSysAdmin
                      ? 'Scoped to your account plus venue maintenance, account locks, password resets, and system error resolutions.'
                      : 'Showing only actions performed by your account. Full platform audit & financial logs are restricted to higher authority.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setAuditFilter('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    auditFilter === 'all' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-slate-600'
                  }`}
                >
                  All Entries ({state.auditLogs.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAuditFilter('high')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    auditFilter === 'high' ? 'bg-white text-[#0B1F3A] shadow-sm' : 'text-slate-600'
                  }`}
                >
                  High-Impact Alerts
                </button>
              </div>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No activity entries recorded for your account under this filter yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className="px-5 py-3.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-slate-500">
                        <span className="font-mono font-semibold text-[#0B1F3A]">
                          {log.action.replace(/_/g, ' ')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {log.actorName} ({ROLE_LABELS[log.actorRole]})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{log.targetId}</span>
                        {log.highImpact && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[#C89B3C]">High-Impact</span>
                          </>
                        )}
                      </div>
                      <p className="mt-1 text-slate-800">{log.details}</p>
                      <p className="mt-0.5 text-slate-500">Reason: {log.reason}</p>
                    </div>
                    <span className="font-mono text-slate-500 tabular-nums shrink-0">
                      {formatDateTime(log.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
