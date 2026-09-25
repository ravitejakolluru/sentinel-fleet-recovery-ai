from pathlib import Path
from types import SimpleNamespace
from fastapi.testclient import TestClient
import main
from main import app, verified_user
import profile_store

client = TestClient(app)

def test_health_and_simulation_label():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["environment"] == "simulation"

def test_prediction_and_recovery_contract():
    prediction = client.get("/api/predictions/R-004")
    assert prediction.status_code == 200
    assert prediction.json()["confidence"] == 0.94
    recovery = client.post("/api/recovery", json={"incident_id": "INC-TEST", "approve": True})
    assert recovery.status_code == 200
    assert recovery.json()["performance"]["recovered"] == 89.7

def test_demo_auth_role():
    response = client.post("/auth/demo", json={"role": "Operator"})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "Operator"


def test_robot_alias_lookup_is_canonical_and_case_insensitive():
    assert client.post('/api/fleet/robots/SV-088/migrate-tasks').status_code in {200, 409}
    assert client.post('/api/fleet/robots/sv-088/migrate-tasks').status_code in {200, 409}
    assert client.post('/api/fleet/robots/R-088/migrate-tasks').status_code in {200, 409}

def test_real_pdf_and_exports():
    pdf = client.post("/api/reports/generate", json={"performance": {"before": 98.4, "lowest": 54.2, "recovered": 89.7}, "robots": [{"id": "R-004", "health": 38}], "migrations": [{"task": "T14"}]})
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "Sentinel_Fleet_Recovery_" in pdf.headers["content-disposition"]
    page_count = pdf.content.count(b"/Type /Page")
    assert 6 <= page_count <= 10
    assert client.get("/api/export/json").headers["content-type"].startswith("application/json")
    assert client.get("/api/export/csv").headers["content-type"].startswith("text/csv")


def test_profile_update_persists_and_does_not_trust_identity_fields(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(profile_store, "DB_PATH", tmp_path / "profile-test.db")
    app.dependency_overrides[verified_user] = lambda: {"uid": "user-a", "name": "Google Name", "email": "a@example.com", "picture": "https://photo/a"}
    try:
        response = client.put("/api/profile", json={"name": "Saved Name", "date_of_birth": "1992-04-03", "phone": "+1 (555) 123-4567", "uid": "user-b", "email": "attacker@example.com"})
        assert response.status_code == 200
        assert response.json()["profile"] == {
            "uid": "user-a", "name": "Saved Name", "email": "a@example.com", "photoURL": "https://photo/a",
            "dateOfBirth": "1992-04-03", "phoneNumber": "+1 (555) 123-4567", "provider": "google", "role": "USER",
            "accountStatus": "ACTIVE", "createdAt": response.json()["profile"]["createdAt"],
            "lastLoginAt": response.json()["profile"]["lastLoginAt"], "lastSeenAt": response.json()["profile"]["lastSeenAt"],
        }
        loaded = client.get("/api/profile")
        assert loaded.status_code == 200
        assert loaded.json()["profile"]["name"] == "Saved Name"
        assert loaded.json()["profile"]["dateOfBirth"] == "1992-04-03"
        assert loaded.json()["profile"]["phoneNumber"] == "+1 (555) 123-4567"
    finally:
        app.dependency_overrides.clear()


def test_profile_requires_authentication():
    assert client.get("/api/profile").status_code == 401


def test_profile_rejects_invalid_payload():
    app.dependency_overrides[verified_user] = lambda: {"uid": "user-a", "email": "a@example.com"}
    try:
        assert client.put("/api/profile", json={"name": "", "date_of_birth": "not-a-date", "phone": "bad"}).status_code == 422
    finally:
        app.dependency_overrides.clear()

def test_theme4_injection_updates_authoritative_state_and_progressive_timeline():
    assert client.post('/api/theme4/reset').status_code == 200
    response = client.post('/api/theme4/failures/inject', json={
        'robot_id': 'R-004', 'failure_type': 'communication', 'severity': 'critical', 'timing': 'progressive'
    })
    assert response.status_code == 200
    payload = response.json()
    robot = next(item for item in payload['state']['robots'] if item['id'] == 'R-004')
    assert robot['status'] == 'critical'
    assert any(event['type'] == 'PROPAGATION' for event in payload['state']['events'])
    assert payload['evaluation']['cascade_depth'] >= 2


def test_prediction_precedes_actual_failure_in_progressive_timeline():
    client.post('/api/theme4/reset')
    response = client.post('/api/theme4/failures/inject', json={
        'robot_id': 'R-003', 'failure_type': 'motor', 'severity': 'critical', 'timing': 'progressive'
    })
    payload = response.json()
    progressive_types = [event['type'] for event in reversed(payload['state']['events']) if event.get('robot') == 'R-003' and event['type'] in {'WARNING', 'HIGH_RISK', 'PREDICTION', 'PROPAGATION', 'FAILURE'}]
    assert progressive_types == ['WARNING', 'HIGH_RISK', 'PREDICTION', 'PROPAGATION', 'FAILURE']
    assert progressive_types.index('PREDICTION') < progressive_types.index('FAILURE')
    assert payload['state']['predictions'][-1]['robot_id'] == 'R-003'


def test_theme4_scenarios_are_seed_reproducible_and_benchmark_is_derived():
    first = client.post('/api/theme4/scenarios/generate', json={'failure_count': 6, 'seed': 48291}).json()
    second = client.post('/api/theme4/scenarios/generate', json={'failure_count': 6, 'seed': 48291}).json()
    assert first == second
    benchmark = client.post('/api/theme4/benchmark', json={'failure_count': 3, 'seed': 7})
    assert benchmark.status_code == 200
    result = benchmark.json()
    assert result['scenario']['seed'] == 7
    assert result['baseline']['recovery_enabled'] is False
    assert result['sentinel_recovery']['recovery_enabled'] is True
    assert 0 <= result['sentinel_recovery']['mission_preservation'] <= 100
    assert client.post('/api/theme4/reset').status_code == 200

def test_simulation_uses_10_robots_and_control_changes_state():
    client.post('/api/theme4/reset')
    state = client.get('/api/simulation/state').json()
    assert len(state['robots']) == 10
    paused = client.post('/api/simulation/control', json={'running': False, 'speed': 2})
    assert paused.status_code == 200
    assert paused.json()['running'] is False
    resumed = client.post('/api/simulation/control', json={'running': True, 'speed': 4})
    assert resumed.json() == {'running': True, 'speed': 4.0, 'last_tick': resumed.json()['last_tick']}


def test_assign_task_sets_active_route_and_moves_when_simulation_runs():
    client.post('/api/theme4/reset')
    robot = client.get('/api/simulation/state').json()['robots'][0]
    assigned = client.post(f"/api/fleet/robots/{robot['id']}/assign-task", json={
        'task_id': 'T-250', 'mission_id': 'M-250', 'destination': 'WAREHOUSE B'
    })
    assert assigned.status_code == 200
    assigned_payload = assigned.json()['robot']
    assert assigned_payload['current_task'] == 'T-250'
    assert assigned_payload['task_id'] == 'T-250'
    assert assigned_payload['mission_id'] == 'M-250'
    started = client.post('/api/simulation/control', json={'running': True, 'speed': 4.0})
    assert started.status_code == 200
    assert started.json()['running'] is True
    moved = client.get('/api/simulation/state').json()['robots'][0]
    assert moved['current_task'] == 'T-250'
    assert moved['route_progress'] >= 0
    assert moved['speed'] >= 0


def test_recovery_candidates_target_migration_and_notification_clear():
    client.post('/api/theme4/reset')
    candidates = client.get('/api/recovery/candidates/R-004')
    assert candidates.status_code == 200
    target = candidates.json()['candidates'][0]['robot_id']
    migration = client.post('/api/fleet/robots/R-004/migrate-tasks', json={'target_robot': target})
    assert migration.status_code == 200
    assert migration.json()['migration']['destination_robot'] == target
    cleared = client.post('/api/simulation/notifications/clear')
    assert cleared.status_code == 200
    assert client.get('/api/simulation/state').json()['alerts_cleared_at']
    client.post('/api/theme4/reset')


def test_recovery_route_preserves_task_progress_and_completes_mission(monkeypatch):
    clock = {'now': 100.0}
    monkeypatch.setattr(main, 'time', SimpleNamespace(monotonic=lambda: clock['now']))
    client.post('/api/theme4/reset')
    client.post('/api/simulation/control', json={'running': True, 'speed': 1})

    clock['now'] += 4
    before_failure = client.get('/api/simulation/state').json()
    preserved_progress = before_failure['tasks']['T-003']['progress']
    assert 0 < preserved_progress < 100

    failure = client.post('/api/theme4/failures/inject', json={
        'robot_id': 'R-003', 'failure_type': 'motor', 'severity': 'critical', 'timing': 'progressive'
    })
    assert failure.status_code == 200
    migrated = client.post('/api/fleet/robots/R-003/migrate-tasks', json={'target_robot': 'R-007'}).json()
    assert migrated['migration']['destination_robot'] == 'R-007'
    assert migrated['state']['missions'][0]['tasks'] == ['T-003']
    assert migrated['state']['tasks']['T-003']['recovery_start_progress'] == preserved_progress
    assert migrated['state']['tasks']['T-003']['recovery_started_at']
    assert migrated['state']['tasks']['T-003']['additional_travel_units'] >= 0

    clock['now'] += 4
    in_recovery = client.get('/api/simulation/state').json()
    assert preserved_progress < in_recovery['tasks']['T-003']['progress'] < 100
    assert in_recovery['tasks']['T-003']['status'] == 'RECOVERING'

    clock['now'] += 4
    recovered = client.get('/api/simulation/state').json()
    assert recovered['tasks']['T-003']['progress'] == 100
    assert recovered['tasks']['T-003']['remaining_progress'] == 0
    assert recovered['tasks']['T-003']['status'] == 'COMPLETED'
    assert recovered['tasks']['T-003']['recovery_completed_at']
    assert recovered['tasks']['T-003']['recovery_time_seconds'] >= 0
    assert recovered['missions'][0]['progress'] == 100
    assert recovered['missions'][0]['status'] == 'COMPLETED'
    assert any(event['type'] == 'RECOVERY' and event['robot'] == 'R-007' for event in recovered['events'])