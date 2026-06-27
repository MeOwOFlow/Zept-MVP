import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../src/components/Button';

describe('Button', () => {
  it('渲染 children 文本', () => {
    render(<Button>开始</Button>);
    expect(screen.getByRole('button', { name: '开始' })).toBeInTheDocument();
  });

  it('默认 variant 为 filled', () => {
    render(<Button>开始</Button>);
    expect(screen.getByRole('button', { name: '开始' })).toHaveClass('zept-btn', 'zept-btn--filled');
  });

  it('variant=outlined 时具有对应类名', () => {
    render(<Button variant="outlined">取消</Button>);
    expect(screen.getByRole('button', { name: '取消' })).toHaveClass('zept-btn--outlined');
  });

  it('variant=text 时具有对应类名', () => {
    render(<Button variant="text">跳过</Button>);
    expect(screen.getByRole('button', { name: '跳过' })).toHaveClass('zept-btn--text');
  });

  it('disabled 时按钮不可点击', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>开始</Button>);
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '开始' })).toBeDisabled();
  });

  it('点击触发 onClick 回调', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>开始</Button>);
    fireEvent.click(screen.getByRole('button', { name: '开始' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('pointerdown 时创建 ripple 元素', () => {
    render(<Button>开始</Button>);
    const btn = screen.getByRole('button', { name: '开始' });
    expect(btn.querySelector('.zept-ripple')).toBeNull();
    fireEvent.pointerDown(btn);
    expect(btn.querySelector('.zept-ripple')).not.toBeNull();
  });

  it('支持 type 属性（默认 button）', () => {
    render(<Button>开始</Button>);
    expect(screen.getByRole('button', { name: '开始' })).toHaveAttribute('type', 'button');
  });
});
