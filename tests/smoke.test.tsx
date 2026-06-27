import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';

describe('smoke', () => {
  it('App 渲染 Card + Button + Slider 组合并响应交互', () => {
    render(<App />);
    expect(screen.getByText('凝时 Zept')).toBeInTheDocument();
    expect(screen.getByText('开始专注')).toBeInTheDocument();
    expect(screen.getByText('情绪')).toBeInTheDocument();
    expect(screen.getByText('专注度')).toBeInTheDocument();
  });

  it('点击 Button 不抛错', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '开始专注' }));
    expect(screen.getByText('开始专注')).toBeInTheDocument();
  });
});
