'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--warm-accent)',
    color: '#ffffff',
    border: 'none',
    boxShadow: 'var(--warm-fab-shadow)',
  },
  secondary: {
    background: 'var(--warm-surface)',
    color: 'var(--warm-text)',
    border: '1px solid var(--warm-border-strong)',
    boxShadow: 'var(--warm-shadow)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--warm-text-2)',
    border: '1px solid transparent',
  },
};

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '12px', borderRadius: 'var(--warm-radius-sm)' },
  md: { padding: '8px 16px', fontSize: '13px', borderRadius: 'var(--warm-radius-input)' },
  lg: { padding: '10px 20px', fontSize: '14px', minHeight: '40px', borderRadius: 'var(--warm-radius-card)' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', icon, children, style, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          fontWeight: 600,
          fontFamily: 'var(--warm-font)',
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          transition: 'all var(--warm-dur-fast) var(--warm-ease)',
          ...VARIANT_STYLES[variant],
          ...SIZE_STYLES[size],
          ...style,
        }}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
