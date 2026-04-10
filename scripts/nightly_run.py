#!/usr/bin/env python3
"""
AI Planner — Nightly Run Script (Supabase + Multi-User)
Runs at 8 PM Melbourne time. Iterates ALL users with setup_completed=true.
Uses each user's individual Google/Canvas tokens but the shared server-side Anthropic key.
"""

import os
import json
import requests
from datetime import datetime, timedelta
import pytz

# Config
BASE_URL = os.environ.get("NEXTAUTH_URL", "http://localhost:3000")
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MELBOURNE_TZ = pytz.timezone("Australia/Melbourne")

# Supabase headers
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}


def log(msg):
    print(f"[{datetime.now(MELBOURNE_TZ).strftime('%H:%M:%S')}] {msg}")


def sb_get(table, params=""):
    """GET from Supabase REST API."""
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{params}", headers=SB_HEADERS, timeout=30)
    return r.json() if r.ok else []


def sb_upsert(table, data):
    """UPSERT to Supabase REST API."""
    headers = {**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
    r = requests.post(f"{SUPABASE_URL}/rest/v1/{table}", headers=headers, json=data, timeout=30)
    return r.ok


def get_all_users():
    return sb_get("users", "setup_completed=eq.true&select=id,email,name")


def get_user_settings(user_id):
    rows = sb_get("user_settings", f"user_id=eq.{user_id}&select=*")
    return rows[0] if rows else {}


def get_cached_data(table, user_id, data_field="data"):
    rows = sb_get(table, f"user_id=eq.{user_id}&select={data_field},fetched_at&limit=1")
    if rows and rows[0].get(data_field):
        return rows[0]
    return None


def is_fresh(fetched_at_str, max_hours=24):
    """Check if cached data is less than max_hours old."""
    if not fetched_at_str:
        return False
    try:
        fetched = datetime.fromisoformat(fetched_at_str.replace("Z", "+00:00"))
        return (datetime.now(pytz.utc) - fetched).total_seconds() < max_hours * 3600
    except (ValueError, TypeError):
        return False


def send_email(to_email, subject, html_body):
    if not SENDGRID_API_KEY or not FROM_EMAIL or not to_email:
        log(f"   Skipping email (not configured): {subject}")
        return False
    try:
        r = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {SENDGRID_API_KEY}", "Content-Type": "application/json"},
            json={
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {"email": FROM_EMAIL, "name": "AI Planner"},
                "subject": subject,
                "content": [{"type": "text/html", "value": html_body}],
            },
            timeout=30,
        )
        if r.status_code in (200, 201, 202):
            log(f"   Email sent: {subject}")
            return True
        log(f"   Email failed ({r.status_code})")
        return False
    except Exception as e:
        log(f"   Email error: {e}")
        return False


def email_style():
    return """
    <style>
      body { font-family: 'Segoe UI', system-ui, sans-serif; background: #060608; color: #e8e6e1; margin: 0; padding: 20px; }
      .container { max-width: 600px; margin: 0 auto; }
      .header { background: linear-gradient(135deg, #0a7a6d, #0d9b8a); padding: 20px 24px; border-radius: 14px 14px 0 0; }
      .header h1 { margin: 0; font-size: 20px; color: white; }
      .header p { margin: 4px 0 0; font-size: 12px; color: rgba(255,255,255,0.7); }
      .body { background: #0f0f14; border: 1px solid rgba(255,255,255,0.06); border-top: none; border-radius: 0 0 14px 14px; padding: 20px 24px; }
      .day { margin-bottom: 16px; }
      .day-title { font-size: 14px; font-weight: 600; color: #0d9b8a; margin-bottom: 6px; }
      .event { padding: 4px 0; font-size: 12px; color: #a09d95; }
      .deadline { padding: 6px 12px; background: rgba(229,77,77,0.08); border-left: 3px solid #e54d4d; border-radius: 0 6px 6px 0; font-size: 11px; color: #e54d4d; font-weight: 600; margin: 4px 0; }
      .task { padding: 8px 12px; background: #131318; border-left: 3px solid #0d9b8a; border-radius: 0 8px 8px 0; margin: 4px 0; }
      .task-name { font-size: 13px; font-weight: 600; color: #e8e6e1; }
      .task-time { font-size: 10px; color: #5e5c56; }
      .carried { font-size: 9px; background: rgba(232,123,53,0.12); color: #e87b35; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
      .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .stat { background: #131318; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px; text-align: center; }
      .stat-value { font-size: 22px; font-weight: 700; color: #e8e6e1; }
      .stat-label { font-size: 10px; color: #5e5c56; margin-top: 2px; }
      .footer { text-align: center; font-size: 10px; color: #5e5c56; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
      .section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #0d9b8a; margin: 14px 0 8px; }
    </style>
    """


def build_briefing_email(briefing, to_email=""):
    now = datetime.now(MELBOURNE_TZ)
    end = now + timedelta(days=7)
    date_range = f"{now.strftime('%d %b')} - {end.strftime('%d %b %Y')}"
    days_html = ""
    for day in (briefing.get("days") or []):
        days_html += f'<div class="day"><div class="day-title">{day.get("day_label", "")}</div>'
        for dl in day.get("deadlines", []):
            days_html += f'<div class="deadline">{dl}</div>'
        for ev in day.get("events", []):
            days_html += f'<div class="event">{ev.get("time", "")} - {ev.get("title", "")}</div>'
        days_html += "</div>"
    return f"""<!DOCTYPE html><html><head>{email_style()}</head><body>
    <div class="container">
      <div class="header"><h1>Your Week Ahead</h1><p>{date_range}</p></div>
      <div class="body">
        <div style="font-size:13px;color:#e8e6e1;line-height:1.7;margin-bottom:14px;">{briefing.get('summary', '')}</div>
        {days_html}
        <div class="footer">AI Planner | <a href="{BASE_URL}/api/unsubscribe?email={to_email}&type=all" style="color:#5e5c56;">Unsubscribe</a></div>
      </div>
    </div></body></html>"""


def build_todo_email(todo, to_email=""):
    now = datetime.now(MELBOURNE_TZ)
    tomorrow = now + timedelta(days=1)
    tasks_html = ""
    for t in (todo.get("timeline") or []):
        carried = '<span class="carried">CARRIED</span> ' if t.get("carried_over") else ""
        tasks_html += f'<div class="task"><div class="task-time">{t.get("start_time", "")} - {t.get("end_time", "")}</div><div class="task-name">{carried}{t.get("task_name", "")}</div></div>'
    return f"""<!DOCTYPE html><html><head>{email_style()}</head><body>
    <div class="container">
      <div class="header"><h1>Tomorrow's Plan</h1><p>{tomorrow.strftime('%A, %d %B')}</p></div>
      <div class="body">{tasks_html}<div class="footer">AI Planner | <a href="{BASE_URL}/api/unsubscribe?email={to_email}&type=all" style="color:#5e5c56;">Unsubscribe</a></div></div>
    </div></body></html>"""


def build_weekly_email(progress, reflection, to_email=""):
    return f"""<!DOCTYPE html><html><head>{email_style()}</head><body>
    <div class="container">
      <div class="header"><h1>Week in Review</h1><p>{progress.get('week_start', '')} - {progress.get('week_end', '')}</p></div>
      <div class="body">
        <div class="stat-grid">
          <div class="stat"><div class="stat-value">{progress.get('tasks_completed', 0)}/{progress.get('tasks_planned', 0)}</div><div class="stat-label">Tasks ({progress.get('completion_rate', 0)}%)</div></div>
          <div class="stat"><div class="stat-value">{progress.get('study_hours', 0)}h</div><div class="stat-label">Study Hours</div></div>
        </div>
        {f'<div class="section-title">AI Reflection</div><div style="font-size:13px;color:#e8e6e1;line-height:1.8;">{reflection}</div>' if reflection else ''}
        <div class="footer">AI Planner | <a href="{BASE_URL}/api/unsubscribe?email={to_email}&type=all" style="color:#5e5c56;">Unsubscribe</a></div>
      </div>
    </div></body></html>"""


def process_user(user):
    user_id = user["id"]
    email = user["email"]
    name = user.get("name") or email
    log(f"--- Processing: {name} ({email}) ---")

    settings = get_user_settings(user_id)

    # Get cached briefing (check freshness)
    briefing_cache = get_cached_data("briefings", user_id, "briefing")
    briefing = None
    if briefing_cache and is_fresh(briefing_cache.get("created_at"), 24):
        briefing = briefing_cache.get("briefing")
    else:
        log("   Briefing is stale or missing, skipping email")

    # Get cached todo (check freshness)
    todo_cache = get_cached_data("todos", user_id, "todo")
    todo = None
    if todo_cache and is_fresh(todo_cache.get("created_at"), 24):
        todo = todo_cache.get("todo")
    else:
        log("   To-do is stale or missing, skipping email")

    # Send emails based on settings
    now = datetime.now(MELBOURNE_TZ)

    if settings.get("email_briefing", True) and briefing:
        end = now + timedelta(days=7)
        send_email(email, f"Your Week Ahead: {now.strftime('%d %b')} - {end.strftime('%d %b')}", build_briefing_email(briefing, email))

    if settings.get("email_todo", True) and todo:
        tomorrow = now + timedelta(days=1)
        send_email(email, f"Tomorrow's Plan: {tomorrow.strftime('%A, %d %b')}", build_todo_email(todo, email))

    # Sunday weekly summary
    if now.weekday() == 6 and settings.get("email_weekly", True):
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

            # Get completion count from Supabase
            completions = sb_get(
                "task_completions",
                f"user_id=eq.{user_id}&date=gte.{(now - timedelta(days=7)).strftime('%Y-%m-%d')}&action=eq.completed&select=id"
            )
            count = len(completions) if completions else 0

            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=512,
                system=f"Write a brief, encouraging weekly reflection for {name}. 3-4 sentences.",
                messages=[{"role": "user", "content": f"Tasks completed this week: {count}. Write a reflection."}],
            )
            reflection = response.content[0].text if response.content else ""

            week_start = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")
            progress = {"tasks_completed": count, "tasks_planned": 0, "completion_rate": 0, "study_hours": 0, "week_start": week_start, "week_end": now.strftime("%Y-%m-%d")}

            sb_upsert("progress_weekly", [{
                "user_id": user_id,
                "week_start": week_start,
                "data": {**progress, "ai_reflection": reflection},
            }])

            send_email(email, f"Week in Review: {week_start} - {now.strftime('%Y-%m-%d')}", build_weekly_email(progress, reflection, email))
        except Exception as e:
            log(f"   Weekly summary error: {e}")

    log(f"   Done: {name}")


def main():
    log("=" * 50)
    log("AI Planner — Nightly Run (Supabase)")
    log("=" * 50)

    if not SUPABASE_URL or not SUPABASE_KEY:
        log("ERROR: Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.")
        return

    users = get_all_users()
    log(f"Found {len(users)} active users")

    if not users:
        log("No users to process. Exiting.")
        return

    for user in users:
        try:
            process_user(user)
        except Exception as e:
            log(f"ERROR processing {user.get('email', '?')}: {e}")

    # Cleanup old data
    log("Running cleanup...")
    try:
        headers = {**SB_HEADERS}
        requests.post(f"{SUPABASE_URL}/rest/v1/rpc/cleanup_old_data", headers=headers, json={}, timeout=30)
        log("   Cleanup done")
    except Exception as e:
        log(f"   Cleanup error: {e}")

    log(f"\nNightly run complete! Processed {len(users)} users.")


if __name__ == "__main__":
    main()
