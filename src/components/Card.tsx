import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevation?: 1 | 2 | 3;
  delay?: number;
}

export function Card({ children, className, elevation = 1, delay, ...rest }: CardProps) {
  const shadowVar = `var(--shadow-${elevation})`;
  return (
    <div
      className={['zept-card', className].filter(Boolean).join(' ')}
      style={{
        boxShadow: shadowVar,
        ...(delay !== undefined ? { animationDelay: `${delay}ms` } : {}),
        ...(rest.style ?? {}),
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
