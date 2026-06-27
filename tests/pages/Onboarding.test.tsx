import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const setProfileMock = vi.hoisted(() => vi.fn(async () => undefined));
const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
vi.mock('../../src/stores/userStore', () => ({
  useUserStore: (selector: (s: { setProfile: typeof setProfileMock }) => unknown) =>
    selector({ setProfile: setProfileMock }),
}));

import Onboarding from '../../src/pages/Onboarding';

beforeEach(() => {
  setProfileMock.mockClear();
  mockNavigate.mockClear();
});

describe('Onboarding', () => {
  it('渲染三个问题区域', () => {
    render(<Onboarding />);
    expect(screen.getByPlaceholderText(/考研/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/30/)).toBeInTheDocument();
    expect(screen.getByText('手机')).toBeInTheDocument();
  });

  it('未填完时按钮禁用', () => {
    render(<Onboarding />);
    expect(screen.getByRole('button', { name: '开始专注' })).toBeDisabled();
  });

  it('填完后提交调用 setProfile 并跳转', async () => {
    const user = userEvent.setup();
    render(<Onboarding />);
    await user.type(screen.getByPlaceholderText(/考研/), '考研');
    await user.type(screen.getByPlaceholderText(/30/), '100');
    await user.click(screen.getByText('开始专注'));
    expect(setProfileMock).toHaveBeenCalledWith(
      expect.objectContaining({ goal: '考研', daysToExam: 100, onboarded: true }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('/session');
  });
});
