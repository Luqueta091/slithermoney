export function GradientBackground(): JSX.Element {
  return (
    <div className="background" aria-hidden="true">
      <div className="blob top" />
      <div className="blob bottom" />
      <div className="ribbon" />
    </div>
  );
}
