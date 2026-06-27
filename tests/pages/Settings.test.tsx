import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const exportAllMock = vi.hoisted(() => vi.fn(async () => ({ sessions: [], insights: [] })));
const clearAllMock = vi.hoisted(() => vi.fn(async () => undefined));
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
vi.mock('../../src/lib/db', () => ({
  exportAll: exportAllMock,
  clearAll: clearAllMock,
}));

import Settings from '../../src/pages/Settings';

beforeEach(() => {
  exportAllMock.mockClear();
  clearAllMock.mockClear();
  mockNavigate.mockClear();
});

describe('Settings', () => {
  it('渲染设置项', () => {
    render(<Settings />);
    expect(screen.getByText('导出 JSON')).toBeInTheDocument();
    expect(screen.getByText('清空所有数据')).toBeInTheDocument();
    expect(screen.getByText('合规声明')).toBeInTheDocument();
  });

  it('导出调用 exportAll', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByText('导出 JSON'));
    expect(exportAllMock).toHaveBeenCalledTimes(1);
  });

  it('清空数据需二次确认', async () => {
    const user = userEvent.setup();
    render(<Settings />);
    await user.click(screen.getByText('清空所有数据'));
    expect(screen.getByText('确认清空')).toBeInTheDocument();
    await user.click(screen.getByText('确认清空'));
    expect(clearAllMock).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding');
  });
});
