import { type ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  delay?: number;
};

export function Reveal({ children, delay = 0 }: RevealProps): JSX.Element {
  return (
    <div className="reveal" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
