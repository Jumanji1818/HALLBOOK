# HallBook — Deployment Guide

This guide covers how to run HallBook on a server so staff can access it from computers and phones.

---

## Current Architecture

- **Backend + Frontend**: Single Node.js process (Express + Vite build)
- **Database**: JSON file (`data/hallbook-db.json`) — temporary until MySQL migration
- **Port**: 3000 by default (configurable via `PORT`)

---

## Option A — Local Network / Office Server (Quickest)

Best when the app only needs to be used inside the hotel / office.

### Requirements
- A computer that stays on (Windows, Linux, or Mac)
- Node.js 20+

### Steps

1. Clone / copy the project onto the machine.
2. Install and build:

```bash
npm install
npm run build
```

3. Start in production mode:

```bash
NODE_ENV=production npm start
```

4. Find the machine’s local IP (e.g. `192.168.1.45`).
5. Staff open on any device (phone, laptop):

```
http://192.168.1.45:3000
```

### Tips
- Keep the machine on and the terminal/process running (or use PM2 — see below).
- For a more permanent setup, use a process manager:

```bash
npm install -g pm2
pm2 start server.ts --name hallbook --interpreter tsx
# or after build:
pm2 start npm --name hallbook -- start
pm2 save
pm2 startup
```

---

## Option B — Cloud / VPS (Recommended for real use)

Use any Linux VPS (DigitalOcean, Linode, AWS Lightsail, Contabo, etc.) or a Node-friendly host (Railway, Render, Fly.io).

### Basic VPS steps

1. Install Node.js 20+
2. Clone the repo
3. Install + build:

```bash
npm install
npm run build
```

4. Create a `.env` file:

```env
NODE_ENV=production
PORT=3000
APP_URL=https://your-domain.com
SESSION_SECRET=generate-a-long-random-string-here
```

5. Run with PM2 (recommended):

```bash
npm install -g pm2
pm2 start npm --name hallbook -- start
pm2 save
pm2 startup
```

6. Put **Nginx** (or Caddy) in front for HTTPS:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    # SSL certificates (Let's Encrypt / Certbot)

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Important Production Notes

### Data & Backups
- All data currently lives in `data/hallbook-db.json`.
- **Back this file up daily.**
- System Admins / Managers / Owners can also download a backup from the app (`/api/admin/backup`).
- After switching to MySQL later, set up proper database backups.

### Security
- Always use **HTTPS** in production.
- Set a strong `SESSION_SECRET` in `.env`.
- Restrict who can reach the server (firewall / VPN if possible).
- Do not expose the raw JSON data folder publicly.

### First Login
1. Open the site
2. Complete the **bootstrap** screen (create first Manager or System Admin + Recovery Key)
3. Store the Recovery Key somewhere safe

---

## Phone Access Checklist

| Scenario | How staff access |
|----------|------------------|
| Same Wi-Fi as server | `http://SERVER_IP:3000` |
| Outside network | Deploy with domain + HTTPS |
| Offline | Not supported (needs server) |

The interface already has a mobile bottom navigation. Dense screens (tables, wizards) work best on tablet or desktop but are usable on phones.

---

## Next Major Upgrade (when laptop is available)

Replace the JSON file with **MySQL**.  
After that change, the same deployment steps above still apply — only the data layer changes.

---

## Quick Commands Reference

```bash
# Development
npm run dev

# Production build + run
npm run build
NODE_ENV=production npm start

# With PM2
pm2 start npm --name hallbook -- start
pm2 logs hallbook
pm2 restart hallbook
```
