# WhatsApp Web–Like Chat (Task Submission)

## Overview
This project demonstrates:
- A webhook payload processor for WhatsApp-like JSON payloads
- A Node.js + Express backend with MongoDB (processed_messages collection)
- A React + Tailwind frontend that mimics WhatsApp Web
- Send message functionality (stored in DB)
- Socket.IO for realtime updates

## Setup (local)
1. Clone repo and open two terminals for backend and frontend.
2. **Backend**
   - `cd backend`
   - `npm install`
   - Create `.env` with `MONGODB_URI=your_mongo_atlas_uri` and optionally `PORT=4000`
   - Run: `npm run dev` (or `npm start`)
3. **Frontend**
   - `cd frontend`
   - `npm install`
   - create `.env` with `VITE_API_BASE=http://localhost:4000/api` and `VITE_SOCKET_URL=http://localhost:4000`
   - Run: `npm run dev`
4. Open frontend URL (Vite shows it).

## Processing sample payloads
- Unzip the sample payloads into `backend/sample_payloads`.
- From `backend` run:
  - `node scripts/process_payloads.js ./sample_payloads`
- The script inserts messages and status updates into MongoDB.

## Deploy
- Backend: Render / Heroku / Railway / Fly / DigitalOcean — set `MONGODB_URI` env var and start `node server.js`.
- Frontend: Vercel (preferred for React). Set `VITE_API_BASE` and `VITE_SOCKET_URL` env vars in Vercel.
- Use CORS or restrict origins as needed.

## Notes
- The server accepts incoming webhook POSTs at `/api/webhook`.
- The frontend calls `/api/conversations`, `/api/messages/:wa_id`, and `/api/send`.
