import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from '../../src/components/Card';

describe('Card', () => {
  it('渲染 children 内容', () => {
    render(<Card><span>卡片内容</span></Card>);
    expect(screen.getByText('卡片内容')).toBeInTheDocument();
  });

  it('默认渲染为 div 角色容器', () => {
    render(<Card><span>内容</span></Card>);
    const card = screen.getByText('内容').parentElement;
    expect(card).toHaveClass('zept-card');
  });

  it('支持自定义 className 合并', () => {
    render(<Card className="custom"><span>内容</span></Card>);
    const card = screen.getByText('内容').parentElement;
    expect(card).toHaveClass('zept-card', 'custom');
  });

  it('应用 MD3 elevation 阴影变量', () => {
    render(<Card><span>内容</span></Card>);
    const card = screen.getByText('内容').parentElement!;
    const styles = window.getComputedStyle(card);
    expect(styles.boxShadow).not.toBe('');
  });
});
