import { type ButtonHTMLAttributes } from 'react';

type ActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  variant?: 'primary' | 'ghost';
};

export function ActionButton({
  label,
  variant = 'primary',
  ...props
}: ActionButtonProps): JSX.Element {
  return (
    <button className={`button ${variant}`} type="button" {...props}>
      {label}
    </button>
  );
}
