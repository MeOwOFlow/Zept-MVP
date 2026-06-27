import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  elevation?: 1 | 2 | 3;
}

export function Card({ children, className, elevation = 1, ...rest }: CardProps) {
  const shadowVar = `var(--shadow-${elevation})`;
  return (
    <div
      className={['zept-card', className].filter(Boolean).join(' ')}
      style={{ boxShadow: shadowVar, ...(rest.style ?? {}) }}
      {...rest}
    >
      {children}
    </div>
  );
}
