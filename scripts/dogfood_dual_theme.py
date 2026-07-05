"""Dogfood 双主题验证：light + dark 都跑一遍"""
import json
import sys
import traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

SHOTS_DIR = Path("scripts/shots")
SHOTS_DIR.mkdir(parents=True, exist_ok=True)
BUGS = []


def shot(page, name: str, theme: str):
    path = SHOTS_DIR / f"{theme}_{name}.png"
    page.screenshot(path=str(path), full_page=False)
    print(f"  shot {theme}/{name}", flush=True)


def run_theme(playwright, theme: str):
    print(f"\n=== Theme: {theme} ===", flush=True)

    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        color_scheme=theme,
    )
    page = context.new_page()

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    http_4xx = []
    page.on("response", lambda r: http_4xx.append(f"{r.status} {r.url}") if r.status >= 400 else None)

    try:
        page.goto("http://localhost:5173/", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(2000)

        shot(page, "01_welcome", theme)

        # 跳过 Welcome
        skip = page.locator("text=跳过")
        if skip.count() > 0:
            skip.first.click()
            page.wait_for_timeout(800)
        else:
            cta = page.locator("text=开始使用")
            if cta.count() > 0:
                cta.first.click()
                page.wait_for_timeout(800)

        shot(page, "02_onboarding", theme)

        # Settings
        page.goto("http://localhost:5173/settings", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)
        shot(page, "03_settings", theme)

        # 展开合规
        comp = page.locator("text=合规声明")
        if comp.count() > 0:
            comp.first.click()
            page.wait_for_timeout(800)
            shot(page, "04_compliance", theme)

        # Insights
        page.goto("http://localhost:5173/insights", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)
        shot(page, "05_insights", theme)

        # Session
        page.goto("http://localhost:5173/session", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)
        shot(page, "06_session", theme)

    except Exception as e:
        print(f"  ERROR in {theme}: {e}", flush=True)
        traceback.print_exc()
    finally:
        if console_errors:
            BUGS.append({"theme": theme, "type": "console", "items": console_errors[:5]})
        if http_4xx:
            BUGS.append({"theme": theme, "type": "http-4xx", "items": http_4xx[:5]})
        browser.close()


def main():
    try:
        with sync_playwright() as p:
            for theme in ["light", "dark"]:
                run_theme(p, theme)
    except Exception as e:
        print(f"FATAL: {e}", flush=True)
        traceback.print_exc()
        return

    with open(SHOTS_DIR / "bugs_dual.json", "w", encoding="utf-8") as f:
        json.dump(BUGS, f, ensure_ascii=False, indent=2)

    print(f"\nDone. Bugs: {len(BUGS)}", flush=True)
    for bug in BUGS:
        print(f"  [{bug['theme']}] {bug['type']}: {bug['items']}", flush=True)


if __name__ == "__main__":
    main()
