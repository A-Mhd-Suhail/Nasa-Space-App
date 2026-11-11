"""Background analysis worker.

Pull model: the worker leases jobs from the web backend's internal job API
(PostgreSQL is the source of truth for job state there), sends heartbeats with
real processing stages while computing, and posts the typed result or a
structured failure. Stage names are part of the contract with the web app
(the job log renders them in order).

Env:
  MOONNAV_INTERNAL_API_URL   e.g. http://localhost:3100
  SCIENCE_SERVICE_TOKEN      shared bearer token
  WORKER_ID                  optional identifier
  WORKER_POLL_SECONDS        claim poll interval (default 2)
"""

from __future__ import annotations

import logging
import os
import socket
import threading
import time
from typing import Any

import httpx

from .analysis import AnalysisInputError, Scenario, run_analysis

log = logging.getLogger("moonnav.worker")
BASE = os.environ.get("MOONNAV_INTERNAL_API_URL", "http://localhost:3100").rstrip("/")
TOKEN = os.environ.get("SCIENCE_SERVICE_TOKEN", "")
WORKER_ID = os.environ.get("WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")
POLL_S = float(os.environ.get("WORKER_POLL_SECONDS", "2"))
HEARTBEAT_S = 10.0


def _client() -> httpx.Client:
    # Read at call time: on Vercel the `science -> app` binding injects MOONNAV_INTERNAL_API_URL at runtime.
    base = os.environ.get("MOONNAV_INTERNAL_API_URL", BASE).rstrip("/")
    return httpx.Client(base_url=base, headers={"Authorization": f"Bearer {TOKEN}", "x-worker-id": WORKER_ID}, timeout=30)


def _beat(c: httpx.Client, job_id: str, lease: str, progress: float | None, stage: str | None) -> bool:
    """Send one heartbeat; returns False when the lease is lost or the job was cancelled."""
    try:
        r = c.post(f"/api/internal/jobs/{job_id}/heartbeat", json={"leaseToken": lease, "progress": progress, "stage": stage})
        if r.status_code == 409:
            log.warning("lease lost for %s", job_id)
            return False
        return True
    except httpx.HTTPError as exc:
        log.warning("heartbeat failed: %s", exc)
        return True  # transient backend hiccup: keep computing, the lease has headroom


def process_one(c: httpx.Client) -> bool:
    r = c.post("/api/internal/jobs/claim", json={"workerId": WORKER_ID})
    if r.status_code == 204:
        return False
    r.raise_for_status()
    job: dict[str, Any] = r.json()
    job_id, lease = job["jobId"], job["leaseToken"]
    log.info("claimed job %s (attempt %s)", job_id, job.get("attempt"))

    stop = threading.Event()
    last: dict[str, float | str] = {"progress": 0.0, "stage": "leased"}
    lock = threading.Lock()

    def heartbeat_loop() -> None:
        while not stop.wait(HEARTBEAT_S):
            with lock:
                progress_f = float(last["progress"])
                stage_s = str(last["stage"])
            if not _beat(c, job_id, lease, progress_f, stage_s):
                return

    def progress_cb(stage: str, fraction: float) -> None:
        with lock:
            last["progress"], last["stage"] = fraction, stage
        _beat(c, job_id, lease, fraction, stage)

    hb = threading.Thread(target=heartbeat_loop, daemon=True)
    hb.start()
    t0 = time.time()
    try:
        result = run_analysis(Scenario.from_dict(job["scenario"]), progress=progress_cb)
        result["computeSeconds"] = round(time.time() - t0, 3)
        result["workerId"] = WORKER_ID
        stop.set()
        with lock:
            last["progress"], last["stage"] = 0.95, "uploading_result"
        _beat(c, job_id, lease, 0.95, "uploading_result")
        resp = c.post(f"/api/internal/jobs/{job_id}/complete", json={"leaseToken": lease, "result": result}, timeout=120)
        resp.raise_for_status()
        log.info("completed job %s in %.2fs", job_id, time.time() - t0)
    except AnalysisInputError as exc:
        stop.set()
        c.post(
            f"/api/internal/jobs/{job_id}/fail",
            json={"leaseToken": lease, "retryable": False, "code": "invalid_input", "message": str(exc), "field": exc.field},
        )
    except Exception as exc:  # report a retryable failure, never a stack trace
        stop.set()
        log.exception("job %s failed", job_id)
        c.post(
            f"/api/internal/jobs/{job_id}/fail",
            json={"leaseToken": lease, "retryable": True, "code": "compute_error", "message": type(exc).__name__},
        )
    finally:
        stop.set()
    return True


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not TOKEN:
        raise SystemExit("SCIENCE_SERVICE_TOKEN is required")
    log.info("worker %s polling %s", WORKER_ID, BASE)
    backoff = POLL_S
    with _client() as c:
        while True:
            try:
                worked = process_one(c)
                backoff = POLL_S
                if not worked:
                    time.sleep(POLL_S)
            except httpx.HTTPError as exc:
                log.warning("backend unavailable (%s); retrying in %.0fs", exc, backoff)
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)


if __name__ == "__main__":
    main()
