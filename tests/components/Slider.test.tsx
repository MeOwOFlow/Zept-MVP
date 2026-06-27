import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider } from '../../src/components/Slider';

describe('Slider', () => {
  it('渲染 label 与 5 个刻度', () => {
    render(<Slider label="情绪" value={3} onChange={() => {}} />);
    expect(screen.getByText('情绪')).toBeInTheDocument();
    expect(screen.getByText('3', { selector: '.zept-slider__value' })).toBeInTheDocument();
  });

  it('渲染 5 个刻度按钮（1-5）', () => {
    render(<Slider label="情绪" value={3} onChange={() => {}} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByRole('button', { name: String(i) })).toBeInTheDocument();
    }
  });

  it('当前 value 对应刻度有 active 状态', () => {
    render(<Slider label="情绪" value={4} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: '4' })).toHaveClass('zept-slider__tick--active');
  });

  it('点击其他刻度触发 onChange', () => {
    const onChange = vi.fn();
    render(<Slider label="情绪" value={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '5' }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('键盘 ArrowRight 增加 value', () => {
    const onChange = vi.fn();
    render(<Slider label="情绪" value={3} onChange={onChange} />);
    const container = screen.getByRole('slider');
    fireEvent.keyDown(container, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('键盘 ArrowLeft 减少 value', () => {
    const onChange = vi.fn();
    render(<Slider label="情绪" value={3} onChange={onChange} />);
    const container = screen.getByRole('slider');
    fireEvent.keyDown(container, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('value=1 时 ArrowLeft 不再减少', () => {
    const onChange = vi.fn();
    render(<Slider label="情绪" value={1} onChange={onChange} />);
    const container = screen.getByRole('slider');
    fireEvent.keyDown(container, { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('value=5 时 ArrowRight 不再增加', () => {
    const onChange = vi.fn();
    render(<Slider label="情绪" value={5} onChange={onChange} />);
    const container = screen.getByRole('slider');
    fireEvent.keyDown(container, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('DualSlider 组合：情绪 + 专注度', () => {
    const onMoodChange = vi.fn();
    const onFocusChange = vi.fn();
    render(
      <Slider.Dual
        mood={3}
        focus={4}
        onMoodChange={onMoodChange}
        onFocusChange={onFocusChange}
      />,
    );
    expect(screen.getByText('情绪')).toBeInTheDocument();
    expect(screen.getByText('专注度')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '5' })[0]);
    expect(onMoodChange).toHaveBeenCalledWith(5);
    fireEvent.click(screen.getAllByRole('button', { name: '1' })[1]);
    expect(onFocusChange).toHaveBeenCalledWith(1);
  });
});
