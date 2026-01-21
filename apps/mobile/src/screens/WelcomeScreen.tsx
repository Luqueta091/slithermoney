import { ActionButton } from '../components/ActionButton';
import { Reveal } from '../components/Reveal';
import { ScreenContainer } from '../components/ScreenContainer';

type WelcomeScreenProps = {
  onCreate: () => void;
  onLogin: () => void;
};

export function WelcomeScreen({ onCreate, onLogin }: WelcomeScreenProps): JSX.Element {
  return (
    <ScreenContainer>
      <div className="hero">
        <Reveal>
          <p className="kicker">Skill Betting Arena</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="title">SlitherMoney</h1>
        </Reveal>
        <Reveal delay={220}>
          <p className="subtitle">
            Entre rapido, complete sua identidade e comece a jogar em tempo real.
          </p>
        </Reveal>
      </div>

      <div className="actions">
        <Reveal delay={320}>
          <ActionButton label="Criar conta" onClick={onCreate} />
        </Reveal>
        <Reveal delay={420}>
          <ActionButton label="Entrar" onClick={onLogin} variant="ghost" />
        </Reveal>
      </div>
    </ScreenContainer>
  );
}
