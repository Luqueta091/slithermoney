import { ScreenContainer } from '../components/ScreenContainer';
import { Reveal } from '../components/Reveal';

export function LoadingScreen(): JSX.Element {
  return (
    <ScreenContainer>
      <div className="hero">
        <Reveal>
          <p className="kicker">Skill Betting Arena</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="title">SlitherMoney</h1>
        </Reveal>
        <Reveal delay={240}>
          <p className="subtitle">Carregando sessao</p>
        </Reveal>
      </div>
      <div className="card" style={{ alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    </ScreenContainer>
  );
}
