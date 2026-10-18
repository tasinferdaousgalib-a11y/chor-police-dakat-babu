# Chor • Police • Dakat • Babu — 4-player online game

A complete mobile-friendly multiplayer web game, deployable to Vercel. Each of the 4 players uses their own phone or computer. The host creates a room and shares a link; everyone receives a **private role**. Only the Police can submit guesses. The server validates guesses and updates everyone's scores. Includes in-room chat, an invite link, and endless rounds.

## Before you begin

You need **two free services**:

1. **Supabase** (database and anonymous player sessions — this keeps all 4 players in the same game).
2. **Vercel** (hosts the website and gives you a `.vercel.app` address).

No custom paid server is necessary. The app uses Supabase calls every ~2.3 seconds to refresh room state. Free-tier quotas and inactivity limits apply. It does **not** work across devices until you complete the Supabase setup below.

## 1. Configure Supabase

1. Create a free Supabase project at https://supabase.com/dashboard .
2. In **Authentication → Providers → Anonymous Sign-Ins**, enable anonymous sign-ins and save. This allows friends to join without registering.
3. Open **SQL Editor**, create a new query, paste the whole `supabase-setup.sql` file, and **Run**. It sets up tables and secure game functions. It is safe to run in a new project; for simplicity, dedicate a new Supabase project to this game.
4. Under **Project Settings → API** (or **Connect** in newer Supabase dashboards), get your **Project URL** and **publishable key** (or legacy `anon` public key). **Never use the secret `service_role` key in the browser.**

## 2. Test on your computer

Install Node.js 20 or later, then from this folder:

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

Then start:

```bash
npm run dev
```

Open the local URL displayed (usually `http://localhost:5173`). For a quick multiplayer test, use four different browser profiles, private windows, or devices; do not duplicate a tab within the same logged-in browser and expect a new identity.

## 3. Deploy to Vercel

1. Upload these source files to a **GitHub repository** (don't commit `.env.local` — it's excluded by `.gitignore`).
2. At https://vercel.com/new , choose **Add New → Project** and import your GitHub repository.
3. Framework preset: **Vite** (normally detected). Build command: `npm run build`; output directory: `dist`.
4. In Vercel's **Environment Variables**, add:

   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable / anon key

5. Click **Deploy**. Your Vercel project receives an address such as `your-game.vercel.app`.
6. Create a game on the deployed website and tap **Invite** to share a URL ending in `?room=XXXXXXXX` with three friends. They enter their player names and tap **Join the squad**.

If you add or change environment variables after deploying, **redeploy** the project.

## How to play (one common variation)

- Exactly 4 players are required. The host chooses **Deal the cards**.
- Each person privately receives one role: **Babu 👑**, **Police 👮**, **Dakat 🏴‍☠️**, **Chor 🥷**.
- The identity of the Police is known to the group. The other three roles remain secret until the reveal.
- Police must guess which two other players are **Chor** and **Dakat**, respectively. Police submits a single locked guess.
- Points per round:

  | Role | Points |
  |---|---|
  | Babu | 100, always |
  | Police | 80, only if *both* guesses are correct |
  | Dakat | 60 if not correctly identified, otherwise 0 |
  | Chor | 40 if not correctly identified, otherwise 0 |

- Once the Police submits, all roles are revealed and points are added. The host may start a new round. Highest cumulative score wins.

House rules for this childhood game vary from place to place. These rules are a playable default.

## Security / privacy

The raw tables and all roles are **not readable directly by website visitors**. They have row-level security enabled and no client table-read policies. Only authenticated room members can call the state function, which returns **their own** hidden role; all roles are shared only in the reveal phase. Round starts and guesses are enforced transactionally in the database, reducing race conditions. Players' display names and chat messages are shown to room members. Avoid sharing personal information in chat. Anonymous auth uses a browser session: clearing browser storage can lose your place in a running game. No moderation or abuse controls are included, so share room links with friends only.

## Folder structure

- `index.html` — page metadata and app entry
- `src/main.js` — screens, room join/create logic, chat, rendering, and polling
- `src/style.css` — responsive design
- `supabase-setup.sql` — tables, private roles, scoring and room/chat functions
- `.env.example` — example environment variables
- `vercel.json` — Vercel build and route configuration

## Troubleshooting

- **"Sign in ... Anonymous ..."**: Enable anonymous sign-ins in Supabase Authentication.
- **"Could not find the function public.cpd_create_room"**: Run `supabase-setup.sql` in the correct Supabase project and wait briefly for its API cache to refresh.
- **"You are not a member of this room"**: Return to the home screen and join using the original browser session or a new invite.
- **Website loads but friends cannot join**: Make sure the deployed Vercel site has the correct `VITE_SUPABASE_...` variables, the SQL has been run, and you've redeployed.
- **Invite link opens the home screen**: This is expected until the invited player enters their name and clicks Join.
