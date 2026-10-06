# My Planner (desktop + iPhone, synced)

Folder layout: `app/` = the planner (runs on desktop *and* as an iPhone web app) · `main.js` = desktop wrapper · `supabase-setup.sql` = sync database.

## 1. Sync (do once, ~5 min, free)
1. supabase.com → New project. Wait until ready.
2. SQL Editor → New query → paste `supabase-setup.sql` → Run.
3. Authentication → Providers → Email → turn **off** "Confirm email" (easiest).
4. Project Settings → API: copy the **Project URL** and the **anon public** key.
5. In the planner click ⚙, paste both, enter an email + password, **Create account**. On every other device use the same details and **Sign in**.

## 2. Desktop app without the terminal
**Easiest (no installs):** put this folder in a GitHub repo (public), then Actions tab → Build → run. When it finishes, download the installer artifact (`.exe` for Windows, `.dmg` for Mac) and double-click it.
**Or locally:** install Node.js once, then double-click `Build Windows installer.bat` (Mac: `Build Mac app.command`). Installer appears in `dist/`.
Delete any old `package-lock.json` first. Unsigned installers show a warning: Windows "More info → Run anyway"; Mac right-click → Open.

## 3. iPhone
Repo → Settings → Pages → Source: **GitHub Actions**. After the Build workflow runs, the site is at `https://<you>.github.io/<repo>/`.
Open it in **Safari** → Share → **Add to Home Screen**. Open the app, tap ⚙, sign in.
Phone: tap a task for the action bar, double-tap empty space to add, ＋ button for new task.
