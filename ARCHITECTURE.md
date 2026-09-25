# Sentinel Robotics Architecture

## Product boundary

Sentinel Robotics is a Theme 4 robot fleet recovery platform. The operational story is one loop:

`robot health -> prediction -> propagation -> criticality -> migration -> rebalancing -> recovery -> evaluation`

The public site explains that loop. The authenticated shell operates it. The evaluation surface measures it.

The deterministic judge simulation contains 25 active robots. Legacy robot references are normalized to the active fleet rather than creating additional simulated units.

## Public website

The root route is a public Theme 4 presentation with links to the problem, recovery architecture, simulation preview, and quantitative evaluation. It is explicitly labeled as a simulation preview and does not claim live robot telemetry.

## Authentication

`src/services/auth.js` owns Firebase Google authentication with popup-first and redirect fallback. Demo Mode enters a deterministic simulation session without Google. Admin authentication is handled by the FastAPI server and its signed admin session; credentials are not stored in frontend code.

## Frontend

`src/App.jsx` owns the lightweight route switch and authentication boundary. The required authenticated modules are Command Center, Fleet, Missions, Failure Analysis, Recovery, Digital Twin, Theme 4 Evaluation, Fleet Alert Center, Profile, and Admin.

`src/RecoveryCommandCenter.jsx` is the primary operations surface. It renders the industrial digital twin, fleet roster, propagation chain, mission continuity, recovery metrics, and supported migration/failure actions.

`src/Pages.jsx` provides the shared shell and secondary operational pages. Fleet, Missions, Recovery, Alerts, Failure Analysis, and Evaluation read from the simulation API instead of maintaining competing operational copies. The light/dark operations preference is persisted in `localStorage` under `sentinel-theme`.

## Authoritative simulation

`backend/main.py` owns the simulation snapshot. The snapshot contains robots, missions, events, failures, predictions, migrations, and performance. `src/services/simulation.js` is the frontend API boundary for reading state, injecting failures, generating/running seeded sequences, migrating tasks, benchmarking, and resetting the simulation.

The UI must label values as simulation data when they are simulated. Optional telemetry fields such as temperature, CPU, motor diagnostics, and sensor diagnostics are not presented unless returned by the backend.

## Recovery engines

- Failure prediction: the backend returns simulation-based prediction records when available.
- Propagation: failure and event records connect affected robots, tasks, and missions.
- Criticality: mission and evaluation state provide the available priority and impact context.
- Migration: the existing backend migration endpoint chooses a feasible destination and returns the authoritative result.
- Rebalancing: the post-migration snapshot is re-read so assignments, status, capacity, and battery remain backend-owned.
- Evaluation: `/api/theme4/evaluation` and `/api/theme4/benchmark` derive quantitative recovery results from the simulation state.

## Alerts

`src/AlertCenter.jsx` normalizes backend notifications and events into the Fleet Alert Center, the top-right bell drawer, and operational actions. These surfaces share one source and link critical alerts to Failure Analysis and recovery alerts to Recovery.

## Robot gateway boundary

No physical robot or gateway is claimed as connected by this repository. A future gateway belongs between a physical adapter (ROS2, MQTT, HTTP, WebSocket, serial, or TCP) and FastAPI. Live discovery, telemetry, acknowledgement, and physical movement require a gateway report and must remain distinct from the deterministic simulation.

## Deployment and verification

Vite serves the frontend on port `4173` in the local setup. FastAPI is the backend. Configure API URL, Firebase settings, CORS, Firebase Admin credentials, and the admin token secret through environment variables. A public deployment is not claimed until its deployed URL is opened and tested.

Verification commands:

```text
npm run build
py -m pytest backend/test_api.py -q
py -m py_compile backend/main.py
```
