import { type ReactNode } from 'react';
import { GradientBackground } from './GradientBackground';

type ScreenContainerProps = {
  children: ReactNode;
};

export function ScreenContainer({ children }: ScreenContainerProps): JSX.Element {
  return (
    <div className="screen">
      <GradientBackground />
      <div className="screen__content">
        <div className="shell">{children}</div>
      </div>
    </div>
  );
}
