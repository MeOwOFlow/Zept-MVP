"""凝时 Zept · Dogfood 完整用户流程

走通：Welcome → Onboarding → Session(preAssess→running→postAssess→insight)
      → Insights → Settings(切换风格/导出/清空)
      截图每一步，捕捉 console 错误与可见 bug。
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT = Path(__file__).parent / "shots"
OUT.mkdir(exist_ok=True)
BUGS = []


def shot(page, name: str):
    p = OUT / f"{name}.png"
    page.screenshot(path=str(p), full_page=True)
    print(f"  📸 {p.name}")


def bug(tag: str, msg: str):
    BUGS.append({"tag": tag, "msg": msg})
    print(f"  🐛 [{tag}] {msg}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},  # iPhone 14 viewport
            device_scale_factor=2,
        )
        page = ctx.new_page()

        console_errors = []
        not_found = []
        page.on("console", lambda m: (
            console_errors.append(f"{m.type}: {m.text}")
            if m.type in ("error", "warning") else None
        ))
        page.on("pageerror", lambda e: console_errors.append(f"pageerror: {e}"))
        page.on("response", lambda r: (
            not_found.append(f"{r.status} {r.url}")
            if r.status >= 400 else None
        ))

        # ---------- 1. Welcome 三屏 ----------
        print("\n[1/9] Welcome")
        page.goto("http://localhost:5173/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)  # 等 React 渲染
        shot(page, "01_welcome_slide1")

        # 点"下一步"两次 → 第三屏
        page.get_by_role("button", name="下一步").click()
        page.wait_for_timeout(400)
        shot(page, "02_welcome_slide2")
        page.get_by_role("button", name="下一步").click()
        page.wait_for_timeout(400)
        shot(page, "03_welcome_slide3")

        # 点"开始" → onboarding
        page.get_by_role("button", name="开始").click()
        page.wait_for_timeout(500)
        shot(page, "04_onboarding_empty")

        # ---------- 2. Onboarding ----------
        print("\n[2/9] Onboarding")
        page.get_by_label("你的目标").fill("考研")
        page.wait_for_timeout(200)

        # 选日期：点 trigger → 今天 → 确定
        page.get_by_role("button", name="请选择日期").click()
        page.wait_for_timeout(400)
        shot(page, "05_datepicker_open")
        page.get_by_role("button", name="今天").click()
        page.wait_for_timeout(200)
        page.get_by_role("button", name="确定").click()
        page.wait_for_timeout(300)

        # 选几个分心 chip
        for label in ["手机", "焦虑"]:
            page.get_by_role("button", name=label, exact=True).click()
            page.wait_for_timeout(100)

        # 选回复风格 = 陪伴派
        page.get_by_role("button", name="陪伴派").click()
        page.wait_for_timeout(200)
        shot(page, "06_onboarding_filled")

        # 提交
        page.get_by_role("button", name="开始专注").click()
        page.wait_for_timeout(800)
        shot(page, "07_session_idle")

        # ---------- 3. Session idle ----------
        print("\n[3/9] Session idle")
        # 验证 badge / 预设 / stepper
        badge_text = page.locator(".zept-session__badge").text_content()
        print(f"  badge: {badge_text}")
        if not badge_text or "考试" not in badge_text:
            bug("badge", f"倒计时 badge 异常: {badge_text}")

        # ---------- 4. preAssess ----------
        print("\n[4/9] preAssess")
        # 改用最短番茄配置：stepper 把专注调成 1 分钟
        # 找"专注"行的 stepper [- N +]，点 [-] 直到 1
        focus_stepper = page.locator(".zept-stepper-row").filter(has_text="专注")
        minus_btn = focus_stepper.get_by_role("button", name="专注时长 减少")
        # 当前 25 → 1，需点 24 次，但最大值减到 1 立即 disabled
        for _ in range(25):
            try:
                minus_btn.click(timeout=500)
                page.wait_for_timeout(50)
            except Exception:
                break
        page.wait_for_timeout(300)
        shot(page, "08_session_focus_1min")

        # 短休也设 1
        break_stepper = page.locator(".zept-stepper-row").filter(has_text="短休")
        b_minus = break_stepper.get_by_role("button", name="短休时长 减少")
        for _ in range(10):
            try:
                b_minus.click(timeout=500)
                page.wait_for_timeout(50)
            except Exception:
                break
        page.wait_for_timeout(300)

        # 轮次设 1
        cycle_stepper = page.locator(".zept-stepper-row").filter(has_text="轮次")
        c_minus = cycle_stepper.get_by_role("button", name="轮次 减少")
        for _ in range(5):
            try:
                c_minus.click(timeout=500)
                page.wait_for_timeout(50)
            except Exception:
                break
        page.wait_for_timeout(300)
        shot(page, "09_session_short_config")

        # 点"开始专注"
        page.get_by_role("button", name="开始专注").click()
        page.wait_for_timeout(500)
        shot(page, "10_preassess")

        # preAssess：滑情绪到 3（默认就是 3，跳过）
        page.get_by_role("button", name="开始").click()
        page.wait_for_timeout(500)
        shot(page, "11_running")

        # ---------- 5. running ----------
        print("\n[5/9] running — 等待 1 分钟番茄结束")
        countdown = page.locator(".zept-session__countdown").text_content()
        print(f"  countdown: {countdown}")
        if not countdown or ":" not in countdown:
            bug("countdown", f"倒计时显示异常: {countdown}")

        mode_label = page.locator(".zept-session__mode-label").text_content()
        print(f"  mode: {mode_label}")

        # 测试暂停/继续
        page.get_by_role("button", name="暂停").click()
        page.wait_for_timeout(300)
        shot(page, "12_paused")
        page.get_by_role("button", name="继续").click()
        page.wait_for_timeout(300)

        # 主动结束（不等 1 分钟）
        page.get_by_role("button", name="结束").click()
        page.wait_for_timeout(300)
        shot(page, "13_confirm_end")
        page.get_by_role("button", name="确认").click()
        page.wait_for_timeout(500)
        shot(page, "14_postassess")

        # ---------- 6. postAssess ----------
        print("\n[6/9] postAssess")
        # 把情绪拉到 2，触发关怀门
        mood_2 = page.locator(".zept-slider").first.get_by_role("button", name="2")
        mood_2.click()
        page.wait_for_timeout(200)
        # 专注 4
        focus_4 = page.locator(".zept-slider").nth(1).get_by_role("button", name="4")
        focus_4.click()
        page.wait_for_timeout(200)
        shot(page, "15_postassess_lowmood")

        page.get_by_role("button", name="提交").click()
        page.wait_for_timeout(3000)
        shot(page, "16_insight_or_caregate")

        # 检查是否触发关怀门（mood=2）
        care_h2 = page.locator("h2.zept-session__title").text_content()
        print(f"  insight title: {care_h2}")
        if care_h2 and "吃力" in care_h2:
            print("  ✅ 关怀门已触发")
            care_text = page.locator(".zept-session__care").text_content()
            print(f"  care: {care_text}")
            if not care_text or "12356" not in care_text:
                bug("care-hotline", "关怀门未含 12356 热线")
        else:
            bug("care-gate", f"mood=2 未触发关怀门，title={care_h2}")

        # 完成 → 回 idle
        page.get_by_role("button", name="完成").click()
        page.wait_for_timeout(800)
        shot(page, "17_back_to_idle")

        # ---------- 7. 再做一次正常会话，验证 Insights 列表 ----------
        print("\n[7/9] 第二次会话（情绪 4）")
        # 配置已保存为 1/1×1
        page.get_by_role("button", name="开始专注").click()
        page.wait_for_timeout(500)
        page.get_by_role("button", name="开始").click()
        page.wait_for_timeout(500)
        page.get_by_role("button", name="结束").click()
        page.wait_for_timeout(300)
        page.get_by_role("button", name="确认").click()
        page.wait_for_timeout(500)

        # 情绪 4 / 专注 4
        page.locator(".zept-slider").first.get_by_role("button", name="4").click()
        page.locator(".zept-slider").nth(1).get_by_role("button", name="4").click()
        page.wait_for_timeout(200)
        page.get_by_role("button", name="提交").click()
        page.wait_for_timeout(3000)
        shot(page, "18_second_insight")

        insight_text = page.locator(".zept-session__insight-text").text_content()
        print(f"  insight: {insight_text}")
        if insight_text:
            # 陪伴派不应直接罗列原始数字
            for raw in ["0次离开", "1次离开", "情绪4", "专注4", "情绪 4", "专注 4"]:
                if raw in insight_text:
                    bug("emotional-raw-data", f"陪伴派洞察含原始数字: '{raw}' in '{insight_text[:80]}'")
                    break

        # 反馈"有用"
        try:
            page.get_by_role("button", name="有用").click()
            page.wait_for_timeout(500)
            print("  ✅ 标记有用")
        except Exception:
            print("  ⚠ 反馈按钮可能未出现")

        page.get_by_role("button", name="完成").click()
        page.wait_for_timeout(500)

        # ---------- 8. Insights 列表 ----------
        print("\n[8/9] Insights 列表")
        page.get_by_role("link", name="洞察").click()
        page.wait_for_timeout(1000)
        shot(page, "19_insights_list")

        # 验证 MoodTrend 出现
        trend = page.locator(".zept-mood-trend")
        if trend.count() > 0:
            print("  ✅ MoodTrend 渲染")
        else:
            bug("mood-trend", "Insights 页未渲染 MoodTrend 组件")

        # 展开第一条
        first_card = page.locator(".zept-insights__header").first
        first_card.click()
        page.wait_for_timeout(500)
        shot(page, "20_insights_expanded")

        # ---------- 9. Settings 全套 ----------
        print("\n[9/9] Settings")
        page.get_by_role("link", name="设置").click()
        page.wait_for_timeout(800)
        shot(page, "21_settings_default")

        # 切到数据派
        page.get_by_role("button", name="数据派").click()
        page.wait_for_timeout(300)
        # 切回陪伴派
        page.get_by_role("button", name="陪伴派").click()
        page.wait_for_timeout(300)

        # 主题切换
        page.get_by_role("button", name="日间").click()
        page.wait_for_timeout(500)
        shot(page, "22_settings_light_theme")
        page.get_by_role("button", name="夜间").click()
        page.wait_for_timeout(500)

        # 展开合规
        page.get_by_role("button", name="合规声明").click()
        page.wait_for_timeout(500)
        shot(page, "23_compliance_expanded")
        # 收起
        page.get_by_role("button", name="合规声明").click()
        page.wait_for_timeout(300)

        # 导出 JSON
        with page.expect_download() as dl_info:
            page.get_by_role("button", name="导出 JSON").click()
        dl = dl_info.value
        export_path = OUT / "export.json"
        dl.save_as(str(export_path))
        print(f"  📦 导出 JSON: {export_path.name}")
        # 解析校验
        try:
            data = json.loads(export_path.read_text(encoding="utf-8"))
            print(f"     sessions={len(data.get('sessions', []))} insights={len(data.get('insights', []))}")
            if not data.get("user"):
                bug("export-user", "导出 JSON 缺失 user 字段")
        except Exception as e:
            bug("export-json", f"导出 JSON 解析失败: {e}")

        # 清空数据（二次确认）
        page.get_by_role("button", name="清空所有数据").click()
        page.wait_for_timeout(400)
        shot(page, "24_clear_confirm")
        page.get_by_role("button", name="确认清空").click()
        page.wait_for_timeout(1500)
        shot(page, "25_after_clear")

        # 应该跳回 onboarding
        url = page.url
        print(f"  跳转: {url}")
        if "/onboarding" not in url:
            bug("clear-redirect", f"清空后未跳 onboarding，url={url}")

        # ---------- console 错误 ----------
        print(f"\n[console] 共 {len(console_errors)} 条 error/warning")
        for e in console_errors[:20]:
            print(f"  ⚠ {e}")
        if console_errors:
            BUGS.append({"tag": "console", "msg": f"{len(console_errors)} 条 console 错误/警告"})

        print(f"\n[404] 共 {len(not_found)} 条 ≥400 响应")
        for n in not_found[:20]:
            print(f"  🚫 {n}")
        if not_found:
            BUGS.append({"tag": "http-4xx", "msg": "; ".join(not_found[:5])})

        browser.close()

    # ---------- 汇总 ----------
    print("\n" + "=" * 60)
    if not BUGS:
        print("✅ Dogfood 通过，未发现 bug")
    else:
        print(f"🐛 发现 {len(BUGS)} 个问题：")
        for i, b in enumerate(BUGS, 1):
            print(f"  {i}. [{b['tag']}] {b['msg']}")
    (OUT / "bugs.json").write_text(
        json.dumps(BUGS, ensure_ascii=False, indent=2), encoding="utf-8"
    )


if __name__ == "__main__":
    main()
