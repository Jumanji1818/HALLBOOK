import React, { useState } from 'react';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  ShieldCheck,
  User,
  UserPlus,
} from 'lucide-react';
import type { StaffRole, StaffUser } from '../types';
import { ROLE_LABELS } from '../types';
import { TiltCard3D } from './TiltCard3D';

interface AuthGateProps {
  needsBootstrap: boolean;
  hotelName: string;
  onAuthenticated: (token: string, user: StaffUser) => void;
}

type AuthViewMode = 'setup' | 'login' | 'register' | 'forgot';

const HOTEL_HERO_IMAGE = '/src/assets/images/serene_hotel_exterior_1795439748735.jpg';

const REGISTERABLE_ROLES: Exclude<StaffRole, 'manager'>[] = [
  'booking_officer',
  'cashier',
  'front_desk',
  'operations',
  'sys_admin',
  'owner',
];

export const AuthGate: React.FC<AuthGateProps> = ({
  needsBootstrap,
  hotelName,
  onAuthenticated,
}) => {
  const [viewMode, setViewMode] = useState<AuthViewMode>(needsBootstrap ? 'setup' : 'login');
  const [heroError, setHeroError] = useState(false);

  // Setup state
  const [fullName, setFullName] = useState('Evelyn Okafor');
  const [setupEmail, setSetupEmail] = useState('evelyn.okafor@exclusiveserenehotel.com');
  const [setupUsername, setSetupUsername] = useState('manager');
  const [setupRole, setSetupRole] = useState<'manager' | 'sys_admin'>('manager');
  const [recoveryKey, setRecoveryKey] = useState('');

  // Indoor self-registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regRole, setRegRole] = useState<Exclude<StaffRole, 'manager'>>('booking_officer');
  const [regSubmittedMsg, setRegSubmittedMsg] = useState('');

  // Login & reset shared state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (mode: AuthViewMode) => {
    setError('');
    setSuccessMsg('');
    setRegSubmittedMsg('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setViewMode(mode);
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (!setupEmail.trim() || !setupEmail.includes('@')) {
      setError('Enter a valid work email address.');
      return;
    }
    if (setupUsername.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Your customized password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (recoveryKey.trim().length < 6) {
      setError('Hotel recovery key must be at least 6 characters.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName.trim(),
          email: setupEmail.trim(),
          username: setupUsername.trim(),
          role: setupRole,
          password,
          recoveryKey: recoveryKey.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Initialization failed.');
        return;
      }
      onAuthenticated(data.token, data.user);
    } catch {
      setError('Unable to reach HallBook server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!identifier.trim() || !password) {
      setError('Enter your work email or username and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Invalid credentials.');
        return;
      }
      onAuthenticated(data.token, data.user);
    } catch {
      setError('Unable to reach HallBook server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRegSubmittedMsg('');
    if (!regName.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError('Enter a valid hotel work email address.');
      return;
    }
    if (regUsername.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          username: regUsername.trim(),
          role: regRole,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Account registration failed.');
        return;
      }
      setRegSubmittedMsg(
        data.message ||
          'Account request submitted. Your login remains pending until verified and activated by the Hotel Manager.'
      );
      setRegName('');
      setRegEmail('');
      setRegUsername('');
      setPassword('');
      setConfirmPassword('');
    } catch {
      setError('Unable to reach HallBook server.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!identifier.trim() || !recoveryCodeInput.trim()) {
      setError('Enter your email or username and recovery key or admin reset code.');
      return;
    }
    if (password.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          recoveryCode: recoveryCodeInput.trim(),
          newPassword: password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Password reset failed.');
        return;
      }
      setRecoveryCodeInput('');
      setPassword('');
      setConfirmPassword('');
      setViewMode('login');
      setSuccessMsg(data.message || 'Password updated. You can now sign in.');
    } catch {
      setError('Unable to reach HallBook server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#F7F8FA] via-[#F1EFE9] to-[#E9EEF5] flex items-center justify-center px-4 py-8 sm:px-6 lg:px-10 scene-3d">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 bg-white border border-slate-200/90 rounded-2xl overflow-hidden depth-layer-2">
        {/* Left Luxury Hotel Visual Showcase Column */}
        <div className="lg:col-span-5 relative min-h-[280px] lg:min-h-[640px] bg-[#0B1F3A] flex flex-col justify-between overflow-hidden p-6 sm:p-8">
          {!heroError && (
            <img
              src={HOTEL_HERO_IMAGE}
              alt={hotelName}
              referrerPolicy="no-referrer"
              onError={() => setHeroError(true)}
              className="absolute inset-0 w-full h-full object-cover opacity-55"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/70 to-[#0B1F3A]/45" />

          <div className="relative z-10 flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#F3DFAC] tracking-wider uppercase">
              <Building2 className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>Internal Staff Suite</span>
            </div>
            <span className="text-[11px] font-mono text-slate-300 tracking-wide">Wuye · Abuja</span>
          </div>

          <div className="relative z-10 my-auto py-4">
            <TiltCard3D
              maxTilt={5}
              className="rounded-xl border border-[#C89B3C]/35 bg-[#0B1F3A]/75 backdrop-blur-md p-5 sm:p-6 space-y-3 shadow-xl"
            >
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[#D4AF37]">
                HallBook Hospitality Operations
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                {hotelName}
              </h1>
              <div className="gold-hairline w-full" />
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                Private staff console for luxury venue scheduling, room-block verification, banquet coordination, and immutable Naira receipt accounting.
              </p>
            </TiltCard3D>
          </div>

          <div className="relative z-10 flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
            <MapPin className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
            <span>
              Plot 31, Reuben Okoya Crescent, by Olusegun Obasanjo Way, Wuye, FCT Abuja · +234 813 292 8544
            </span>
          </div>
        </div>

        {/* Right Authentication Form Panel */}
        <div className="lg:col-span-7 p-7 sm:p-11 lg:p-12 flex flex-col justify-center bg-white">
          {viewMode === 'setup' && needsBootstrap ? (
            <form onSubmit={handleBootstrap} className="space-y-5 max-w-md w-full mx-auto">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C89B3C]">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>First-Run Hotel Setup</span>
                </div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                  Initialize Staff Access
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Create your primary administrator login and hotel recovery key. Staff passwords and pending approvals are managed inside Setup.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Evelyn Okafor"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Primary Role
                  </label>
                  <select
                    value={setupRole}
                    onChange={(e) => setSetupRole(e.target.value as 'manager' | 'sys_admin')}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                  >
                    <option value="manager">Manager</option>
                    <option value="sys_admin">System Admin</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      value={setupEmail}
                      onChange={(e) => setSetupEmail(e.target.value)}
                      placeholder="name@exclusiveserenehotel.com"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={setupUsername}
                      onChange={(e) => setSetupUsername(e.target.value)}
                      placeholder="manager"
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Your Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Hotel Recovery Key / Phrase
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="e.g. serene-hotel-vault-2026"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                    required
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Keep this offline phrase safe for emergency Forgot Password resets.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#13294B] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                {submitting ? 'Setting Up Exclusive Serene Hotel...' : 'Complete Setup & Sign In'}
              </button>
            </form>
          ) : viewMode === 'register' ? (
            <form onSubmit={handleRegister} className="space-y-4 max-w-md w-full mx-auto">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0B1F3A]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#C89B3C]">
                  Indoor Staff Onboarding
                </p>
                <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                  Create Staff Account
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Request personal access for {hotelName}. New accounts remain inactive until verified by the Hotel Manager.
                </p>
              </div>

              {regSubmittedMsg ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex items-start gap-2.5 text-sm text-emerald-900">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Registration Submitted for Manager Verification</p>
                      <p className="text-xs leading-relaxed text-emerald-800">{regSubmittedMsg}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full py-2.5 bg-[#0B1F3A] hover:bg-[#13294B] text-white text-xs font-semibold rounded-lg"
                  >
                    Return to Sign In
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        placeholder="e.g. Chinedu Eze"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Requested Department
                      </label>
                      <select
                        value={regRole}
                        onChange={(e) =>
                          setRegRole(e.target.value as Exclude<StaffRole, 'manager'>)
                        }
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      >
                        {REGISTERABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Work Email
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="email"
                          value={regEmail}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="name@exclusiveserenehotel.com"
                          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Username
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          value={regUsername}
                          onChange={(e) => setRegUsername(e.target.value)}
                          placeholder="e.g. chinedu.eze"
                          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Min 6 characters"
                          className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-700"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Confirm Password
                      </label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#13294B] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                  >
                    {submitting ? 'Submitting Request...' : 'Submit Account for Verification'}
                  </button>
                </>
              )}
            </form>
          ) : viewMode === 'forgot' ? (
            <form onSubmit={handleForgotReset} className="space-y-5 max-w-md w-full mx-auto">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-[#0B1F3A]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>

              <div className="space-y-1.5">
                <h2 className="font-display text-2xl font-bold tracking-tight text-[#0B1F3A]">
                  Reset Staff Password
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Enter your work email or username along with the Hotel Recovery Key or a one-time Reset Code issued by your System Admin.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Work Email or Username
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="name@exclusiveserenehotel.com or username"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Recovery Key or Admin Reset Code
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={recoveryCodeInput}
                    onChange={(e) => setRecoveryCodeInput(e.target.value)}
                    placeholder="Enter hotel recovery key or reset code"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full pl-9 pr-9 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                    required
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#13294B] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
              >
                {submitting ? 'Updating Password...' : 'Reset Password'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6 max-w-md w-full mx-auto">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#C89B3C]">
                  Authorized Hotel Staff
                </p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#0B1F3A]">
                  Sign in to {hotelName}
                </h2>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Enter your assigned staff email or username and personal password.
                </p>
              </div>

              {successMsg && (
                <div className="flex items-center gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3.5 py-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Work Email or Username
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="name@exclusiveserenehotel.com or username"
                      autoComplete="username"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      required
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-semibold text-[#0B1F3A] hover:text-[#C89B3C] underline underline-offset-4 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your personal password"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C89B3C] focus:border-[#0B1F3A]"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-2.5 p-0.5 text-slate-400 hover:text-slate-700"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">
                  {error}
                </p>
              )}

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#13294B] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                >
                  {submitting ? 'Verifying Credentials...' : 'Sign In'}
                </button>

                <div className="gold-hairline w-full my-1" />

                <button
                  type="button"
                  onClick={() => switchMode('register')}
                  className="w-full py-2.5 px-4 bg-white hover:bg-[#F7F8FA] border border-[#C89B3C]/60 text-[#0B1F3A] text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4 text-[#C89B3C]" />
                  Create New Staff Account
                </button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                New staff requests are verified by the Hotel Manager. Locked accounts are unlocked by System Admin.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
