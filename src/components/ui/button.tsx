import { type ButtonHTMLAttributes } from 'react';
import Link, { type LinkProps } from 'next/link';
import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800',
  secondary: 'bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-800',
  outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100',
  ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'min-h-[36px] px-3 py-1.5 text-xs',
  md: 'min-h-[48px] px-4 py-3 text-sm',
  lg: 'min-h-[48px] px-6 py-3 text-base',
};

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Shared style builder for Button and ButtonLink */
export function buttonStyles(
  { variant = 'primary', size = 'md', fullWidth = false }: StyleProps = {},
  className?: string,
) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-medium motion-safe:active:scale-[0.96] transition-[transform,colors] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 disabled:cursor-not-allowed disabled:opacity-50',
    variantStyles[variant],
    sizeStyles[size],
    fullWidth && 'w-full',
    className,
  );
}

// ─── Button ──────────────────────────────────────────────

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, fullWidth }, className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

// ─── ButtonLink ──────────────────────────────────────────

type ButtonLinkProps = LinkProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  StyleProps;

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonStyles({ variant, size, fullWidth }, className)}
      {...props}
    >
      {children}
    </Link>
  );
}
