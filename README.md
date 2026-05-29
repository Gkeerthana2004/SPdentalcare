# SP Dental Care — Landing & Admin Portal

Modern dental clinic website with public booking, doctor admin dashboard, and Supabase integration.

## Quick Start

```bash
npm install        # First time only
npm start          # → http://localhost:8080
```

- **Landing page**: [`/index.html`](http://localhost:8080) — browse services, book appointments
- **Doctor portal**: [`/dashboard.html`](http://localhost:8080/dashboard.html) — manage patients, appointments, ortho cases

Use Supabase Auth credentials to log into the dashboard (doctors created via `db/seed-doctors.js`).

## Project Structure

```
├── public/                         # Deployable static site
│   ├── index.html                  # Public landing page + booking
│   ├── dashboard.html              # Doctor/admin portal
│   ├── css/
│   │   ├── landing.css             # Premium light theme
│   │   └── admin.css               # Dark professional theme
│   └── js/
│       ├── supabase.js             # DB client & data layer
│       ├── supabase-config.js      # Auto-generated (from .env)
│       ├── landing.js              # Booking form logic
│       ├── admin.js                # Dashboard CRUD
│       └── chatbot.js              # Chat widget
├── db/                             # Database schema & tools
│   ├── setup.sql                   # Full schema + RLS + trigger
│   ├── create-tables.js            # Apply schema via API
│   └── seed-doctors.js             # Create auth users
├── scripts/                        # Build utilities
│   └── generate-supabase-config.js # Config file generator
├── .env                            # Supabase credentials
├── package.json
├── README.md
└── .gitignore
```

## Architecture

```
Browser (index.html / dashboard.html)
    │
    ├── localStorage (offline fallback — always available)
    │
    └── Supabase (persistent when configured)
            │
            DB Layer (public/js/supabase.js + public/js/admin.js)
            │
            get() — merges Supabase + localStorage by ID
            push() — writes to both, no data loss
            update() / delete() — syncs both sources
```

All operations write to localStorage first (instant UI), then sync to Supabase. If Supabase is down, local data persists until the next successful sync.

## Features

**Landing Page**: Hero with stats · 20 dental services · Doctor profiles · 4-step booking form · Gallery · Contact form · WhatsApp/Chat widgets · Holiday-aware scheduling

**Dashboard**: Supabase Auth login · Overview stats · Appointment CRUD · Patient records (add/view/edit/delete) · Orthodontic case tracker with visit logs · OPG report uploads · Clinic holiday management · Search & filter · Rate-limited login

## Database

Schema in `setup.sql` with 5 tables: `doctors`, `patients`, `appointments`, `orthodontics`, `opg_reports`. RLS enforced — authenticated doctors can manage all data; anyone can insert appointments (for public booking). Auth trigger auto-creates a doctor profile row on signup.

## Doctors

1 doctor account with password `Doctor@123`:

| Email | Name | Role |
|-------|------|------|
| saranya@spdental.com | Dr. Saranya Mohan | General Surgeon |

## API (SupabaseDB)

```javascript
// Patients
SupabaseDB.getPatients()
SupabaseDB.addPatient({id, name, phone, ...})
SupabaseDB.updatePatient(id, {updates})

// Appointments
SupabaseDB.getAppointments()
SupabaseDB.addAppointment({id, name, date, ...})
SupabaseDB.updateAppointment(id, {updates})
SupabaseDB.deleteAppointment(id)

// Orthodontics
SupabaseDB.getOrthodontics()
SupabaseDB.addOrthodonticCase({id, name, type, ...})
SupabaseDB.updateOrthodonticCase(id, {updates})
SupabaseDB.deleteOrthodonticCase(id)

// OPG Reports
SupabaseDB.getOPGReports()
SupabaseDB.getOPGReportsByPatient(pid)
SupabaseDB.getOPGReportsByOrtho(orthoId)
SupabaseDB.addOPGReport(report)
SupabaseDB.deleteOPGReport(id)
```

## Security

- **RLS**: All tables have row-level security. Authenticated doctors have full CRUD. Appointments table has a public INSERT policy for booking.
- **Auth trigger**: `handle_new_doctor()` — auto-creates doctor profile when a user signs up via Supabase Auth.
- **Rate limiting**: Dashboard login throttled (5 attempts/min). Booking forms rate-limited (5 submissions/min).
- **XSS**: All user input sanitized via `htmlEscape()`, `sanitizeName()`, `sanitizePhone()`, `sanitizeEmail()`. No inline onclick — uses `data-action` attributes with event delegation.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `public/js/supabase-config.js` not found | Run `npm run gen-config` or `npm start` (auto-generates) |
| Supabase errors | Verify table names match exactly. Check RLS policies in Supabase dashboard |
| Dashboard login fails | Doctor must exist in Auth — run `node db/seed-doctors.js` |
| `Database error saving new user` | Trigger issue — check `public.handle_new_doctor()` function exists |
| Booking doesn't save | Check browser console. Supabase connection fallback: localStorage |
| Styles broken | Verify file paths in `<link>` tags |

## Customization

- **Clinic info**: Edit sections in `index.html` (services, doctors, contact)
- **Colors**: CSS variables in `public/css/landing.css` and `public/css/admin.css`
- **Doctor list**: Add/remove doctors in both `index.html` booking form and `dashboard.html` select options

## Deployment

Static files only. Deploy to any static host:

```
Vercel / Netlify: push to GitHub → connect → auto-deploy
Docker:           FROM nginx:alpine && COPY . /usr/share/nginx/html
Traditional:      Copy files to web root
```

Set these environment variables in your hosting dashboard:

```
NEXT_PUBLIC_SUPABASE_URL=https://zbhrxegegtfdkjayymtq.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
```

## Dependencies

```json
{ "@supabase/supabase-js": "^2.105.3", "dotenv": "^17.4.2" }
```
