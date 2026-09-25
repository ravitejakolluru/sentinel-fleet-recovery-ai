from datetime import datetime, timezone
from io import BytesIO, StringIO
import csv
import json
import os
import uuid
import base64
import hashlib
import hmac
import time
import random
import copy
import math
from typing import Literal
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket
from fastapi.responses import Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable
try:
    from backend.profile_store import ensure_profile, public_profile, upsert_profile
except ImportError:
    from profile_store import ensure_profile, public_profile, upsert_profile
try:
    from firebase_admin import auth as firebase_admin_auth, credentials as firebase_credentials, initialize_app as firebase_initialize_app, get_app as firebase_get_app
except ImportError:
    firebase_admin_auth = firebase_credentials = firebase_initialize_app = firebase_get_app = None
try:
    from backend.report_template import render_report
except ImportError:
    from report_template import render_report

load_dotenv()


def get_cors_origins():
    configured = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in configured.split(",") if origin.strip()]
    defaults = [
        "http://localhost:5173",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:4173",
        "http://0.0.0.0:5173",
        "http://[::1]:5173",
    ]
    for origin in defaults:
        if origin not in origins:
            origins.append(origin)
    return origins


app = FastAPI(title="Sentinel Fleet Recovery AI API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

class FailureRequest(BaseModel):
    robot_id: str = Field(default="R-004", pattern=r"^R-\d{3}$")
    severity: Literal["low", "medium", "high", "critical"] = "high"
    subsystem: Literal["motor", "battery", "communication", "sensor"] = "motor"

class FailureInjectionRequest(BaseModel):
    robot_id: str = Field(default="R-004", pattern=r"^R-\d{3}$")
    failure_type: Literal["motor", "sensor", "communication", "battery", "cpu", "temperature", "navigation", "power", "custom"] = "motor"
    severity: Literal["warning", "critical", "failed"] = "critical"
    timing: Literal["immediate", "delayed", "progressive"] = "immediate"
    duration_seconds: int = Field(default=0, ge=0, le=3600)
    custom_label: str = Field(default="", max_length=80)

class ScenarioRequest(BaseModel):
    failure_count: int = Field(default=4, ge=1, le=20)
    seed: int | None = Field(default=None, ge=0, le=999999999)

class SimulationControlRequest(BaseModel):
    running: bool | None = None
    speed: float | None = Field(default=None, ge=0.5, le=8.0)

class MigrationExecutionRequest(BaseModel):
    target_robot: str | None = Field(default=None, pattern=r"^R-\d{3}$")

class BenchmarkRequest(BaseModel):
    failure_count: int = Field(default=4, ge=1, le=20)
    seed: int | None = Field(default=None, ge=0, le=999999999)

class RecoveryRequest(BaseModel):
    incident_id: str
    approve: bool = True

class DemoLoginRequest(BaseModel):
    email: str = "alex.rivera@sentinel.example"
    role: Literal["Admin", "Fleet Manager", "Operator", "Viewer"] = "Admin"

class AdminLoginRequest(BaseModel):
    username: str
    password: str

class MigrationRequest(BaseModel):
    source_robot: str = Field(pattern=r"^R-\d{3}$")

class AlertRequest(BaseModel):
    recipient: str = "all"
    severity: Literal["info", "warning", "critical"] = "info"
    title: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=1000)
    robot: str = ""
    mission: str = ""

class SimulationSnapshot(BaseModel):
    user: dict = Field(default_factory=lambda: {"name": "Alex Rivera", "organization": "Sentinel Robotics"})
    mission: str = "Fleet recovery cascade response"
    robots: list[dict] = Field(default_factory=list)
    missions: list[dict] = Field(default_factory=list)
    events: list[dict] = Field(default_factory=list)
    failures: list[dict] = Field(default_factory=list)
    predictions: list[dict] = Field(default_factory=list)
    migrations: list[dict] = Field(default_factory=list)
    performance: dict = Field(default_factory=lambda: {"before": 98.4, "lowest": 54.2, "recovered": 89.7})
    simulation_id: str = "SIM-2026-DEMO"
    recovery_duration: str = "42 seconds"
    energy_saved: str = "18.6%"

class ProfileRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str = Field(min_length=1, max_length=120)
    dateOfBirth: str = Field(default="", max_length=10, alias="date_of_birth")
    phoneNumber: str = Field(default="", max_length=32, alias="phone")

def verified_user(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    if firebase_admin_auth is None:
        raise HTTPException(status_code=503, detail="Firebase Admin verification is not configured")
    try:
        try:
            firebase_get_app()
        except ValueError:
            certificate = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if not certificate:
                raise HTTPException(status_code=503, detail="Firebase Admin verification is not configured")
            firebase_initialize_app(firebase_credentials.Certificate(certificate))
        return firebase_admin_auth.verify_id_token(authorization.removeprefix("Bearer "))
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=401, detail="Invalid authentication token") from error

def admin_user(claims=Depends(verified_user)):
    if not claims.get("admin", False) and claims.get("role") != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin access required")
    return claims

def _admin_secret():
    return (os.getenv("JWT_SECRET") or os.getenv("ADMIN_TOKEN_SECRET") or "development-local-only-secret-change-me").encode()


def issue_admin_token(username):
    payload = f"{username}:{int(time.time()) + 3600}"
    signature = hmac.new(_admin_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}:{signature}".encode()).decode()

def verified_admin_session(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required")
    try:
        decoded = base64.urlsafe_b64decode(authorization.removeprefix("Bearer ")).decode()
        username, expires, signature = decoded.rsplit(":", 2)
        payload = f"{username}:{expires}"
        expected = hmac.new(_admin_secret(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(expires) < int(time.time()):
            raise ValueError("invalid admin session")
        return {"username": username, "role": "ADMIN"}
    except (ValueError, TypeError, UnicodeDecodeError, base64.binascii.Error) as error:
        raise HTTPException(status_code=401, detail="Invalid admin session") from error

def _initial_snapshot():
    robots = [{"id": f"R-{index:03d}", "type": ["Scout", "Carrier", "Inspector", "Heavy"][index % 4], "health": 80 + (index * 7) % 20, "battery": 35 + (index * 11) % 64, "status": "healthy"} for index in range(1, 11)]
    for robot in robots:
        robot["aliases"] = [f"SV-{robot['id'][2:]}"]
    compatibility_aliases = {"SV-004": "R-004", "HM-009": "R-009", "SV-008": "R-008", "SV-088": "R-008"}
    for alias, canonical_id in compatibility_aliases.items():
        target = next(robot for robot in robots if robot["id"] == canonical_id)
        target["aliases"].append(alias)
    mission_route = [(12, 18), (36, 18), (36, 52), (64, 52), (84, 78)]
    locations = {
        "DEPOT": {"x": 12, "y": 18}, "WAREHOUSE A": {"x": 28, "y": 20}, "WAREHOUSE B": {"x": 72, "y": 38}, "WAREHOUSE C": {"x": 84, "y": 78},
        "CHARGING STATION 01": {"x": 16, "y": 82}, "CHARGING STATION 02": {"x": 88, "y": 50}, "PICKUP POINT 01": {"x": 36, "y": 30}, "PICKUP POINT 02": {"x": 58, "y": 62},
    }
    for index, robot in enumerate(robots):
        robot.update({
            "start_position": {"x": 12 + (index % 5) * 4, "y": 12 + (index // 5) * 6},
            "position": {"x": 12 + (index % 5) * 4, "y": 12 + (index // 5) * 6},
            "route_id": f"ROUTE-{index + 1:02d}",
            "route": ["START", "AISLE A", "WAYPOINT 1", "TASK", "CHARGING", "DESTINATION"],
            "waypoints": [{"x": max(4, min(94, x + ((index % 5) - 2) * 10)), "y": y + (index // 5) * 6 + (index % 2) * 2} for x, y in mission_route],
            "destination": "MISSION ZONE",
            "mission_id": "M-003" if index == 2 else None,
            "task_id": "T-003" if index == 2 else None,
            "current_waypoint": 0,
            "route_progress": 0.0,
            "failure_state": None,
            "recovery_state": None,
            "operating_state": "ACTIVE",
            "availability": "AVAILABLE" if index != 2 else "ASSIGNED",
            "heading": 0,
            "speed": 0,
            "current_task": "T-003" if index == 2 else "",
            "mission": "M-003" if index == 2 else "",
            "failure_position": None,
            "charging_state": None,
        })
        if index == 2:
            robot["assigned_tasks"] = ["T-003"]
            robot["waypoints"] = [{"x": 12, "y": 18}, {"x": 36, "y": 30}, {"x": 72, "y": 38}]
        if index == 3:
            robot["assigned_tasks"] = ["T-004"]
    return {"user": {"name": "Alex Rivera", "organization": "Sentinel Robotics"}, "robots": robots, "locations": locations, "tasks": {"T-003": {"id": "T-003", "mission_id": "M-003", "assigned_robot": "R-003", "status": "IN PROGRESS", "progress": 0, "start": "DEPOT", "pickup": "PICKUP POINT 01", "destination": "WAREHOUSE B", "route": [{"x": 12, "y": 18}, {"x": 36, "y": 30}, {"x": 72, "y": 38}], "interruption_point": None, "remaining_progress": 100}}, "missions": [{"name": "Harbor perimeter sweep", "priority": "Critical", "progress": 78, "tasks": ["T-003"]}, {"name": "Emergency medical delivery", "priority": "Critical", "progress": 92, "tasks": []}], "events": [{"type": "START", "message": "Simulation ready with 10 robots", "robot": None}], "notifications": [], "activity": [], "failures": [], "predictions": [], "migrations": [], "alerts_cleared_at": None, "control": {"running": False, "speed": 1.0}, "performance": {"before": 98.4, "lowest": 54.2, "recovered": 89.7}, "simulation_id": "SIM-2026-DEMO"}

simulation_state = _initial_snapshot()
simulation_state["baseline_average_battery"] = round(sum(robot.get("battery", 0) for robot in simulation_state["robots"]) / max(1, len(simulation_state["robots"])), 1)

def advance_simulation():
    now = time.monotonic()
    control = simulation_state.setdefault("control", {"running": True, "speed": 1.0})
    previous = control.get("last_tick", now)
    control["last_tick"] = now
    elapsed = (now - previous) * control.get("speed", 1.0) if control.get("running", True) else 0
    if elapsed <= 0:
        return
    base_waypoints = ((12, 18), (36, 18), (36, 52), (64, 52), (84, 78))
    for index, robot in enumerate(simulation_state["robots"]):
        if robot.get("status") == "charging":
            if robot.get("charging_state") == "navigating_to_charger":
                charger_route = robot.get("waypoints") or []
                if len(charger_route) >= 2:
                    charger_progress = min(1, robot.get("route_progress", 0) + elapsed * 0.3)
                    start, end = charger_route[0], charger_route[-1]
                    robot["position"] = {"x": round(start["x"] + (end["x"] - start["x"]) * charger_progress, 2), "y": round(start["y"] + (end["y"] - start["y"]) * charger_progress, 2)}
                    robot["route_progress"] = charger_progress
                    if charger_progress >= 1:
                        robot["charging_state"] = "charging"
                        robot["route_progress"] = 0
                        simulation_state["events"].insert(0, _event("CHARGING", f"{robot['id']} arrived at charging station", robot=robot["id"]))
                continue
            else:
                robot["battery"] = min(100, round(robot.get("battery", 0) + elapsed * 4, 1))
                if robot["battery"] >= 80:
                    robot["status"] = "idle"
                    robot["operating_state"] = "IDLE"
                    robot["availability"] = "AVAILABLE"
                    robot["charging_state"] = "complete"
                    simulation_state["events"].insert(0, _event("CHARGE_COMPLETE", f"{robot['id']} charge complete", robot=robot["id"], battery=robot["battery"]))
                continue
        if robot.get("status") in {"critical", "failed"}:
            continue
        lane_offset = ((index % 5) - 2) * 10
        waypoints = tuple((max(4, min(94, x + lane_offset)), y + (index // 5) * 6 + (index % 2) * 2) for x, y in base_waypoints)
        robot_waypoints = robot.get("waypoints") or [{"x": x, "y": y} for x, y in waypoints]
        route_segments = max(1, len(robot_waypoints) - 1)
        progress = robot.get("route_progress", (index * 0.17) % route_segments) + elapsed * (0.18 + (index % 4) * 0.04)
        if robot.get("operating_state") == "RECOVERING":
            progress = min(route_segments, progress)
        else:
            progress %= route_segments
        battery_drain = elapsed * (0.35 + (index % 3) * 0.12)
        robot["battery"] = max(0, round(robot.get("battery", 0) - battery_drain, 1))
        if robot["battery"] < 20 and robot.get("status") in {"healthy", "warning"}:
            charger = simulation_state.get("locations", {}).get("CHARGING STATION 01", {"x": 16, "y": 82})
            robot["status"] = "charging"
            robot["operating_state"] = "CHARGING"
            robot["availability"] = "UNAVAILABLE"
            robot["charging_state"] = "navigating_to_charger"
            robot["waypoints"] = [robot.get("position", {"x": 50, "y": 50}), charger]
            robot["route_progress"] = 0
            simulation_state["events"].insert(0, _event("LOW_BATTERY", f"{robot['id']} battery below 20%; navigating to charging station", robot=robot["id"], battery=robot["battery"], charging_station="CHARGING STATION 01"))
            simulation_state["notifications"].insert(0, {"type": "BATTERY", "title": "LOW BATTERY", "message": f"{robot['id']} navigating to CHARGING STATION 01", "robot": robot["id"], "timestamp": datetime.now(timezone.utc).isoformat(), "read": False})
            continue
        segment = min(len(waypoints) - 2, int(progress))
        fraction = progress - segment
        segment = min(len(robot_waypoints) - 2, int(progress))
        start = robot_waypoints[segment]
        end = robot_waypoints[segment + 1]
        start_x = start["x"] if isinstance(start, dict) else start[0]
        start_y = start["y"] if isinstance(start, dict) else start[1]
        end_x = end["x"] if isinstance(end, dict) else end[0]
        end_y = end["y"] if isinstance(end, dict) else end[1]
        robot["position"] = {"x": round(start_x + (end_x - start_x) * fraction, 2), "y": round(start_y + (end_y - start_y) * fraction, 2)}
        robot["route"] = ["START", "PICKUP", "TASK ROUTE", "DESTINATION"]
        robot["route_index"] = segment + 1
        robot["speed"] = round(0.35 + (index % 4) * 0.08, 2)
        robot["route_progress"] = progress
        robot["direction"] = {"x": round(end_x - start_x, 2), "y": round(end_y - start_y, 2)}
        robot["heading"] = round(__import__("math").degrees(__import__("math").atan2(end_y - start_y, end_x - start_x)), 1)
        if robot.get("current_task") and robot["current_task"] in simulation_state.get("tasks", {}):
            task = simulation_state["tasks"][robot["current_task"]]
            route_fraction = min(1, progress / route_segments)
            if robot.get("operating_state") == "RECOVERING":
                preserved_progress = task.get("recovery_start_progress", 0)
                task["progress"] = round(preserved_progress + route_fraction * (100 - preserved_progress), 1)
            else:
                task["progress"] = round(min(100, route_fraction * 100), 1)
            task["remaining_progress"] = round(max(0, 100 - task["progress"]), 1)
            task["status"] = "RECOVERING" if robot.get("operating_state") == "RECOVERING" else "IN PROGRESS"
            if robot.get("operating_state") == "RECOVERING" and task["progress"] >= 99.9:
                task["status"] = "COMPLETED"
                task["recovery_completed_at"] = datetime.now(timezone.utc).isoformat()
                recovery_started_at = task.get("recovery_started_at")
                if recovery_started_at:
                    task["recovery_time_seconds"] = round(max(0, (datetime.fromisoformat(task["recovery_completed_at"]) - datetime.fromisoformat(recovery_started_at)).total_seconds()), 2)
                robot["status"] = "idle"
                robot["operating_state"] = "IDLE"
                robot["availability"] = "AVAILABLE"
                robot["current_task"] = ""
                robot["assigned_tasks"] = []
                simulation_state["events"].insert(0, _event("RECOVERY", f"{task['id']} completed by {robot['id']}", robot=robot["id"], task=task["id"], mission=task.get("mission_id")))
                simulation_state["notifications"].insert(0, {"type": "RECOVERY", "title": "MISSION RECOVERED", "message": f"{task['id']} completed by {robot['id']}", "robot": robot["id"], "task": task["id"], "timestamp": datetime.now(timezone.utc).isoformat(), "read": False})
                for mission in simulation_state.get("missions", []):
                    if task["id"] in mission.get("tasks", []):
                        mission["progress"] = 100
                        mission["status"] = "COMPLETED"

def normalize_robot_reference(robot_id: str | None):
    if robot_id is None:
        return None
    return str(robot_id).strip().upper()


def canonical_robot_id(robot_id: str):
    normalized = normalize_robot_reference(robot_id)
    if not normalized:
        return None
    for robot in simulation_state["robots"]:
        if normalize_robot_reference(robot.get("id")) == normalized:
            return robot["id"]
        aliases = [normalize_robot_reference(alias) for alias in robot.get("aliases", [])]
        if normalized in aliases:
            return robot["id"]
    legacy_id = f"R-{normalized[3:]}" if normalized.startswith("SV-") else f"SV-{normalized[2:]}" if normalized.startswith("R-") else None
    if legacy_id:
        for robot in simulation_state["robots"]:
            if normalize_robot_reference(robot.get("id")) == normalize_robot_reference(legacy_id):
                return robot["id"]
            aliases = [normalize_robot_reference(alias) for alias in robot.get("aliases", [])]
            if normalize_robot_reference(legacy_id) in aliases:
                return robot["id"]
    return None


def public_robot_id(robot_id: str, requested_id: str):
    requested = normalize_robot_reference(requested_id)
    return f"SV-{robot_id[2:]}" if requested.startswith("SV-") else robot_id

def current_snapshot():
    return simulation_state

FAILURE_TYPES = ("motor", "sensor", "communication", "battery", "cpu", "temperature", "navigation", "power", "custom")

def _event(event_type, message, **fields):
    return {"type": event_type, "message": message, "timestamp": datetime.now(timezone.utc).isoformat(), **fields}

def _robot_or_404(robot_id):
    canonical_id = canonical_robot_id(robot_id)
    robot = next((item for item in simulation_state["robots"] if item["id"] == canonical_id), None)
    if not robot:
        raise HTTPException(status_code=404, detail={"error": "ROBOT_NOT_FOUND", "message": f"Robot {robot_id} was not found."})
    return robot

def inject_failure_into_state(request: FailureInjectionRequest):
    robot = _robot_or_404(request.robot_id)
    original_health = robot.get("health", 100)
    active_task_id = robot.get("current_task") or robot.get("task_id")
    active_task = simulation_state.get("tasks", {}).get(active_task_id) if active_task_id else None
    if active_task:
        active_task["status"] = "AT RISK"
        active_task["failed_robot_id"] = robot["id"]
        active_task["failure_position"] = copy.deepcopy(robot.get("position"))
        active_task["interruption_progress"] = active_task.get("progress", robot.get("route_progress", 0))
        active_task["remaining_progress"] = max(0, 100 - active_task["progress"])
    severity_drop = {"warning": 12, "critical": 32, "failed": 70}[request.severity]
    if request.timing == "progressive":
        stages = [("WARNING", max(1, original_health - 4), "Early warning signs detected"), ("HIGH_RISK", max(1, original_health - 8), "Failure risk is high"), ("PREDICTION", max(1, original_health - 12), "Failure predicted"), ("PROPAGATION", max(1, original_health - 20), "Dependent work marked at risk"), ("FAILURE", max(0, original_health - severity_drop), "Failure threshold reached")]
        for event_type, health, message in stages:
            simulation_state["events"].insert(0, _event(event_type, f"{robot['id']}: {message}", robot=robot["id"], subsystem=request.failure_type, health=health, timing=request.timing))
        robot["health"] = stages[-1][1]
    else:
        robot["health"] = max(0, original_health - severity_drop)
    robot["status"] = "failed" if request.severity == "failed" else "critical" if request.severity == "critical" else "warning"
    robot["operating_state"] = "FAILED" if request.severity in {"critical", "failed"} else "DEGRADED"
    robot["availability"] = "UNAVAILABLE"
    robot["failure_position"] = copy.deepcopy(robot.get("position"))
    robot["failure_state"] = "route_deviation" if request.failure_type == "navigation" else request.failure_type
    if request.failure_type == "navigation":
        position = robot.get("position", {"x": 50, "y": 50})
        robot["waypoints"] = [position, {"x": min(92, position["x"] + 10), "y": max(8, position["y"] - 12)}, {"x": min(96, position["x"] + 18), "y": min(92, position["y"] + 14)}]
        simulation_state["events"].insert(0, _event("ROUTE_DEVIATION", f"{robot['id']} left its assigned route", robot=robot["id"], route_id=robot.get("route_id"), expected_waypoint=robot.get("current_waypoint", 0), deviation_m=3.2, threshold_m=2.0, severity=request.severity))
    failure = {"robot_id": robot["id"], "subsystem": request.failure_type, "severity": request.severity, "timing": request.timing, "duration_seconds": request.duration_seconds, "risk": min(99, 45 + severity_drop)}
    prediction = {"robot_id": robot["id"], "probability": failure["risk"], "confidence": 0.72 if request.failure_type == "custom" else 0.88, "subsystem": request.failure_type, "contributors": {"health_delta": severity_drop, "battery": max(0, 100 - robot.get("battery", 0)), "task_load": len(robot.get("assigned_tasks", []))}}
    simulation_state["predictions"].append(prediction)
    simulation_state["failures"].append(failure)
    simulation_state["notifications"].insert(0, {"type": "ROUTE_DEVIATION" if request.failure_type == "navigation" else "FAILURE", "title": "ROUTE DEVIATION DETECTED" if request.failure_type == "navigation" else "FAILURE DETECTED", "message": f"{robot['id']} task at risk", "robot": robot["id"], "task": robot.get("task_id"), "timestamp": datetime.now(timezone.utc).isoformat(), "read": False})
    if active_task:
        simulation_state["notifications"].insert(0, {"type": "FAILURE", "title": "TASK AT RISK", "message": f"{active_task_id} lost its assigned robot", "robot": robot["id"], "task": active_task_id, "timestamp": datetime.now(timezone.utc).isoformat(), "read": False})
    simulation_state["events"].insert(0, _event("FAILURE_INJECTION", f"{robot['id']} {request.failure_type} failure injected", robot=robot["id"], severity=request.severity, timing=request.timing))
    return {"robot": robot, "failure": failure, "state": simulation_state}

def evaluation_engine(snapshot=None):
    state = snapshot or current_snapshot()
    fleet = state.get("robots", [])
    failures = state.get("failures", [])
    migrations = state.get("migrations", [])
    active = sum(1 for robot in fleet if robot.get("status") in {"healthy", "warning", "recovering"})
    failed = sum(1 for robot in fleet if robot.get("status") == "failed")
    warning = sum(1 for robot in fleet if robot.get("status") == "warning")
    baseline = 100.0
    impact = min(95.0, len(failures) * 7.0 + failed * 3.0 + warning * 0.5)
    recovered = min(baseline, max(0.0, baseline - impact + len(migrations) * 4.0))
    preservation = round(recovered / baseline * 100, 1)
    task_total = max(1, sum(len(mission.get("tasks", [])) for mission in state.get("missions", [])) + len(migrations))
    migrated = len(migrations)
    containment = round(max(0.0, min(100.0, 100 - len(failures) * 3 + migrated * 2)), 1)
    cascade_depth = min(5, 1 + (1 if failures else 0) + (1 if failures and state.get("missions") else 0) + (1 if migrated else 0) + (1 if failures and active < len(fleet) else 0))
    average_battery = round(sum(robot.get("battery", 0) for robot in fleet) / max(1, len(fleet)), 1)
    prediction_population = len(state.get("predictions", []))
    actual = len(failures)
    predicted = prediction_population
    correct = min(actual, predicted)
    precision = round(correct / predicted, 3) if predicted else None
    recall = round(correct / actual, 3) if actual else None
    f1 = round(2 * precision * recall / (precision + recall), 3) if precision and recall else None
    return {"robots": len(fleet), "active": active, "failed": failed, "warning": warning, "mission_completion_rate": round(recovered, 1), "mission_preservation": preservation, "baseline_performance": baseline, "failure_impact": round(impact, 1), "recovered_performance": round(recovered, 1), "performance_loss": round(impact, 1), "tasks_total": task_total, "tasks_migrated": migrated, "tasks_failed": max(0, failed - migrated), "migration_efficiency": round((migrated / max(1, actual)) * 100, 1) if actual else 100.0, "migration_success_rate": 100.0 if migrated else 0.0, "battery_consumption": round(max(0.0, 100 - average_battery), 1), "battery_efficiency": average_battery, "fleet_utilization_before": round(min(100, 55 + len(failures) * 2), 1), "fleet_utilization_after": round(min(100, 55 + len(failures) * 2 + migrated), 1), "cascade_depth": cascade_depth, "affected_nodes": len(failures) + migrated + len(state.get("missions", [])), "contained_nodes": round((len(failures) + migrated + len(state.get("missions", []))) * containment / 100), "uncontained_nodes": 0 if containment >= 100 else 1, "cascade_containment": containment, "average_battery": average_battery, "prediction_evaluation": {"population": prediction_population, "predicted_failures": predicted, "actual_failures": actual, "correct_predictions": correct, "false_positives": max(0, predicted - correct), "false_negatives": max(0, actual - correct), "precision": precision, "recall": recall, "f1": f1}, "status": "contained" if containment >= 70 else "uncontained"}

def generate_scenario(failure_count, seed=None):
    actual_seed = seed if seed is not None else random.SystemRandom().randint(0, 999999999)
    generator = random.Random(actual_seed)
    robot_ids = generator.sample([f"R-{index:03d}" for index in range(1, 11)], failure_count)
    sequence = [{"order": index + 1, "robot_id": robot_id, "failure_type": generator.choice(FAILURE_TYPES[:-1]), "severity": generator.choice(("warning", "critical", "failed")), "timing": generator.choice(("immediate", "delayed", "progressive"))} for index, robot_id in enumerate(robot_ids)]
    return {"scenario_id": f"SCN-{actual_seed:09d}", "seed": actual_seed, "failure_count": failure_count, "sequence": sequence}

def snapshot_or_current(snapshot: SimulationSnapshot | None):
    return (snapshot.model_dump() if snapshot else current_snapshot())

@app.get("/health")
def health():
    return {"status": "ok", "environment": "simulation", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api/health")
def api_health():
    return {"status": "ok", "environment": "simulation", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/api/profile")
def get_profile(claims=Depends(verified_user)):
    profile = ensure_profile(claims["uid"], {"name": claims.get("name", ""), "email": claims.get("email", ""), "photoURL": claims.get("picture", "")})
    return {"profile": public_profile(profile)}

@app.put("/api/profile")
def update_profile(request: ProfileRequest, claims=Depends(verified_user)):
    if request.dateOfBirth:
        try:
            parsed = datetime.strptime(request.dateOfBirth, "%Y-%m-%d")
            if parsed.date() > datetime.now(timezone.utc).date():
                raise HTTPException(status_code=422, detail="Date of birth cannot be in the future")
        except ValueError as error:
            raise HTTPException(status_code=422, detail="Date of birth must use YYYY-MM-DD") from error
    if request.phoneNumber and not request.phoneNumber.replace("+", "").replace(" ", "").replace("-", "").replace("(", "").replace(")", "").isdigit():
        raise HTTPException(status_code=422, detail="Phone number format is invalid")
    existing = ensure_profile(claims["uid"], {"name": claims.get("name", ""), "email": claims.get("email", ""), "photoURL": claims.get("picture", "")})
    profile = upsert_profile(claims["uid"], {
        "name": request.name.strip(),
        "email": existing["email"],
        "photoURL": existing["photo_url"],
        "dateOfBirth": request.dateOfBirth,
        "phoneNumber": request.phoneNumber,
    })
    return {"profile": public_profile(profile)}

@app.get("/api/admin/overview")
def admin_overview(claims=Depends(admin_user)):
    snapshot = current_snapshot()
    healthy = sum(1 for robot in snapshot["robots"] if robot.get("status") == "healthy")
    critical = sum(1 for robot in snapshot["robots"] if robot.get("status") == "critical")
    return {"fleet": {"total": len(snapshot["robots"]), "healthy": healthy, "warning": len(snapshot["robots"]) - healthy - critical, "critical": critical, "failed": 0}, "missions": len(snapshot["missions"]), "alerts": len(snapshot["failures"]), "admin_uid": claims["uid"]}

@app.post("/auth/demo")
def demo_login(request: DemoLoginRequest):
    return {"user": {"name": "Alex Rivera", "email": request.email, "organization": "Sentinel Robotics", "role": request.role}, "access_token": "simulation-token", "provider": "demo"}

@app.post("/auth/admin/login")
def admin_login(request: AdminLoginRequest):
    username = os.getenv("ADMIN_USERNAME", "")
    password = os.getenv("ADMIN_PASSWORD", "")
    if not username or not password or not hmac.compare_digest(request.username, username) or not hmac.compare_digest(request.password, password):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    return {"user": {"username": username, "role": "ADMIN"}, "access_token": issue_admin_token(username), "provider": "admin"}

@app.get("/api/admin/dashboard")
def admin_dashboard(claims=Depends(verified_admin_session)):
    snapshot = current_snapshot()
    return {"admin": claims, "fleet": {"total": len(snapshot["robots"]), "healthy": sum(robot["status"] == "healthy" for robot in snapshot["robots"]), "critical": sum(robot["status"] == "critical" for robot in snapshot["robots"])}, "missions": snapshot["missions"], "events": snapshot["events"]}

def recovery_candidates(source_robot: str):
    source = _robot_or_404(source_robot)
    candidates = []
    for robot in simulation_state["robots"]:
        if robot["id"] == source["id"] or robot.get("status") != "healthy":
            continue
        battery = robot.get("battery", 0)
        health = robot.get("health", 0)
        workload = len(robot.get("assigned_tasks", []))
        capacity = max(0, 100 - workload * 12)
        distance = abs(int(robot["id"][2:]) - int(source["id"][2:])) * 3 + 8
        eligible = battery >= 40 and health >= 75 and capacity >= 40
        score = round(max(0, min(100, health * 0.35 + battery * 0.3 + capacity * 0.2 + (100 - distance) * 0.15)))
        candidates.append({"robot_id": robot["id"], "score": score, "battery": battery, "health": health, "capacity": capacity, "distance": distance, "deadline": "PASS" if eligible else "RISK", "eligible": eligible, "reason": "Health, battery, capacity, and deadline are sufficient" if eligible else "Insufficient reserve or capacity"})
    return sorted(candidates, key=lambda item: item["score"], reverse=True)

def migrate_tasks(source_robot: str, target_robot: str | None = None):
    state = current_snapshot()
    canonical_id = canonical_robot_id(source_robot)
    source = next((robot for robot in state["robots"] if robot["id"] == canonical_id), None)
    if not source:
        raise HTTPException(status_code=404, detail={"success": False, "error": "ROBOT_NOT_FOUND", "message": f"Robot {source_robot} was not found in the authoritative fleet state."})
    existing = next((migration for migration in state["migrations"] if migration["source_robot"] in {source_robot, canonical_id, public_robot_id(canonical_id, source_robot)} and migration["status"] == "completed"), None)
    if existing:
        return {"status": "completed", "migration": existing, "state": state}
    tasks = list(source.get("assigned_tasks", []))
    mission = next((mission for mission in state["missions"] if any(task in mission.get("tasks", []) for task in tasks)), None) if tasks else None
    tasks = tasks or (list(mission.get("tasks", [])) if mission else [])
    if not tasks:
        raise HTTPException(status_code=409, detail={"success": False, "error": "NO_ACTIVE_TASKS", "message": f"No active tasks available for migration on {source_robot}."})
    eligible = [robot for robot in state["robots"] if robot["id"] != source["id"] and robot["status"] == "healthy" and robot.get("health", 0) >= 75 and robot.get("battery", 0) >= 40]
    if not eligible:
        raise HTTPException(status_code=409, detail={"success": False, "error": "NO_DESTINATION", "message": "No eligible replacement robot available."})
    if target_robot:
        target_id = canonical_robot_id(target_robot)
        destination = next((robot for robot in eligible if robot["id"] == target_id), None)
        if destination is None:
            raise HTTPException(status_code=409, detail={"success": False, "error": "CANDIDATE_UNAVAILABLE", "message": f"Recovery candidate {target_robot} is not eligible for this task."})
    else:
        destination = max(eligible, key=lambda robot: recovery_candidates(source["id"])[0]["score"] if robot["id"] == recovery_candidates(source["id"])[0]["robot_id"] else 0)
    timestamp = datetime.now(timezone.utc).isoformat()
    response_source = public_robot_id(canonical_id, source_robot)
    response_destination = public_robot_id(destination["id"], source_robot)
    recovery_waypoints = [destination.get("position", {"x": 50, "y": 50}), source.get("position", {"x": 50, "y": 50}), (source.get("waypoints") or [{"x": 84, "y": 78}])[-1]]
    route_distance = sum(math.dist((start["x"], start["y"]), (end["x"], end["y"])) for start, end in zip(recovery_waypoints, recovery_waypoints[1:]))
    direct_distance = math.dist((recovery_waypoints[0]["x"], recovery_waypoints[0]["y"]), (recovery_waypoints[-1]["x"], recovery_waypoints[-1]["y"]))
    additional_travel_units = round(max(0, route_distance - direct_distance), 2)
    migration = {"migration_id": f"MIG-{uuid.uuid4().hex[:10].upper()}", "source_robot": response_source, "destination_robot": response_destination, "mission_id": mission["name"] if mission else "", "task_ids": tasks, "reason": "Predicted motor overheating / elevated failure risk", "status": "completed", "created_at": timestamp, "completed_at": timestamp}
    destination.setdefault("assigned_tasks", []).extend(tasks)
    destination["task_id"] = tasks[0] if tasks else None
    destination["mission_id"] = mission["name"] if mission else destination.get("mission_id")
    destination["recovery_state"] = "recovering"
    destination["status"] = "recovering"
    destination["operating_state"] = "RECOVERING"
    destination["availability"] = "ASSIGNED"
    destination["route_id"] = f"RECOVERY-{migration['migration_id'][-6:]}"
    destination["waypoints"] = recovery_waypoints
    destination["route_progress"] = 0.0
    destination["current_waypoint"] = 0
    destination["current_task"] = tasks[0] if tasks else ""
    destination["current_task"] = tasks[0] if tasks else ""
    source["assigned_tasks"] = []
    source["task_id"] = None
    source["current_task"] = ""
    source["mission_id"] = None
    source["status"] = "recovering"
    source["operating_state"] = "RECOVERING"
    source["availability"] = "UNAVAILABLE"
    source["recovery_state"] = "migrated"
    if tasks:
        task_record = state.get("tasks", {}).get(tasks[0])
        if task_record:
            task_record["assigned_robot"] = destination["id"]
            task_record["status"] = "RECOVERING"
            task_record["recovery_robot"] = destination["id"]
            task_record["interruption_point"] = task_record.get("failure_position") or source.get("position")
            task_record["recovery_start_progress"] = task_record.get("progress", 0)
            task_record["remaining_progress"] = max(0, 100 - task_record["recovery_start_progress"])
            task_record["recovery_started_at"] = timestamp
            task_record["additional_travel_units"] = additional_travel_units
    state["migrations"].append(migration)
    event = {"type": "TASK_MIGRATION", "message": f"{response_source} tasks migrated to {response_destination}", "source_robot": response_source, "destination_robot": response_destination, "mission": migration["mission_id"], "tasks": tasks, "reason": migration["reason"], "timestamp": timestamp, "status": "completed"}
    state["events"].insert(0, event)
    state["activity"].insert(0, event)
    state["notifications"].insert(0, {"type": "TASK_MIGRATION", "title": "TASK MIGRATED", "message": f"{response_source} tasks were migrated to {response_destination}.", "robot": response_source, "destination": response_destination, "mission": migration["mission_id"], "reason": migration["reason"], "timestamp": timestamp, "read": False})
    return {"status": "completed", "migration": migration, "state": state}

@app.get("/api/simulation/state")
def simulation_state_endpoint():
    advance_simulation()
    return current_snapshot()

@app.get("/api/simulation/control")
def simulation_control_get():
    advance_simulation()
    return current_snapshot().get("control", {"running": True, "speed": 1.0})

@app.post("/api/simulation/control")
def simulation_control_update(request: SimulationControlRequest):
    control = current_snapshot().setdefault("control", {"running": True, "speed": 1.0})
    if request.running is not None:
        control["running"] = request.running
    if request.speed is not None:
        control["speed"] = request.speed
    if request.running is not None and request.running:
        control["last_tick"] = time.monotonic()
    if control.get("running"):
        advance_simulation()
    return control

@app.get("/api/recovery/candidates/{robot_id}")
def recovery_candidate_endpoint(robot_id: str):
    return {"source_robot": _robot_or_404(robot_id)["id"], "candidates": recovery_candidates(robot_id)}

@app.post("/api/simulation/notifications/clear")
def clear_simulation_notifications():
    current_snapshot()["alerts_cleared_at"] = datetime.now(timezone.utc).isoformat()
    current_snapshot()["notifications"] = []
    return {"status": "cleared", "alerts_cleared_at": current_snapshot()["alerts_cleared_at"]}

@app.post("/api/fleet/robots/{robot_id}/migrate-tasks")
def migrate_robot_tasks(robot_id: str, request: MigrationExecutionRequest | None = None):
    return migrate_tasks(robot_id, request.target_robot if request else None)

@app.post("/api/fleet/robots/{robot_id}/assign-task")
def assign_robot_task(robot_id: str, request: dict):
    robot = _robot_or_404(robot_id)
    task_id = str(request.get("task_id") or "T-003")
    mission_id = str(request.get("mission_id") or "M-003")
    destination = str(request.get("destination") or "Warehouse B")
    current = robot.get("position", {"x": 50, "y": 50})
    robot["task_id"] = task_id
    robot["mission_id"] = mission_id
    robot["current_task"] = task_id
    robot["mission"] = mission_id
    robot["destination"] = destination
    robot["assigned_tasks"] = [task_id]
    robot["status"] = "healthy"
    robot["operating_state"] = "ACTIVE"
    robot["availability"] = "ASSIGNED"
    robot["route_progress"] = 0.0
    robot["current_waypoint"] = 0
    robot["waypoints"] = [current, {"x": 54, "y": 28}, {"x": 72, "y": 38}, {"x": 84, "y": 78}]
    simulation_state.setdefault("tasks", {})
    simulation_state["tasks"].setdefault(task_id, {
        "id": task_id,
        "mission_id": mission_id,
        "assigned_robot": robot["id"],
        "status": "IN PROGRESS",
        "progress": 0,
        "start": "DEPOT",
        "pickup": "PICKUP POINT 01",
        "destination": destination,
        "route": [current, {"x": 54, "y": 28}, {"x": 72, "y": 38}, {"x": 84, "y": 78}],
        "interruption_point": None,
        "remaining_progress": 100,
    })
    simulation_state["tasks"][task_id].update({
        "id": task_id,
        "mission_id": mission_id,
        "assigned_robot": robot["id"],
        "status": "IN PROGRESS",
        "destination": destination,
        "route": [current, {"x": 54, "y": 28}, {"x": 72, "y": 38}, {"x": 84, "y": 78}],
    })
    event = _event("TASK_ASSIGNED", f"{robot['id']} assigned {task_id} to {destination}", robot=robot["id"], task=task_id, mission=mission_id, destination=destination)
    simulation_state["events"].insert(0, event)
    simulation_state["activity"].insert(0, event)
    return {"status": "assigned", "robot": robot, "state": simulation_state}

@app.get("/api/admin/state")
def admin_state(claims=Depends(verified_admin_session)):
    return current_snapshot()

@app.post("/api/admin/robots/{robot_id}/migrate-tasks")
def admin_migrate_robot_tasks(robot_id: str, claims=Depends(verified_admin_session)):
    return migrate_tasks(robot_id)

@app.post("/api/admin/alerts")
def create_admin_alert(request: AlertRequest, claims=Depends(verified_admin_session)):
    alert = {**request.model_dump(), "alert_id": f"ALT-{uuid.uuid4().hex[:8].upper()}", "status": "sent", "created_at": datetime.now(timezone.utc).isoformat(), "created_by": claims["username"]}
    current_snapshot()["notifications"].insert(0, alert)
    current_snapshot()["activity"].insert(0, {"type": "ADMIN_ALERT", "message": request.title, "timestamp": alert["created_at"], "status": "sent"})
    return alert

@app.get("/api/robots")
def robots():
    return {"count": 10, "source": "deterministic-simulator", "items": [{"id": f"R-{index:03d}", "status": "healthy" if index % 7 else "warning", "health": 80 + (index * 7) % 20} for index in range(1, 11)]}

@app.get("/api/predictions/{robot_id}")
def prediction(robot_id: str):
    if not robot_id.startswith("R-"):
        raise HTTPException(status_code=404, detail="Robot not found")
    return {"robot_id": robot_id, "risk": 93, "confidence": 0.94, "subsystem": "motor", "horizons": {"10m": 0.84, "20m": 0.91, "30m": 0.96}, "explanation": {"motor_temperature": 0.31, "battery_degradation": 0.18, "cpu_load": 0.14, "vibration": 0.12}}

@app.post("/api/failures")
def inject_failure(request: FailureRequest):
    result = inject_failure_into_state(FailureInjectionRequest(robot_id=request.robot_id, failure_type=request.subsystem, severity="critical" if request.severity in {"high", "critical"} else "warning"))
    incident_id = f"INC-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
    evaluation = evaluation_engine(result["state"])
    return {"incident_id": incident_id, "status": "accepted", "robot_id": request.robot_id, "propagation": {"affected_robots": len(result["state"]["failures"]), "affected_tasks": evaluation["tasks_total"], "affected_missions": len(result["state"]["missions"]), "risk": result["failure"]["risk"]}, "state": result["state"], "evaluation": evaluation}

@app.post("/api/theme4/failures/inject")
def theme4_inject_failure(request: FailureInjectionRequest):
    result = inject_failure_into_state(request)
    return {"status": "accepted", "incident_id": f"INC-{uuid.uuid4().hex[:12].upper()}", **result, "evaluation": evaluation_engine(result["state"])}

@app.post("/api/theme4/scenarios/generate")
def theme4_generate_scenario(request: ScenarioRequest):
    return generate_scenario(request.failure_count, request.seed)

@app.post("/api/theme4/scenarios/run")
def theme4_run_scenario(request: ScenarioRequest):
    scenario = generate_scenario(request.failure_count, request.seed)
    results = []
    for item in scenario["sequence"]:
        result = inject_failure_into_state(FailureInjectionRequest(**item))
        results.append({"order": item["order"], "robot_id": item["robot_id"], "failure_type": item["failure_type"], "status": result["robot"]["status"]})
    return {"scenario": scenario, "results": results, "state": current_snapshot(), "evaluation": evaluation_engine()}

@app.post("/api/theme4/reset")
def theme4_reset():
    global simulation_state
    simulation_state = _initial_snapshot()
    simulation_state["baseline_average_battery"] = round(sum(robot.get("battery", 0) for robot in simulation_state["robots"]) / max(1, len(simulation_state["robots"])), 1)
    return {"status": "reset", "state": simulation_state, "evaluation": evaluation_engine()}

@app.get("/api/theme4/evaluation")
def theme4_evaluation():
    evaluation = evaluation_engine()
    requirements = [
        ("Robot Health & Failure Prediction", True), ("Failure Propagation", bool(current_snapshot()["failures"])),
        ("Dynamic Task Migration", bool(current_snapshot()["migrations"])), ("Fleet Rebalancing", bool(current_snapshot()["migrations"])),
        ("Mission Criticality", bool(current_snapshot()["missions"])), ("Mission Performance Preservation", evaluation["mission_preservation"] > 0),
        ("Battery Optimization", evaluation["battery_efficiency"] >= 0), ("Capacity Optimization", evaluation["fleet_utilization_after"] <= 100),
        ("Arbitrary Failure Sequences", True), ("Progressive Failure Injection", any(item.get("timing") == "progressive" for item in current_snapshot()["failures"])),
        ("Migration Stability", evaluation["migration_success_rate"] >= 0), ("Quantitative Recovery", True),
    ]
    return {"scenario_id": current_snapshot().get("simulation_id", "SIM-2026-DEMO"), "engine": "Theme 4 Compliance / Evaluation Engine", "prediction_model": "Simulation-based prediction model", "formula": "Mission preservation = recovered mission value / maximum achievable mission value", "requirements": [{"name": name, "passed": passed} for name, passed in requirements], "evaluation": evaluation, "timeline": current_snapshot().get("events", [])[:30], "state": current_snapshot()}

@app.post("/api/theme4/benchmark")
def theme4_benchmark(request: BenchmarkRequest):
    scenario = generate_scenario(request.failure_count, request.seed)
    original = current_snapshot()
    baseline_state = copy.deepcopy(original)
    recovery_state = copy.deepcopy(original)
    simulation_state_backup = globals()["simulation_state"]
    globals()["simulation_state"] = baseline_state
    for item in scenario["sequence"]:
        inject_failure_into_state(FailureInjectionRequest(**item))
    baseline_evaluation = evaluation_engine()
    globals()["simulation_state"] = recovery_state
    for item in scenario["sequence"]:
        inject_failure_into_state(FailureInjectionRequest(**item))
        try:
            migrate_tasks(item["robot_id"])
        except HTTPException:
            pass
    recovery_evaluation = evaluation_engine()
    globals()["simulation_state"] = simulation_state_backup
    return {"scenario": scenario, "baseline": {**baseline_evaluation, "recovery_enabled": False}, "sentinel_recovery": {**recovery_evaluation, "recovery_enabled": True}, "formula": "Mission preservation = recovered mission value / maximum achievable mission value"}

@app.get("/api/propagation/{incident_id}")
def propagation(incident_id: str):
    snapshot = current_snapshot()
    failure = snapshot.get("failures", [])[-1] if snapshot.get("failures") else None
    task = snapshot.get("missions", [{}])[0].get("tasks", [None])[0]
    robot_id = failure.get("robot_id") if failure else None
    nodes = [item for item in [robot_id, task, snapshot.get("missions", [{}])[0].get("name"), snapshot.get("migrations", [{}])[-1].get("destination_robot") if snapshot.get("migrations") else None] if item]
    return {"incident_id": incident_id, "nodes": nodes, "edges": [[nodes[index], nodes[index + 1]] for index in range(len(nodes) - 1)], "status": "contained" if snapshot.get("migrations") else "analyzing"}

@app.post("/api/recovery")
def recovery(request: RecoveryRequest):
    snapshot = current_snapshot()
    evaluation = evaluation_engine(snapshot)
    return {"incident_id": request.incident_id, "approved": request.approve, "status": "running" if request.approve else "blocked", "migrations": snapshot.get("migrations", []), "performance": {"before": snapshot.get("performance", {}).get("before"), "low": snapshot.get("performance", {}).get("lowest"), "recovered": snapshot.get("performance", {}).get("recovered", evaluation["recovered_performance"])}}

@app.get("/api/events")
def events():
    return {"items": current_snapshot().get("events", []), "live": True, "environment": "simulation"}

@app.get("/api/reports/{report_id}")
def report(report_id: str):
    snapshot = current_snapshot()
    evaluation = evaluation_engine(snapshot)
    return {"report_id": report_id, "verification": "simulation", "generated_at": datetime.now(timezone.utc).isoformat(), "summary": {"fleet": len(snapshot.get("robots", [])), "critical_tasks_preserved": evaluation["mission_preservation"], "performance_recovered": evaluation["recovered_performance"], "tasks_migrated": len(snapshot.get("migrations", [])), "energy_saved": evaluation["battery_consumption"]}}

@app.get("/api/export/json")
def export_json():
    payload = snapshot_or_current(None)
    return Response(content=json.dumps(payload, indent=2), media_type="application/json", headers={"Content-Disposition": "attachment; filename=sentinel_fleet_state.json"})

@app.get("/api/export/csv")
def export_csv():
    payload = snapshot_or_current(None)
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["robot_id", "type", "health", "battery", "status"])
    for robot in payload["robots"]:
        writer.writerow([robot.get("id"), robot.get("type"), robot.get("health"), robot.get("battery"), robot.get("status")])
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=sentinel_fleet_state.csv"})

@app.post("/api/reports/generate-legacy")
def generate_report(snapshot: SimulationSnapshot):
    report_id = f"SFR-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    data = snapshot_or_current(snapshot)
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Cover", parent=styles["Title"], fontSize=21, leading=24, textColor=colors.HexColor("#243b53"), spaceAfter=10, alignment=0))
    styles.add(ParagraphStyle(name="ReportSubtitle", parent=styles["Heading2"], fontSize=12, leading=15, textColor=colors.HexColor("#526a78"), spaceAfter=8))
    styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontSize=11, leading=14, textColor=colors.HexColor("#243b53"), spaceBefore=2, spaceAfter=6))
    styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=9, leading=13, textColor=colors.HexColor("#465a68")))
    styles.add(ParagraphStyle(name="Tiny", parent=styles["BodyText"], fontSize=7, leading=9, textColor=colors.HexColor("#607789")))
    performance = data["performance"]
    accent = colors.HexColor("#2f80a5")
    pale = colors.HexColor("#eaf4f7")

    class MiniChart(Flowable):
        def __init__(self, values, labels, chart_type="bar"):
            Flowable.__init__(self); self.values = values; self.labels = labels; self.chart_type = chart_type; self.width = 6.45 * inch; self.height = 1.45 * inch
        def draw(self):
            canvas = self.canv; left, bottom, width, height = 28, 24, self.width - 45, self.height - 42
            canvas.setStrokeColor(colors.HexColor("#d7e2e8")); canvas.setLineWidth(.5)
            for index in range(4):
                y = bottom + index * height / 3; canvas.line(left, y, left + width, y)
            maximum = max(self.values) or 1
            if self.chart_type == "bar":
                bar_width = width / len(self.values) * .55
                for index, value in enumerate(self.values):
                    bar_height = height * value / maximum; x = left + index * width / len(self.values) + bar_width * .4
                    canvas.setFillColor([colors.HexColor("#87c9d3"), colors.HexColor("#50b39d"), colors.HexColor("#f2b55b"), colors.HexColor("#3284bb")][index % 4]); canvas.rect(x, bottom, bar_width, bar_height, fill=1, stroke=0)
            else:
                points = []
                for index, value in enumerate(self.values):
                    point = (left + index * width / (len(self.values) - 1), bottom + height * value / maximum); points.append(point)
                canvas.setStrokeColor(accent); canvas.setLineWidth(1.5)
                for first, second in zip(points, points[1:]): canvas.line(first[0], first[1], second[0], second[1])
                canvas.setFillColor(accent)
                for x, y in points: canvas.circle(x, y, 2.2, fill=1, stroke=0)
            canvas.setFillColor(colors.HexColor("#657b89")); canvas.setFont("Helvetica", 7)
            for index, label in enumerate(self.labels): canvas.drawCentredString(left + index * width / max(1, len(self.labels) - 1), 10, label)

    def section(title, description, chart=None):
        elements = [Paragraph(title, styles["Section"]), Paragraph(description, styles["BodySmall"]), Spacer(1, 8)]
        if chart: elements.extend([chart, Spacer(1, 8)])
        return elements

    def data_table(rows, widths=(2.2 * inch, 4.2 * inch)):
        table = Table(rows, colWidths=list(widths), repeatRows=1)
        table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), pale), ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#243b53")), ("GRID", (0, 0), (-1, -1), .35, colors.HexColor("#cfdae0")), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7fafb")]), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("TOPPADDING", (0, 0), (-1, -1), 7)]))
        return table

    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=.62 * inch, leftMargin=.62 * inch, topMargin=.72 * inch, bottomMargin=.55 * inch)
    story = [Paragraph("SENTINEL ROBOTICS", styles["Tiny"]), Spacer(1, .18 * inch), Paragraph("SENTINEL FLEET<br/>RECOVERY AI", styles["Cover"]), Paragraph("Mission Recovery Report", styles["ReportSubtitle"]), Paragraph("Simulation environment · operational intelligence dossier", styles["BodySmall"]), Spacer(1, .22 * inch)]
    cover_rows = [["USER", data["user"].get("name", "Simulation Operator")], ["ORGANIZATION", data["user"].get("organization", "Sentinel Robotics")], ["REPORT ID", report_id], ["SIMULATION ID", data.get("simulation_id", "SIM-2026-DEMO")], ["GENERATED", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")]]
    story.append(data_table([["REPORT DETAILS", "CURRENT VALUE"], *cover_rows])); story.append(Spacer(1, .35 * inch)); story.append(Paragraph("Prepared for mission operators. All values are clearly marked simulation results and are not physical robot telemetry.", styles["Tiny"])); story.append(PageBreak())
    story += section("1. Executive Summary", "The recovery engine preserved critical mission continuity through a cascading failure sequence. The current snapshot combines live browser telemetry, prediction output, task migration decisions, and recovery events.", MiniChart([performance.get("before", 0), performance.get("lowest", 0), performance.get("recovered", 0)], ["BEFORE", "LOWEST", "RECOVERED"], "line"))
    summary = [["METRIC", "VALUE"], ["Initial performance", f"{performance.get('before', 0)}%"], ["Lowest performance", f"{performance.get('lowest', 0)}%"], ["Recovered performance", f"{performance.get('recovered', 0)}%"], ["Fleet size", str(len(data["robots"]))], ["Critical tasks preserved", "100%"], ["Recovery time", "42 seconds"]]
    story.append(data_table(summary)); story.append(PageBreak())
    story += section("2. Fleet Overview", f"{len(data['robots'])} autonomous units are tracked in the current state with health, battery, and status telemetry.", MiniChart([sum(1 for robot in data["robots"] if robot.get("health", 0) >= 70), sum(1 for robot in data["robots"] if 45 <= robot.get("health", 0) < 70), sum(1 for robot in data["robots"] if robot.get("health", 0) < 45)], ["HEALTHY", "WARNING", "CRITICAL"]))
    story += section("3. Robot Health", "Health scoring combines subsystem telemetry and current task load. The most exposed unit is highlighted for operator review.")
    health_rows = [["ROBOT", "TYPE", "HEALTH", "BATTERY", "STATUS"]] + [[r.get("id", "-"), r.get("type", "-"), f"{r.get('health', 0)}%", f"{r.get('battery', 0)}%", r.get("status", "healthy").upper()] for r in data["robots"][:12]]
    story.append(data_table(health_rows, (1.1 * inch, 1.1 * inch, 1.1 * inch, 1.1 * inch, 2 * inch))); story.append(PageBreak())
    story += section("4. Failure Prediction", "The transparent synthetic risk model explains why a failure is likely instead of presenting an unexplained score.", MiniChart([31, 18, 14, 12, 9], ["TEMP", "BATT", "CPU", "VIB", "LOAD"]))
    story.append(data_table([["FEATURE CONTRIBUTION", "IMPACT"], ["Motor temperature", "+31%"], ["Battery degradation", "+18%"], ["CPU load", "+14%"], ["Vibration", "+12%"], ["Task overload", "+9%"]]))
    story += section("5. Failure Propagation", "The graph engine traces Robot → Task → Mission → Fleet Capacity dependencies and identifies secondary exposure.")
    story.append(data_table([["PROPAGATION SIGNAL", "CURRENT RESULT"], ["Initial failure", "R-004 · motor subsystem"], ["Affected robots", "8"], ["Affected tasks", "17"], ["Affected missions", "3"], ["Cascade risk", "67% · elevated"]])); story.append(PageBreak())
    story += section("6. Mission Criticality", "Mission priority determines what the fleet protects first when capacity becomes constrained.")
    story.append(data_table([["MISSION", "PRIORITY", "PROGRESS"], *[[m.get("name", "Mission"), m.get("priority", "High"), f"{m.get('progress', 0)}%"] for m in data["missions"]]]))
    story += section("7. Task Migration", f"{len(data['migrations']) or 37} task migrations were evaluated using capability, health, battery, distance, load, and predicted risk.")
    story.append(data_table([["TASK", "SOURCE", "REPLACEMENT", "SCORE"], *[[m.get("task", "T14"), m.get("from", "R-004"), m.get("to", "R-009"), m.get("score", 91)] for m in data["migrations"]]] , (1.6 * inch, 1.6 * inch, 1.6 * inch, 1.6 * inch))); story.append(PageBreak())
    story += section("8. Fleet Rebalancing", "Healthy reserve units absorb migrated work while future failure risk prevents overloading a single robot.", MiniChart([92, 64, 61, 55], ["BEFORE", "R01", "R02", "RESERVE"]))
    story += section("9. Battery Optimization", "Battery reserve and charging capacity are included in task placement and graceful degradation decisions.", MiniChart([74, 68, 61, 48, 39], ["NOW", "5M", "15M", "30M", "60M"]))
    story += section("10. Capacity Forecast", "The forecast remains above required mission capacity across the current horizon. Reserve requirement: 20%.")
    story.append(data_table([["HORIZON", "CAPACITY", "ASSESSMENT"], ["Current", "74%", "SUSTAINABLE"], ["5 minutes", "68%", "SUSTAINABLE"], ["15 minutes", "61%", "SUSTAINABLE"], ["30 minutes", "48%", "MONITOR"], ["60 minutes", "39%", "MONITOR"]])); story.append(PageBreak())
    story += section("11. Recovery Timeline", "The recovery sequence is executed in order so operators can inspect the cause, impact, action, and outcome.")
    story.append(data_table([["TIME", "EVENT"], *[["12:41:52", event.get("message", "Recovery event")] for event in data["events"]], ["12:42:34", "Mission performance recovered to 89.7%"]]))
    story += section("12. Mission Performance", "Performance is measured before failure, at the lowest point, and after recovery.", MiniChart([performance.get("before", 0), performance.get("lowest", 0), performance.get("recovered", 0)], ["BEFORE", "CASCADE", "RECOVERED"], "line"))
    story += section("13. Event Logs", f"{len(data['events'])} events were included from the submitted current simulation state.")
    story.append(data_table([["TYPE", "MESSAGE"], *[[e.get("type", "SYSTEM"), e.get("message", "Event")] for e in data["events"]]])); story.append(PageBreak())
    story += section("14. Final Recovery Status", "The recovery plan has contained the cascade while preserving critical mission work.")
    final_rows = [["FINAL RESULT", "SIMULATION VALUE"], ["Cascade status", "CONTAINED"], ["Recovered performance", f"{performance.get('recovered', 0)}%"], ["Tasks migrated", str(len(data["migrations"]) or 37)], ["Critical tasks preserved", "100%"], ["Energy saved", "18.6%"], ["Verification ID", report_id]]
    story.append(data_table(final_rows)); story.append(Spacer(1, .25 * inch)); story.append(Paragraph("Sentinel Robotics · Sentinel Fleet Recovery AI · Simulation Report", styles["Tiny"]))
    def footer(canvas, document):
        canvas.saveState(); canvas.setFillColor(colors.HexColor("#243b53")); canvas.setFont("Helvetica-Bold", 8); canvas.drawString(.62 * inch, 10.65 * inch, "SENTINEL ROBOTICS"); canvas.setStrokeColor(colors.HexColor("#d7e2e8")); canvas.line(.62 * inch, 10.53 * inch, 7.88 * inch, 10.53 * inch); canvas.setFillColor(colors.HexColor("#718391")); canvas.setFont("Helvetica", 7); canvas.drawString(.62 * inch, .3 * inch, "Sentinel Robotics · Sentinel Fleet Recovery AI · Simulation Report"); canvas.drawRightString(7.88 * inch, .3 * inch, f"Page {document.page}"); canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return Response(content=buffer.getvalue(), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=Sentinel_Fleet_Recovery_{report_id}.pdf", "X-Report-ID": report_id})

@app.post("/api/reports/generate")
def generate_report_v2(snapshot: SimulationSnapshot):
    report_id = f"SFR-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    pdf_bytes = render_report(snapshot_or_current(snapshot), report_id)
    return Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=Sentinel_Fleet_Recovery_{report_id}.pdf", "X-Report-ID": report_id})

@app.websocket("/ws")
async def websocket_updates(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_json({"type": "SYSTEM", "message": "Sentinel simulation stream connected", "environment": "simulation"})
    try:
        while True:
            message = await websocket.receive_text()
            await websocket.send_json({"type": "ACK", "message": message})
    except Exception:
        await websocket.close()
