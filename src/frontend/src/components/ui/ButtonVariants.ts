import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-sm text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200/90",
        destructive: "bg-red-500 text-white hover:bg-red-600/90",
        outline: "border border-zinc-700 bg-transparent hover:bg-zinc-800 text-zinc-100",
        secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-800/80",
        ghost: "hover:bg-zinc-800 hover:text-zinc-100",
        link: "text-zinc-100 underline-offset-4 hover:underline",
        primary: "bg-orange-600 text-white hover:bg-orange-700 border border-orange-500",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-sm px-3 text-xs",
        lg: "h-10 rounded-sm px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
