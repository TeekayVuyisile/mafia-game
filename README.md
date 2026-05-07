# Mafia: The Underground Society

A cinematic, realtime multiplayer Mafia party game built with the PERN stack (PostgreSQL, Express, React, Node.js) and Socket.io. Experience the tension of an underground secret society through a polished, noir-inspired interface.

## 🎬 Project Overview

**Mafia: The Underground Society** is a social deduction game where players are assigned secret identities. The Mafia must eliminate the townspeople, while the Civilians and the Medic must work together to identify and lynch the Mafia before it's too late.

### ✨ Key Features
- **Cinematic UI/UX:** A high-end "Matte Black & Antique Gold" aesthetic with glassmorphism and smooth animations.
- **Realtime Synchronization:** Powered by Socket.io for instantaneous phase transitions, voting, and chat.
- **Narrator (TTS):** A browser-based Text-to-Speech narrator that announces game phases and results.
- **Identity Persistence:** Seamless reconnection support. If you lose your connection, the "Command Center" helps you intercept your previous frequency and jump back into the action.
- **Account Management:** Secure authentication via Supabase (Email/Password & Google), including customizable usernames.
- **Garbage Collection:** Automated backend cleanup to ensure server stability by pruning inactive rooms.

## 🛠️ Tech Stack

- **Frontend:** React (Vite), Framer Motion, Bootstrap 5, Socket.io-client.
- **Backend:** Node.js, Express, Socket.io.
- **Database & Auth:** Supabase (PostgreSQL).
- **Icons:** React Bootstrap Icons.
- **Narrator:** Web Speech API.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- A Supabase account and project.

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
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. Start the server: `npm start` (or `node index.js`)

### 3. Frontend Setup
1. Navigate to the frontend folder: `cd ../frontend`
2. Install dependencies: `npm install`
3. Create a `.env` file based on `.env.example`:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_SOCKET_URL=http://localhost:5000
   ```
4. Start the development server: `npm run dev`

---

## ☁️ Deployment Guide

### Backend (Render)
1. **New Web Service:** Connect your GitHub repo.
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `node index.js`
5. **Environment Variables:** Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
6. **Note:** Ensure you use the provided Render URL for the frontend's `VITE_SOCKET_URL`.

### Frontend (Vercel)
1. **New Project:** Import your GitHub repo.
2. **Framework Preset:** Vite.
3. **Root Directory:** `frontend`
4. **Environment Variables:**
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SOCKET_URL`: (Your Render Backend URL)
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
