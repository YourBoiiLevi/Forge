import React from 'react';
import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-mono transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 border border-transparent",
          
          // Variants
          variant === 'primary' && "bg-accent text-white hover:bg-accent/90",
          variant === 'secondary' && "bg-bg-surface text-text-primary hover:bg-border border-border",
          variant === 'destructive' && "bg-error text-white hover:bg-error/90",
          variant === 'outline' && "border-border bg-transparent hover:bg-bg-surface text-text-primary",
          variant === 'ghost' && "hover:bg-bg-surface text-text-primary",
          
          // Sizes
          size === 'sm' && "h-8 px-3 text-xs",
          size === 'md' && "h-10 px-4 py-2 text-sm",
          size === 'lg' && "h-12 px-8 text-base",
          size === 'icon' && "h-10 w-10",
          
          className
        )}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {isLoading && (
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
