"""
services/logging_service.py
---------------------------
Centralized logging service for the AI Feedback Analyzer API.

- Writes every API request to logs/api_logs.log (JSON Lines, rotating).
- Writes every failed request to logs/error_logs.log (JSON Lines, rotating).
- Provides aggregation helpers consumed by the /api/logs/* monitoring endpoints.
"""

import logging
import os
import json
import traceback
from datetime import datetime, timedelta
from logging.handlers import RotatingFileHandler
from collections import defaultdict

# ----------------------------------------
# Log file paths
# ----------------------------------------
LOG_DIR = "logs"
API_LOG_FILE = os.path.join(LOG_DIR, "api_logs.log")
ERROR_LOG_FILE = os.path.join(LOG_DIR, "error_logs.log")

os.makedirs(LOG_DIR, exist_ok=True)


# ----------------------------------------
# Logger setup helpers
# ----------------------------------------
def _setup_logger(name: str, log_file: str, level: int = logging.INFO) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger  # Already configured — avoid duplicate handlers on hot reload
    logger.setLevel(level)
    handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,   # 10 MB per file
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.propagate = False
    return logger


_api_logger = _setup_logger("api_logger", API_LOG_FILE)
_error_logger = _setup_logger("error_logger", ERROR_LOG_FILE, level=logging.ERROR)


# ----------------------------------------
# Public logging function (called by middleware)
# ----------------------------------------
def log_api_request(
    method: str,
    endpoint: str,
    payload: dict,
    query_params: dict,
    status_code: int,
    response_time_ms: float,
    success: bool,
    error_msg: str = None,
    stack_trace: str = None,
) -> None:
    """Append one JSON-Lines entry to the API log (and optionally the error log)."""
    entry = {
        "timestamp": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "method": method,
        "endpoint": endpoint,
        "payload": payload or {},
        "query_params": query_params or {},
        "status_code": status_code,
        "response_time_ms": round(response_time_ms, 2),
        "success": success,
        "error": error_msg or "",
        "stack_trace": stack_trace or "",
    }
    line = json.dumps(entry)
    _api_logger.info(line)
    if not success:
        _error_logger.error(line)


def log_exception(
    method: str,
    endpoint: str,
    exc: Exception,
    query_params: dict = None,
    payload: dict = None,
    response_time_ms: float = 0,
) -> None:
    """Capture full exception details including stack trace to the error log."""
    log_api_request(
        method=method,
        endpoint=endpoint,
        payload=payload or {},
        query_params=query_params or {},
        status_code=500,
        response_time_ms=response_time_ms,
        success=False,
        error_msg=f"{type(exc).__name__}: {str(exc)}",
        stack_trace=traceback.format_exc(),
    )


# ----------------------------------------
# Internal file-reading helper
# ----------------------------------------
def _matches_date(entry: dict, date_filter: str) -> bool:
    """Return True if entry timestamp matches YYYY-MM-DD filter."""
    if not date_filter:
        return True
    ts = entry.get("timestamp", "")
    return ts.startswith(date_filter)


def _filter_entries(entries: list, date_filter: str = "", endpoint_filter: str = "", status_filter: str = "") -> list:
    """Apply optional date, endpoint substring, and status code filters."""
    result = []
    for e in entries:
        if not _matches_date(e, date_filter):
            continue
        if endpoint_filter and endpoint_filter.lower() not in e.get("endpoint", "").lower():
            continue
        if status_filter:
            try:
                if e.get("status_code") != int(status_filter):
                    continue
            except ValueError:
                pass
        result.append(e)
    return result


def _read_log_entries(log_file: str, max_lines: int = 5000) -> list:
    """Read and parse up to max_lines JSON entries from a log file."""
    if not os.path.exists(log_file):
        return []
    try:
        with open(log_file, "r", encoding="utf-8") as f:
            raw = f.readlines()
        raw = raw[-max_lines:]
        entries = []
        for line in raw:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
        return entries
    except Exception:
        return []


# ----------------------------------------
# Aggregation helpers (used by API endpoints)
# ----------------------------------------
def get_logs_stats(
    date_filter: str = "",
    endpoint_filter: str = "",
    status_filter: str = "",
) -> dict:
    """Return high-level KPI metrics aggregated over filtered requests."""
    entries = _filter_entries(
        _read_log_entries(API_LOG_FILE),
        date_filter=date_filter,
        endpoint_filter=endpoint_filter,
        status_filter=status_filter,
    )
    total = len(entries)
    successful = sum(1 for e in entries if e.get("success", False))
    failed = total - successful
    success_rate = round(successful / total * 100, 1) if total > 0 else 0.0
    times = [e.get("response_time_ms", 0) for e in entries]
    avg_time = round(sum(times) / len(times), 2) if times else 0.0
    return {
        "total_requests": total,
        "successful": successful,
        "failed": failed,
        "success_rate": success_rate,
        "avg_response_time_ms": avg_time,
    }


def get_recent_requests(
    limit: int = 50,
    endpoint_filter: str = "",
    status_filter: str = "",
    date_filter: str = "",
) -> list:
    """Return the most recent requests, optionally filtered."""
    entries = _filter_entries(
        _read_log_entries(API_LOG_FILE),
        date_filter=date_filter,
        endpoint_filter=endpoint_filter,
        status_filter=status_filter,
    )
    return list(reversed(entries))[:limit]


def get_error_logs(
    limit: int = 20,
    date_filter: str = "",
    endpoint_filter: str = "",
) -> list:
    """Return the most recent failed requests from the error log."""
    entries = _filter_entries(
        _read_log_entries(ERROR_LOG_FILE),
        date_filter=date_filter,
        endpoint_filter=endpoint_filter,
    )
    return list(reversed(entries))[:limit]


def get_timeline(
    hours: int = 24,
    date_filter: str = "",
    endpoint_filter: str = "",
    status_filter: str = "",
) -> list:
    """Group request counts and avg response time by hour for the last N hours."""
    entries = _filter_entries(
        _read_log_entries(API_LOG_FILE),
        date_filter=date_filter,
        endpoint_filter=endpoint_filter,
        status_filter=status_filter,
    )
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    buckets: dict = defaultdict(
        lambda: {"total": 0, "success": 0, "failed": 0, "total_time": 0.0}
    )

    for e in entries:
        try:
            ts = datetime.strptime(e["timestamp"], "%Y-%m-%dT%H:%M:%SZ")
            if ts < cutoff:
                continue
            key = ts.strftime("%H:00")
            buckets[key]["total"] += 1
            if e.get("success"):
                buckets[key]["success"] += 1
            else:
                buckets[key]["failed"] += 1
            buckets[key]["total_time"] += e.get("response_time_ms", 0)
        except Exception:
            pass

    now = datetime.utcnow()
    result = []
    for i in range(hours - 1, -1, -1):
        key = (now - timedelta(hours=i)).strftime("%H:00")
        b = buckets.get(key, {"total": 0, "success": 0, "failed": 0, "total_time": 0.0})
        result.append({
            "hour": key,
            "total": b["total"],
            "success": b["success"],
            "failed": b["failed"],
            "avg_time": round(b["total_time"] / b["total"], 1) if b["total"] > 0 else 0,
        })
    return result


def get_endpoint_stats(
    limit: int = 10,
    date_filter: str = "",
    endpoint_filter: str = "",
    status_filter: str = "",
) -> list:
    """Return per-endpoint aggregated stats sorted by request count descending."""
    entries = _filter_entries(
        _read_log_entries(API_LOG_FILE),
        date_filter=date_filter,
        endpoint_filter=endpoint_filter,
        status_filter=status_filter,
    )
    stats: dict = defaultdict(lambda: {"count": 0, "success": 0, "total_time": 0.0})

    for e in entries:
        ep = e.get("endpoint", "unknown")
        stats[ep]["count"] += 1
        if e.get("success"):
            stats[ep]["success"] += 1
        stats[ep]["total_time"] += e.get("response_time_ms", 0)

    result = []
    for endpoint, data in stats.items():
        cnt = data["count"]
        result.append({
            "endpoint": endpoint,
            "count": cnt,
            "success_rate": round(data["success"] / cnt * 100, 1) if cnt > 0 else 0.0,
            "avg_time_ms": round(data["total_time"] / cnt, 1) if cnt > 0 else 0.0,
        })

    result.sort(key=lambda x: x["count"], reverse=True)
    return result[:limit]


def get_slowest_endpoints(
    limit: int = 10,
    date_filter: str = "",
    endpoint_filter: str = "",
    status_filter: str = "",
) -> list:
    """Return endpoints sorted by average response time descending."""
    stats = get_endpoint_stats(
        limit=1000,
        date_filter=date_filter,
        endpoint_filter=endpoint_filter,
        status_filter=status_filter,
    )
    stats.sort(key=lambda x: x["avg_time_ms"], reverse=True)
    return stats[:limit]


def get_available_endpoints() -> list:
    """Return distinct endpoint paths seen in the API log."""
    entries = _read_log_entries(API_LOG_FILE)
    endpoints = sorted({e.get("endpoint", "unknown") for e in entries})
    return endpoints
