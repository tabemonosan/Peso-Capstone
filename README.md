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
