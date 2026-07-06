import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant = 'filled' | 'outlined' | 'text';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

export function Button({
  variant = 'filled',
  children,
  className,
  onClick,
  type = 'button',
  ...rest
}: ButtonProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const rippleRef = useRef<HTMLSpanElement | null>(null);
  const animRef = useRef<Animation | null>(null);

  useEffect(() => {
    return () => {
      // 卸载时取消动画并移除 ripple，避免内存泄漏与 DOM 残留
      animRef.current?.cancel();
      rippleRef.current?.remove();
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn || btn.disabled) return;

    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'zept-ripple';
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    ripple.style.width = `${size}px`;
    ripple.style.height = `${size}px`;
    btn.appendChild(ripple);
    rippleRef.current = ripple;

    const animation = ripple.animate(
      [
        { transform: 'scale(0)', opacity: 0.4 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      {
        duration: 600,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        fill: 'forwards',
      },
    );
    animRef.current = animation;

    animation.onfinish = () => {
      rippleRef.current = null;
      animRef.current = null;
      ripple.remove();
    };
  };

  return (
    <button
      ref={btnRef}
      type={type}
      className={['zept-btn', `zept-btn--${variant}`, className].filter(Boolean).join(' ')}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      {...rest}
    >
      <span className="zept-btn__label">{children}</span>
    </button>
  );
}
