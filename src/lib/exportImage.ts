/**
 * @rn-status WEB-ONLY
 * 洞察长图导出：Canvas → PNG
 * lib 层，不依赖 React，为 RN 迁移预留（RN 可用 react-native-view-shot 替代）
 *
 * 品牌排版：
 * - 深夜蓝黑背景 #0E1014
 * - 三元色强调：暖琥珀 #F0B862 / 冷青灰 #9DB6DD / 珊瑚 #EA9E8E
 * - 思源宋体（标题）+ 思源黑体（正文）
 * - 底部水印"凝时 Zept"
 */

import type { Insight, SessionRecord } from "../types/session";

interface ExportParams {
  insight: Insight;
  session: SessionRecord;
  streakDays?: number;
  totalDurationSec?: number;
}

const W = 750;
const PADDING = 48;

export async function exportInsightImage(params: ExportParams): Promise<void> {
  const { insight, session, streakDays, totalDurationSec } = params;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = 0; // 动态计算
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  // 先计算高度
  const height = calculateHeight(ctx, insight, streakDays, totalDurationSec);
  canvas.height = height;

  // 绘制
  drawBackground(ctx, W, height);
  drawHeader(ctx, session);
  drawInsightText(ctx, insight, session);
  drawFooter(ctx, height, streakDays, totalDurationSec);

  // 导出
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create blob"));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date(session.startedAt).toISOString().slice(0, 10);
      a.download = `zept-insight-${date}.png`;
      a.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}

function calculateHeight(
  ctx: CanvasRenderingContext2D,
  insight: Insight,
  streakDays?: number,
  totalDurationSec?: number,
): number {
  let h = PADDING * 2; // 上下边距
  h += 60; // 顶部品牌
  h += 40; // 日期
  h += 30; // 分割线

  // 洞察文案（动态换行）
  ctx.font = "24px 'Noto Serif SC', serif";
  const lines = wrapText(ctx, insight.text, W - PADDING * 2);
  h += lines.length * 40 + 20;

  // 会话元数据
  h += 60;

  // 连续专注 / 累计时长
  if (streakDays || totalDurationSec) {
    h += 50;
  }

  h += 40; // 间距
  h += 80; // 底部水印
  return h;
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // 深夜蓝黑
  ctx.fillStyle = "#0E1014";
  ctx.fillRect(0, 0, w, h);

  // 极淡的顶部光晕（品牌感）
  const gradient = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, 400);
  gradient.addColorStop(0, "rgba(240, 184, 98, 0.06)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, 400);
}

function drawHeader(ctx: CanvasRenderingContext2D, session: SessionRecord): void {
  let y = PADDING + 30;

  // 品牌名
  ctx.fillStyle = "#F0B862";
  ctx.font = "bold 28px 'Noto Serif SC', serif";
  ctx.textAlign = "left";
  ctx.fillText("凝时 Zept", PADDING, y);

  // 日期
  y += 40;
  const date = new Date(session.startedAt).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  ctx.fillStyle = "#8B909A";
  ctx.font = "18px 'Noto Sans SC', sans-serif";
  ctx.fillText(date, PADDING, y);

  // 分割线
  y += 24;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PADDING, y);
  ctx.lineTo(W - PADDING, y);
  ctx.stroke();
}

function drawInsightText(
  ctx: CanvasRenderingContext2D,
  insight: Insight,
  _session: SessionRecord,
): void {
  let y = PADDING + 60 + 40 + 24 + 40;

  // 洞察文案
  ctx.fillStyle = "#F0F0F3";
  ctx.font = "24px 'Noto Serif SC', serif";
  ctx.textAlign = "left";

  const lines = wrapText(ctx, insight.text, W - PADDING * 2);
  for (const line of lines) {
    ctx.fillText(line, PADDING, y);
    y += 40;
  }
  y += 20;

  // 会话元数据
  const durationMin = Math.round(_session.actualDurationSec / 60);
  ctx.fillStyle = "#9DB6DD";
  ctx.font = "16px 'Noto Sans SC', sans-serif";
  ctx.fillText(
    `专注 ${durationMin} 分钟 · 离开 ${_session.interruptions} 次`,
    PADDING,
    y,
  );
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  height: number,
  streakDays?: number,
  totalDurationSec?: number,
): void {
  let y = height - PADDING - 80;

  // 连续专注 / 累计时长
  if (streakDays || totalDurationSec) {
    const parts: string[] = [];
    if (streakDays) parts.push(`连续专注 ${streakDays} 天`);
    if (totalDurationSec) {
      const hours = Math.round(totalDurationSec / 3600);
      parts.push(`累计 ${hours} 小时`);
    }
    ctx.fillStyle = "#EA9E8E";
    ctx.font = "16px 'Noto Sans SC', sans-serif";
    ctx.fillText(parts.join(" · "), PADDING, y);
    y += 30;
  }

  // 水印
  ctx.fillStyle = "rgba(139, 144, 154, 0.4)";
  ctx.font = "14px 'Noto Sans SC', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("凝时 Zept — 看见你的专注", W - PADDING, height - PADDING);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const chars = text.split("");
  const lines: string[] = [];
  let current = "";

  for (const char of chars) {
    const test = current + char;
    const metrics = ctx.measureText(test);
    if (metrics.width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);

  return lines;
}
