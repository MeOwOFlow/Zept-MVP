import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DatePicker } from '../../src/components/DatePicker';

describe('DatePicker', () => {
  it('渲染 label 和占位符', () => {
    render(<DatePicker label="你的考试日期是" value="" onChange={() => {}} />);
    expect(screen.getByText('你的考试日期是')).toBeInTheDocument();
    expect(screen.getByText('请选择日期')).toBeInTheDocument();
  });

  it('有 value 时显示格式化日期', () => {
    render(<DatePicker label="考试日期" value="2026-12-21" onChange={() => {}} />);
    expect(screen.getByText('2026年12月21日')).toBeInTheDocument();
  });

  it('点击触发器打开面板', async () => {
    const user = userEvent.setup();
    render(<DatePicker label="考试日期" value="" onChange={() => {}} />);
    await user.click(screen.getByText('请选择日期'));
    // 面板内有「确定」「取消」「今天」按钮
    expect(screen.getByRole('button', { name: '确定' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '今天' })).toBeInTheDocument();
  });

  it('点击日期高亮选中', async () => {
    const user = userEvent.setup();
    render(<DatePicker label="考试日期" value="" onChange={() => {}} minDate="2020-01-01" />);
    await user.click(screen.getByText('请选择日期'));
    // 点 15 号（当前月第一个 15 号）
    const day15 = screen.getByRole('button', { name: '15' });
    await user.click(day15);
    // 选中态应有 aria-pressed
    expect(day15).toHaveAttribute('aria-pressed', 'true');
  });

  it('点击确定调用 onChange 并关闭面板', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="考试日期" value="" onChange={onChange} minDate="2020-01-01" />);
    await user.click(screen.getByText('请选择日期'));
    await user.click(screen.getByRole('button', { name: '15' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onChange).toHaveBeenCalled();
    // 面板关闭后不再有确定按钮
    expect(screen.queryByRole('button', { name: '确定' })).not.toBeInTheDocument();
  });

  it('点击取消不调用 onChange 并关闭', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="考试日期" value="" onChange={onChange} />);
    await user.click(screen.getByText('请选择日期'));
    await user.click(screen.getByRole('button', { name: '15' }));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '确定' })).not.toBeInTheDocument();
  });

  it('点击今天选中今日', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="考试日期" value="" onChange={onChange} />);
    await user.click(screen.getByText('请选择日期'));
    await user.click(screen.getByRole('button', { name: '今天' }));
    await user.click(screen.getByRole('button', { name: '确定' }));
    expect(onChange).toHaveBeenCalled();
    const today = new Date();
    const expected = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(onChange).toHaveBeenCalledWith(expected);
  });

  it('月份切换按钮可用', async () => {
    const user = userEvent.setup();
    render(<DatePicker label="考试日期" value="" onChange={() => {}} />);
    await user.click(screen.getByText('请选择日期'));
    // 当前月份显示后，点击下一月
    const nextBtn = screen.getByRole('button', { name: '下一月' });
    await user.click(nextBtn);
    // 切换后仍然能找到下一月按钮（可重复点）
    expect(screen.getByRole('button', { name: '下一月' })).toBeInTheDocument();
  });

  it('点击遮罩关闭面板且不触发 onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DatePicker label="考试日期" value="" onChange={onChange} />);
    await user.click(screen.getByText('请选择日期'));
    const scrim = document.querySelector('.zept-dp__scrim');
    expect(scrim).not.toBeNull();
    fireEvent.click(scrim!);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '确定' })).not.toBeInTheDocument();
  });
});
