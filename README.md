# VillKro

A monorepo for the VillKro grocery / food delivery platform — API, customer app, admin panel, and iOS-style web PWA.

## Structure

```
villkro/
├── apps/
│   ├── api/            Node.js + Express REST + Socket.IO backend
│   ├── customer-app/   React Native (Expo) iOS + Android app
│   ├── admin/          React + Vite admin panel
│   └── web/            React + Vite iOS-style PWA
├── docs/               Project documentation
└── plans/              Design docs, audits, deployment plans
```

Each `apps/*` folder is a self-contained, independently deployable project. The `apps/api/Dockerfile`, `apps/admin/Dockerfile`, and `apps/web/Dockerfile` are independent build contexts.

## Quick start

```bash
# Backend
cd apps/api
npm install
npm run dev          # http://localhost:3000

# Admin panel
cd apps/admin
npm install
npm run dev          # http://localhost:5173

# iOS-style web PWA
cd apps/web
npm install
npm run dev          # http://localhost:5174

# Customer app (Expo)
cd apps/customer-app
npm install
npx expo start
```

## CI

- `.github/workflows/ci.yml` — API tests + lint
- `.github/workflows/ci-admin.yml` — Admin lint + build

## Deployment

See [`plans/deploymentfinallast.md`](./plans/deploymentfinallast.md) for the full step-by-step deploy plan.
