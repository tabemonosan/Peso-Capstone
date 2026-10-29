# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Running with Docker

The app can run fully in Docker: MongoDB, the Express backend, and the Vite frontend (served by nginx).

```sh
docker compose up --build
```

Then open http://localhost:5173 (frontend). The backend API is on http://localhost:4000.

Notes:
- `docker-compose.yml` starts a local MongoDB container by default. To use your own database (e.g. MongoDB Atlas), set `MONGODB_URI` in your `.env` or environment before running compose.
- Other backend settings (`JWT_SECRET`, SMTP/email vars) are also read from `.env`.
- The frontend build reads `VITE_API_URL` (default `http://localhost:4000`) to know where the API is.

You can also build the images individually:

```sh
docker build -t capstone-backend .
docker build -f Dockerfile.frontend -t capstone-frontend .
```

## Email setup

Verification codes and notifications are sent via the mailer in `server/mailer.js`. It has two delivery modes plus a safe fallback (subject-only logging). It never logs codes, tokens, links, or recipient email addresses.

### Quick start (development, no account needed): Ethereal

1. In `.env`, set `EMAIL_DEV_MODE=ethereal` and leave the `SMTP_*` vars unset.
2. Start the server — a throwaway Ethereal inbox is created automatically.
3. After each email is "sent", the console prints a `[DEV ONLY] Email preview: <url>` line. Open that URL to read the email. Nothing is really delivered, and Ethereal is never used when `NODE_ENV=production`.

### Real delivery: Gmail (or any SMTP)

1. Turn on 2-Step Verification on the Google account.
2. Go to Google Account → Security → **App passwords** and generate one. **Never use your real account password.**
3. In `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=you@gmail.com
   SMTP_PASS=the-16-char-app-password
   ```
   (`MAIL_FROM` is optional and defaults to `SMTP_USER`. Port 465 also works — it uses SSL instead of STARTTLS.)
4. On server start you'll see `Mailer ready` (or a short, redacted error — startup continues either way).

Send a test email without starting the whole app:

```sh
npm run mail:test -- someone@example.com
```

In Ethereal mode this also prints the preview URL.

### Troubleshooting

- **"Authentication failed"** — check the app password and that 2-Step Verification is on (a normal Gmail password will not work).
- **"Could not reach the SMTP server"** — check host and port (587 = STARTTLS, 465 = SSL), and that no firewall is blocking outbound SMTP.
- **TLS/certificate error** — make sure the port matches the encryption, and check the server certificate.
- **"Email is not configured..."** — no mode is active; set `SMTP_*` or `EMAIL_DEV_MODE=ethereal`.
