# Vehicle Control Sheet — Loan/Return Tracker

A mobile-friendly web app to replace the paper "Vehicle Control Sheet". Staff loan and return
company cars from their phones, and admins manage the fleet, staff list, and shift records.

## What it does

- **Dashboard** — shows every car with a live status: Available (green), Loaned (red, with
  who has it and since when), or Maintenance (grey).
- **Loan a car** — tap a car, enter your staff number. If it's recognized, your name fills in
  automatically. If not, you're prompted to register it on the spot (number + name).
- **Return a car** — tap "Return", confirm the staff number returning it.
- **Shift tracking** — every loan is automatically tagged as Day (06:00–18:00) or Night
  (18:00–06:00), with the correct calendar date even when a night shift crosses midnight.
- **Admin panel** (password-protected):
  - Add/remove cars, mark a car Available / Maintenance (blocked while a car is actively loaned).
  - Add staff manually or bulk-import via CSV (column A = staff number, column B = name).
  - View & filter the full loan history by date, shift, staff number, or car — and export to CSV.
  - "Force return" to correct a record if someone forgot to check a car back in through the app.

## Project structure

```
vehicle-loan-system/
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── backend/
    ├── server.js          # Express app entry point
    ├── db.js              # SQLite schema & connection
    ├── shiftUtil.js        # Day/Night shift calculation
    ├── adminAuth.js
    ├── routes/
    │   ├── cars.js         # public: list cars
    │   ├── staff.js        # public: verify/add staff number
    │   ├── loans.js        # public: issue/return/history
    │   └── admin.js        # protected: manage cars/staff/records
    └── public/              # frontend (dashboard + admin panel)
```

## Deploying on your VPS (Docker)

1. Copy this whole folder to your VPS.
2. Copy the env file and set a real admin password:
   ```bash
   cp .env.example .env
   nano .env   # set ADMIN_PASSWORD to something strong
   ```
3. Build and start:
   ```bash
   docker compose up -d --build
   ```
4. The app will be running on `http://<your-vps-ip>:3000`.
5. Data (the SQLite database) persists in a Docker volume (`vehicle_loan_data`), so it survives
   restarts and rebuilds.

## Deploying via Portainer

There are two ways to get this into Portainer. Option A is the quickest if you just want it
running today. Option B is better long-term because Portainer can rebuild it automatically
whenever you push updates.

### Option A — build the image once by hand, then run it from Portainer

1. Copy the project folder to your VPS (e.g. via `scp` or `sftp`) — anywhere, e.g. `/opt/vehicle-loan-system`.
2. SSH in and build the image once:
   ```bash
   cd /opt/vehicle-loan-system
   docker build -t vehicle-loan-app:latest .
   ```
3. In Portainer: **Stacks → Add stack → Web editor**, name it `vehicle-loan-app`, and paste:
   ```yaml
   services:
     vehicle-loan-app:
       image: vehicle-loan-app:latest
       container_name: vehicle-loan-app
       restart: unless-stopped
       ports:
         - "3000:3000"
       environment:
         - ADMIN_PASSWORD=your_real_password_here
         - PORT=3000
       volumes:
         - vehicle_loan_data:/app/data

   volumes:
     vehicle_loan_data:
   ```
4. Set a real `ADMIN_PASSWORD` value, then **Deploy the stack**.
5. To ship an update later: pull your changed files onto the VPS, re-run the `docker build` command, then in Portainer hit **Pull and redeploy** (or just restart the stack — it'll use the new local image tag).

### Option B — let Portainer build it from a Git repository

1. Push this project folder to a Git repo (GitHub, GitLab, or a self-hosted one Portainer can reach).
2. In Portainer: **Stacks → Add stack → Repository**.
3. Fill in the repo URL, branch, and set **Compose path** to `docker-compose.yml` (it's at the repo root).
4. Under **Environment variables**, add `ADMIN_PASSWORD` with a real value (this is what fills in the `${ADMIN_PASSWORD}` placeholder in the compose file — no `.env` file needed).
5. Deploy. Portainer will clone the repo, build the image from the included `Dockerfile`, and start it.
6. To update later: push changes to the repo, then use Portainer's **Pull and redeploy** button on the stack.

Either way, the SQLite database lives in the `vehicle_loan_data` named volume, so redeploying or rebuilding the image never wipes your car/staff/loan data — only deleting the volume itself would.

### Recommended: put it behind HTTPS

The app itself has no built-in HTTPS or login page for the main dashboard (by design — it's meant
to be quick for staff on shift). For real use, put it behind a reverse proxy so traffic is
encrypted and the app isn't directly exposed on a raw port:

- **Nginx + Certbot** — point a subdomain (e.g. `vehicles.yourcompany.com`) at the VPS, reverse
  proxy to `localhost:3000`, and get a free TLS cert with Let's Encrypt.
- Alternatively, **Caddy** does this in about 3 lines of config with automatic HTTPS.

Once that's set up, change the `ports` mapping in `docker-compose.yml` to bind only to
`127.0.0.1:3000:3000` so the app isn't reachable directly from the internet, only through the proxy.

## Admin access

- The admin panel (`/admin.html`) is protected by a single shared password, set via
  `ADMIN_PASSWORD` in `.env`.
- There's no separate login for the main dashboard — anyone on your network/site can loan or
  return a car, which matches how the paper sheet worked (open to whoever's on shift).
- Change `ADMIN_PASSWORD` before going live — the example value is not secure.

## Staff CSV import format

No header row required. Two columns:

| Column A (staff number) | Column B (name) |
|---|---|
| 12345 | Ahmed Ali |
| 12346 | Sara Khan |

If a header row is included, the importer will skip a first row that looks like one
(e.g. contains "staff number").

## Local development (without Docker)

```bash
cd backend
npm install
cp ../.env.example .env    # or create backend/.env directly
node server.js
```
Visit `http://localhost:3000`.

## Notes / things you may want to extend later

- Currently there's one shared admin password. If you want individual admin logins with
  audit trails (who changed what), that's a natural next step.
- The "Team" field on a loan is a free-text box — if your teams are a fixed list
  (e.g. LSM, Engineer B1, Engineer B2, Cat A, Cabin), it could be turned into a dropdown to
  keep records consistent.
- No SMS/email notifications currently — could be added if you want reminders for cars
  loaned for longer than expected.
