# Mafia: The Underground Society

A cinematic, realtime multiplayer Mafia party game built with the PERN stack (PostgreSQL, Express, React, Node.js) and Socket.io. Experience the tension of an underground secret society through a polished, noir-inspired interface.

## 🎬 Project Overview

**Mafia: The Underground Society** is a social deduction game where players are assigned secret identities. The Mafia must eliminate the townspeople, while the Civilians and the Medic must work together to identify and lynch the Mafia before it's too late.

### ✨ Key Features
- **Cinematic UI/UX:** A high-end "Matte Black & Antique Gold" aesthetic with glassmorphism and smooth animations.
- **Realtime Synchronization:** Powered by Socket.io for instantaneous phase transitions, voting, and chat.
- **Narrator (TTS):** A browser-based Text-to-Speech narrator that announces game phases and results.
- **Identity Persistence:** Seamless reconnection support. If you lose your connection, the "Command Center" helps you intercept your previous frequency and jump back into the action.
- **Account Management:** Authentication via Better Auth with accounts stored in Neon Postgres (Email/Password & optional Google), including customizable usernames.
- **Host Game Settings:** Discussion and voting timers, anonymous or public votes (see who voted for whom), and optional role reveal on death. Hosts can also remove players from the lobby.
- **Private Channels:** A Mafia-only line at night, and a graveyard chat where eliminated players can talk to each other.
- **Detective (optional):** Host can enable a Detective for 6+ player games, who privately investigates one player each night.
- **Smarter Voting:** Skip votes, and the ballot closes as soon as everyone has voted.
- **Ranks & Progress:** Every finished game earns XP; levels unlock mafia ranks from Street Rat to Don, with a leaderboard of the top players.
- **Your Dossier:** Pick an avatar, change your codename, track your stats, or permanently delete your account.
- **Restart-Proof Games:** Game state is saved to Postgres, so a server restart or deploy only causes a brief reconnect instead of ending the game.
- **Garbage Collection:** Automated backend cleanup to ensure server stability by pruning inactive rooms.

## 🛠️ Tech Stack

- **Frontend:** React (Vite), Framer Motion, Bootstrap 5, Socket.io-client.
- **Backend:** Node.js, Express, Socket.io.
- **Database & Auth:** Neon (PostgreSQL) + Better Auth.
- **Icons:** React Bootstrap Icons.
- **Narrator:** Web Speech API.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A [Neon](https://neon.tech) Postgres project (stores user accounts).

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/mafia-game.git
cd mafia-game
```

### 2. Backend Setup
1. Navigate to the backend folder: `cd backend`
2. Install dependencies: `npm install`
3. Create a `.env` file based on `.env.example`:
   ```env
   PORT=5000
   DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=verify-full   # Neon -> Connect (pooled)
   BETTER_AUTH_SECRET=<random 32+ chars>
   BETTER_AUTH_URL=http://localhost:5173   # the FRONTEND url
   GOOGLE_CLIENT_ID=        # optional
   GOOGLE_CLIENT_SECRET=    # optional
   ```
4. Create the auth, `player_stats` and `game_rooms` tables in Neon: `npm run migrate` (safe to re-run)
5. Start the server: `npm run dev` (auto-restart) or `npm start`

### 3. Frontend Setup
1. Navigate to the frontend folder: `cd ../frontend`
2. Install dependencies: `npm install`
3. Optionally create a `.env` (defaults shown):
   ```env
   VITE_SOCKET_URL=http://localhost:5000
   VITE_API_PROXY_TARGET=http://localhost:5000
   ```
4. Start the development server: `npm run dev`

Auth requests go to `/api/auth/*` on the frontend's own origin and are proxied to the backend (Vite proxy in dev, `frontend/vercel.json` in production), so login cookies stay first-party.

---

## ☁️ Deployment Guide

### Backend (Render)
1. **New Web Service:** Connect your GitHub repo.
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. **Environment Variables:** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (your Vercel URL, e.g. `https://mafia-game-opal.vercel.app`), and optionally `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
6. **Google sign-in (optional):** in Google Cloud Console create an OAuth client with redirect URIs `<BETTER_AUTH_URL>/api/auth/callback/google` (and `http://localhost:5173/api/auth/callback/google` for local dev). The consent screen must be published (not "Testing") for anyone to sign in; `frontend/public/privacy.html` and `terms.html` are the policy links it requires.

### Frontend (Vercel)
1. **New Project:** Import your GitHub repo.
2. **Framework Preset:** Vite.
3. **Root Directory:** `frontend`
4. **Environment Variables:**
   - `VITE_SOCKET_URL`: (Your Render Backend URL)
5. **API proxy:** `frontend/vercel.json` rewrites `/api/*` to the Render backend — update its URL if the backend moves.
5. **Deploy:** Hit deploy and you're live!

---

## 📜 How to Play
1. **Establish Operation:** One player creates a room and receives a 6-digit code.
2. **Intercept Frequency:** Other players (4-10 total) join using the code.
3. **Night Falls:** Mafia picks a target; Medic chooses someone to protect.
4. **Day Breaks:** Casualties are revealed. The town discusses the clues.
5. **The Trial:** Everyone votes. The most suspicious player is lynched.
6. **Victory:** Civilians win if all Mafia are gone. Mafia wins if they outnumber the town.

---

*Designed for high-stakes deception. Play responsibly.*
