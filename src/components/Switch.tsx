import type { ButtonHTMLAttributes } from 'react';

export interface SwitchProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, onCheckedChange, className, ...rest }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={['zept-switch', checked ? 'zept-switch--checked' : '', className].filter(Boolean).join(' ')}
      onClick={() => onCheckedChange(!checked)}
      {...rest}
    >
      <span className="zept-switch__thumb" />
    </button>
  );
}
