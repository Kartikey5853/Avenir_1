"""
Provider comparison test script.

Tests each of the 4 providers individually for the same lat/lon,
then runs the race to show which would win.

Usage:
    cd backend
    python test_providers.py
or:
    python test_providers.py --lat 17.4483 --lon 78.3915 --category hospitals
"""

from __future__ import annotations
import asyncio
import argparse
import json
import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("DATABASE_URL", "sqlite:///./app.db")
os.environ.setdefault("SECRET_KEY", "test")
os.environ.setdefault("SMTP_SERVER", "localhost")
os.environ.setdefault("SMTP_USER", "test@test.com")
os.environ.setdefault("SMTP_PASSWORD", "test")
os.environ.setdefault("SMTP_PORT", "587")

import httpx
from app.config import settings
from app.services.location_service import (
    MAPBOX_TOKEN, LOCATIONIQ_KEY, GEOAPIFY_KEY,
    _mapbox_url, _locationiq_url, _geoapify_url,
    _parse_mapbox, _parse_locationiq, _parse_geoapify,
    _race_providers, ALL_CATEGORIES,
)
from app.services.overpass_service import _category_query, _race_query, _parse_locations


TIMEOUT = 15.0  # generous timeout for testing


async def test_single_provider(name: str, url: str, parser, category: str) -> dict:
    """Test one provider and return timing + count."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(url, timeout=TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        locations = parser(data, category)
        elapsed = time.monotonic() - start
        return {
            "provider": name, "status": "✓", "count": len(locations),
            "elapsed": round(elapsed, 2),
            "sample": locations[:2] if locations else [],
        }
    except Exception as exc:
        elapsed = time.monotonic() - start
        return {
            "provider": name, "status": "✗", "count": 0,
            "elapsed": round(elapsed, 2), "error": str(exc)[:100],
        }


async def test_overpass(category: str, lat: float, lon: float, radius: int) -> dict:
    """Test Overpass provider."""
    start = time.monotonic()
    try:
        q = _category_query(category, lat, lon, radius)
        data = await _race_query(q, timeout=TIMEOUT)
        locations = _parse_locations(data, category)
        elapsed = time.monotonic() - start
        return {
            "provider": "Overpass", "status": "✓", "count": len(locations),
            "elapsed": round(elapsed, 2),
            "sample": locations[:2] if locations else [],
        }
    except Exception as exc:
        elapsed = time.monotonic() - start
        return {
            "provider": "Overpass", "status": "✗", "count": 0,
            "elapsed": round(elapsed, 2), "error": str(exc)[:100],
        }


async def run_tests(lat: float, lon: float, radius: int, category: str):
    print(f"\n{'='*60}")
    print(f"  Provider Test — {category.upper()}")
    print(f"  Location: {lat}, {lon}  |  Radius: {radius}m")
    print(f"{'='*60}\n")

    # Print which keys are configured
    print("API Keys configured:")
    print(f"  Mapbox:     {'✓ ' + MAPBOX_TOKEN[:12] + '...' if MAPBOX_TOKEN   else '✗ not set'}")
    print(f"  LocationIQ: {'✓ ' + LOCATIONIQ_KEY[:8]  + '...' if LOCATIONIQ_KEY else '✗ not set'}")
    print(f"  Geoapify:   {'✓ ' + GEOAPIFY_KEY[:8]    + '...' if GEOAPIFY_KEY   else '✗ not set'}")
    print(f"  Overpass:   ✓ always available\n")

    # ── Run all 4 providers in parallel ────────────────────────────────────────
    tasks = []

    if MAPBOX_TOKEN:
        url = _mapbox_url(category, lat, lon, radius)
        tasks.append(test_single_provider("Mapbox", url, _parse_mapbox, category))
    else:
        tasks.append(asyncio.coroutine(lambda: {"provider": "Mapbox",    "status": "⊘ no key", "count": 0, "elapsed": 0})())

    if LOCATIONIQ_KEY:
        url = _locationiq_url(category, lat, lon, radius)
        tasks.append(test_single_provider("LocationIQ", url, _parse_locationiq, category))
    else:
        tasks.append(asyncio.coroutine(lambda: {"provider": "LocationIQ", "status": "⊘ no key", "count": 0, "elapsed": 0})())

    if GEOAPIFY_KEY:
        url = _geoapify_url(category, lat, lon, radius)
        tasks.append(test_single_provider("Geoapify", url, _parse_geoapify, category))
    else:
        tasks.append(asyncio.coroutine(lambda: {"provider": "Geoapify",   "status": "⊘ no key", "count": 0, "elapsed": 0})())

    tasks.append(test_overpass(category, lat, lon, radius))

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # ── Print results ──────────────────────────────────────────────────────────
    print(f"{'Provider':<14} {'Status':<14} {'Count':>6}  {'Time':>7}  Details")
    print("-" * 60)
    for r in results:
        if isinstance(r, Exception):
            print(f"  [ERROR] {r}")
            continue
        status = r.get("status", "?")
        count  = r.get("count", 0)
        elapsed = r.get("elapsed", 0)
        error  = r.get("error", "")
        sample = r.get("sample", [])
        sample_str = sample[0].get("name", "") if sample else ""
        print(f"  {r['provider']:<12} {status:<14} {count:>6}  {elapsed:>6.2f}s  {error or sample_str}")

    # ── Race ──────────────────────────────────────────────────────────────────
    print(f"\n{'─'*60}")
    print("  Running RACE (all providers simultaneously, first wins)...")
    race_start = time.monotonic()
    winner_locs = await _race_providers(category, lat, lon, radius)
    race_elapsed = time.monotonic() - race_start
    print(f"  Race completed in {race_elapsed:.2f}s — {len(winner_locs)} location(s) returned")
    if winner_locs:
        print(f"  Sample: {winner_locs[0]}")

    print(f"\n{'='*60}\n")


async def run_all_categories(lat: float, lon: float, radius: int):
    """Run race for all 13 categories and print a summary."""
    print(f"\n{'='*60}")
    print(f"  ALL CATEGORIES RACE TEST")
    print(f"  Location: {lat}, {lon}  |  Radius: {radius}m")
    print(f"{'='*60}\n")

    async def race_one(cat: str) -> tuple[str, int]:
        locs = await _race_providers(cat, lat, lon, radius)
        return cat, len(locs)

    start = time.monotonic()
    results = await asyncio.gather(*[race_one(cat) for cat in ALL_CATEGORIES])
    total_elapsed = time.monotonic() - start

    print(f"{'Category':<20} {'Count':>6}")
    print("-" * 30)
    total = 0
    for cat, count in sorted(results, key=lambda x: x[1], reverse=True):
        print(f"  {cat:<18} {count:>6}")
        total += count
    print("-" * 30)
    print(f"  {'TOTAL':<18} {total:>6}")
    print(f"\n  Completed in {total_elapsed:.2f}s (all categories in parallel)\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test map providers")
    parser.add_argument("--lat",      type=float, default=17.4483, help="Latitude (default: Madhapur)")
    parser.add_argument("--lon",      type=float, default=78.3915, help="Longitude (default: Madhapur)")
    parser.add_argument("--radius",   type=int,   default=2000,    help="Radius in metres")
    parser.add_argument("--category", type=str,   default=None,    help=f"Category to test (default: all). Choices: {ALL_CATEGORIES}")
    parser.add_argument("--all",      action="store_true",         help="Test all categories in race mode")
    args = parser.parse_args()

    if args.all or args.category is None:
        asyncio.run(run_all_categories(args.lat, args.lon, args.radius))
    else:
        if args.category not in ALL_CATEGORIES:
            print(f"Unknown category '{args.category}'. Choose from: {ALL_CATEGORIES}")
            sys.exit(1)
        asyncio.run(run_tests(args.lat, args.lon, args.radius, args.category))
