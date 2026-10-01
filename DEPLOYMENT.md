# Deployment

This app has three parts that must be deployed/configured:

1. **Database** — MongoDB Atlas (required for remote access)
2. **Backend** — Express API → Render
3. **Frontend** — Vite/React static site → Vercel

---

## 1. MongoDB Atlas (database)

1. Go to https://cloud.mongodb.com and create a free account.
2. Create a **free M0 cluster**.
3. **Database Access** → Add a database user (username + password).
4. **Network Access** → Add IP → **Allow access from anywhere** (`0.0.0.0/0`) so Render can connect.
5. **Connect** → Drivers → copy the connection string, which looks like:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/peso-portal
   ```

## 2. Backend on Render

1. Push this repo to GitHub (already done).
2. Go to https://render.com → New → **Web Service** → connect the repo.
3. Settings:
   - **Root Directory:** leave blank
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. **Environment Variables** (Add):
   - `MONGODB_URI` = your Atlas connection string (from step 1)
   - `JWT_SECRET` = any long random string
   - `FRONTEND_URL` = your Vercel URL (e.g. `https://your-app.vercel.app`)
5. Deploy. Note your Render URL, e.g. `https://peso-api.onrender.com`.

## 3. Frontend on Vercel

1. Go to https://vercel.com → Add New → **Project** → import the repo.
2. Framework preset: **Vite** (auto-detected).
3. **Environment Variables** (Add):
   - `VITE_API_URL` = your Render backend URL (e.g. `https://peso-api.onrender.com`)
4. Deploy. Note your Vercel URL.
5. Go back to Render and set `FRONTEND_URL` to that Vercel URL (so CORS matches), then redeploy the backend.

---

## Notes
- The first Render request may be slow (free tier sleeps when idle).
- Uploaded files (resumes, NSRP docs) are stored in MongoDB, so they persist across deploys.
- If you later restrict CORS, set the backend to only allow your Vercel origin in `server/index.js`.
