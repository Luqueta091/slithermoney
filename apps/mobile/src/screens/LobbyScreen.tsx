import { ActionButton } from '../components/ActionButton';
import { Reveal } from '../components/Reveal';
import { ScreenContainer } from '../components/ScreenContainer';
import { type IdentityProfile } from '../api/client';

type LobbyScreenProps = {
  identity: IdentityProfile | null;
  accountId: string;
  onSignOut: () => void;
};

export function LobbyScreen({ identity, accountId, onSignOut }: LobbyScreenProps): JSX.Element {
  return (
    <ScreenContainer>
      <div className="hero">
        <Reveal>
          <p className="kicker">Lobby</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="title">Tudo pronto</h1>
        </Reveal>
        <Reveal delay={220}>
          <p className="subtitle">
            Identidade confirmada. Em breve voce podera entrar no lobby e jogar.
          </p>
        </Reveal>
      </div>

      <div className="card">
        <span className="card__label">Conta</span>
        <span className="card__value">{accountId}</span>
        <span className="card__label">Perfil</span>
        <span className="card__value">{identity?.full_name ?? 'Nao informado'}</span>
        <span className="card__label">Pix</span>
        <span className="card__value">{identity?.pix_key ?? 'Nao informado'}</span>
      </div>

      <div className="actions">
        <ActionButton label="Sair" onClick={onSignOut} variant="ghost" />
      </div>
    </ScreenContainer>
  );
}
