# Sentinel Fleet Recovery AI

Theme 4: Robot Fleet Recovery Under Cascading Failures

## Overview

Sentinel Robotics is a fleet recovery and command center for live robot operations under cascading failures. The application models a fleet of 10 active robots, tracks health and battery conditions, simulates priority mission work, and supports recovery workflows such as failure containment, migration, and mission continuity.

## Problem

Modern autonomous fleets can suffer cascading failures when one robot breaks down, loses connectivity, or enters a low-battery state. In those conditions, operators need fast insight into which robot failed, which task is at risk, which replacement robot is available, and how to continue the mission without losing progress.

## Solution

This project delivers a command-and-control interface for fleet health monitoring, failure analysis, recovery orchestration, and simulation-driven mission continuity. It keeps a single authoritative simulation state, exposes a FastAPI backend for telemetry and control, and presents the live status in a React dashboard.

## Key Features

- Fleet health and mission dashboard
- Failure injection and propagation analysis
- Recovery flow with replacement candidate evaluation
- Battery-aware charging and low-power handling
- Active mission/task continuity tracking
- Firebase-ready authentication and demo login mode
- Local simulation and API test coverage

## Architecture

- Frontend: React + Vite
- Backend: FastAPI
- Database: MySQL-ready via environment configuration
- Authentication: Firebase web auth + server-side admin session validation
- Map layer: configurable map provider via VITE_MAP_STYLE_URL
- WebSocket: configured via VITE_WS_BASE_URL

## Technology Stack

- React
- Vite
- FastAPI
- Pydantic models
- Firebase web SDK
- MySQL-compatible environment variables
- ReportLab PDF generation

## Failure Propagation

The system records failure events, marks affected tasks as at risk, computes cascade depth, and makes the propagation analysis visible in the command center.

## Task Migration

The recovery flow validates source and destination robot capability, ensures mission continuity, and preserves in-progress work instead of restarting from zero.

## Battery Optimization

Robots that dip below 20% battery are routed toward charging behavior and are marked unavailable until they recover.

## Recovery Logic

The app models the operational flow: detect failure, protect task state, identify replacement candidates, authorize migration, continue remaining work, and update mission metrics.

## Simulation

The demo simulation uses exactly 10 active robots and a deterministic state model for a realistic fleet scenario.

## Authentication

- Firebase sign-in is used when configured through environment variables.
- Demo mode remains available for local or evaluation scenarios.
- Admin credentials are validated on the backend and never exposed to the browser.

## Admin

The backend enforces admin validation, and admin-only endpoints require server-side authorization.

## Deployment

This workspace does not include verified production provider credentials or a public deployment target. The application is configured for deployment by filling the environment variables in .env.example and pointing the frontend/backend to the deployed HTTPS URLs. No public URL is claimed here unless it has been verified from the provider.

## Environment Variables

Copy the example files before running locally or deploying:

```powershell
copy .env.example .env
copy backend\.env.example backend\.env
```

Required runtime variables are described in the example files and include the API base URL, WebSocket URL, Firebase config, MySQL config, JWT secret, admin credentials, and CORS origins.

## Local Setup

Frontend:

```powershell
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

Backend:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
py -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

## Production URLs

Production URLs must be supplied via environment variables such as:

- VITE_API_BASE_URL
- VITE_WS_BASE_URL
- FRONTEND_URL
- CORS_ORIGINS

No hardcoded localhost or 127.0.0.1 endpoints should remain in deployed runtime configuration.

## API Documentation

When the backend is running, Swagger UI is available at:

- http://localhost:8000/docs
- http://localhost:8000/redoc

In production, the same paths should be used on HTTPS with the deployed backend domain.

## Testing

```powershell
npm run build
py -m pytest backend/test_api.py -q
py -m py_compile backend\main.py
```

## Demo Scenario

1. Open the deployed frontend or local app.
2. Sign in via demo mode or configured Firebase auth.
3. Open the Live Fleet Simulation view.
4. Confirm 10 active robots are present.
5. Inject a failure into a robot.
6. Verify the failure point is preserved and the task is marked at risk.
7. Review recovery recommendations.
8. Approve replacement and verify the continuation of the remaining route.

## Team

Sentinel Robotics
HackFusion 2026
"# sentinel-fleet-recovery-ai" 
