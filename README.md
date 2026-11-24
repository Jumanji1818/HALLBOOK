# HallBook — Hotel Hall & Event Operations

**Staff-only operations platform** for hall bookings, room-block verification, catering coordination, payment ledger, guest check-in, and financial reporting.

Built for **Exclusive Serene Hotel** (Wuye, Abuja) and designed to be adapted for other hotels.

---

## Features

- **Multi-role staff access**: Manager, Booking Officer, Cashier, Front Desk, Operations, Owner/Auditor, System Admin
- **Hall bookings** with multiple sessions, layouts (Banquet, Theatre, Classroom, Cocktail, U-Shape), and conflict detection
- **Room-block verification** workflow between booking officers and front desk
- **Catering** (hotel packages + external caterers) and equipment reservations
- **Guest lists** and check-in
- **Payments ledger**, cashier shifts, deposits, refunds, and receipt reprinting
- **Waitlist** and maintenance blocks
- **Cancellation policy** tiers and financial reporting
- **Admin setup**: hotel profile, halls & pricing, catering packages, equipment, staff management, recovery key
- **Audit logs** and system error tracking
- Role-aware dashboards and navigation

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18, Vite 5, Tailwind CSS 4, Lucide, Motion |
| Backend     | Express (TypeScript)                |
| Database    | JSON file (`data/hallbook-db.json`) |
| Auth        | Custom (scrypt + signed cookies)    |
| Runtime     | Node.js 20+ recommended             |

> **Note**: The current data store is a single JSON file. Suitable for single-machine / low-concurrency use. For production multi-user environments, migrate to SQLite or PostgreSQL.

---

## Quick Start

### Prerequisites
- Node.js **20** or later
- npm 10+

### 1. Install dependencies

```bash
npm install
```

> If you encounter peer dependency warnings, you can safely use:
> ```bash
> npm install --legacy-peer-deps
> ```

### 2. Environment (optional)

```bash
cp .env.example .env
```

Edit `.env` only if you need Gemini AI features or a custom `APP_URL`.  
For local development the defaults are usually sufficient.

### 3. Run in development

```bash
npm run dev
```

The app starts at **http://localhost:3000**.

On first launch the system creates `data/hallbook-db.json` with seed data (Exclusive Serene Hotel halls, packages, sample staff, etc.).

### 4. First-time bootstrap

1. Open http://localhost:3000
2. You will see the **setup / claim** screen
3. Create the primary **Manager** or **System Admin** account and set a Hotel Recovery Key
4. After bootstrap, log in with the credentials you just created

All other staff accounts can later be created and approved by a manager / system admin.

---

## Available Scripts

| Command            | Description                              |
|--------------------|------------------------------------------|
| `npm run dev`      | Start development server (Express + Vite)|
| `npm run build`    | Build frontend for production            |
| `npm start`        | Run production server (after build)      |
| `npm run lint`     | Type-check with TypeScript               |
| `npm run clean`    | Remove build artifacts                   |

---

## Roles Overview

| Role              | Primary responsibilities                                      |
|-------------------|---------------------------------------------------------------|
| **Manager**       | Full operational control, approvals, amendments, cancellations|
| **Booking Officer**| Create & manage bookings, room blocks, guest lists           |
| **Cashier**       | Payments, shifts, refunds, receipts                           |
| **Front Desk**    | Room-block verification, guest check-in                       |
| **Operations**    | Catering status, equipment, event completion                  |
| **Owner / Auditor**| High-level reports and oversight                             |
| **System Admin**  | Staff management, halls, security, recovery key, media        |

Permissions are enforced both in the API and in the UI.

---

## Project Structure

```
├── server.ts              # Express API + Vite middleware (main entry)
├── src/
│   ├── App.tsx            # Root React application
│   ├── components/        # UI views and modals
│   ├── server/
│   │   └── seedData.ts    # Initial database + types
│   ├── types.ts           # Shared TypeScript types
│   └── utils/             # Formatting & permission helpers
├── data/                  # Created at runtime (JSON database)
├── .env.example
└── package.json
```

---

## Client Notes / Handover

- **Data location**: All operational data lives in `data/hallbook-db.json`. Back this file up regularly.
- **Recovery**: A Hotel Recovery Key is set during bootstrap. Store it securely — it is required for certain password resets.
- **Currency & tax**: Defaulted to NGN and 7.5% VAT. Changeable in Setup → Hotel Profile.
- **Images**: Hall images are stored under `src/assets/images/`.
- **Security**: This is an internal staff tool. Do not expose it publicly without additional hardening (HTTPS, proper cookie flags, rate limiting, reverse proxy, etc.).

### Recommended next steps for production

1. Replace the JSON file store with SQLite or PostgreSQL
2. Add automated backups
3. Pin exact dependency versions and document the Node version
4. Add basic automated tests for critical booking & payment flows
5. Split `server.ts` and the largest React components for maintainability
6. Configure proper production cookie settings and HTTPS

---

## License

Private / client project. All rights reserved.
