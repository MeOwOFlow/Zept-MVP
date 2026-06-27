import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionRecord, Insight } from '../../src/types/session';

const mockSessions = vi.hoisted(() => [] as SessionRecord[]);
const mockInsights = vi.hoisted(() => [] as Insight[]);
const updateFeedbackMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../src/lib/db', () => ({
  getAllSessions: vi.fn(async () => mockSessions),
  getAllInsights: vi.fn(async () => mockInsights),
  updateInsightFeedback: updateFeedbackMock,
}));

import Insights from '../../src/pages/Insights';

const NOW = new Date('2026-06-27T12:00:00Z').getTime();

beforeEach(() => {
  mockSessions.length = 0;
  mockInsights.length = 0;
  updateFeedbackMock.mockClear();
});

describe('Insights', () => {
  it('空状态显示引导', async () => {
    render(<Insights />);
    expect(await screen.findByText(/还没有专注记录/)).toBeInTheDocument();
  });

  it('渲染会话列表和洞察', async () => {
    mockSessions.push({
      id: 's1', userId: 'local', goal: '考研', daysToExam: 100,
      startedAt: NOW, endedAt: NOW + 1800000, status: 'completed',
      plannedDurationSec: 1500, actualDurationSec: 1500, isPomodoro: true,
      pomodoroCyclesCompleted: 1, interruptions: 1, interruptionEvents: [],
      startHour: 12, endHour: 12, preAssessment: null, postAssessment: { mood: 4, focus: 4 },
    });
    mockInsights.push({
      id: 'i1', sessionId: 's1', createdAt: NOW, text: '上午更专注',
      source: 'llm', confidence: 'high', feedback: null, mood: 4,
    });
    render(<Insights />);
    expect(await screen.findByText('上午更专注')).toBeInTheDocument();
    expect(screen.getByText(/离开 1 次/)).toBeInTheDocument();
  });

  it('点击展开详情并反馈', async () => {
    const user = userEvent.setup();
    mockSessions.push({
      id: 's1', userId: 'local', goal: '考研', daysToExam: 100,
      startedAt: NOW, endedAt: NOW + 1800000, status: 'completed',
      plannedDurationSec: 1500, actualDurationSec: 1500, isPomodoro: true,
      pomodoroCyclesCompleted: 1, interruptions: 0, interruptionEvents: [],
      startHour: 12, endHour: 12, preAssessment: null, postAssessment: { mood: 4, focus: 4 },
    });
    mockInsights.push({
      id: 'i1', sessionId: 's1', createdAt: NOW, text: '测试洞察',
      source: 'llm', confidence: 'high', feedback: null, mood: 4,
    });
    render(<Insights />);
    await screen.findByText(/测试洞察/);
    await user.click(screen.getByText('expand_more'));
    expect(screen.getByText('来源：llm')).toBeInTheDocument();
    await user.click(screen.getByText('有用'));
    expect(updateFeedbackMock).toHaveBeenCalledWith('i1', 'useful');
  });
});
