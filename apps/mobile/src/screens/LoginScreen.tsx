import { ActionButton } from '../components/ActionButton';
import { InputField } from '../components/InputField';
import { Reveal } from '../components/Reveal';
import { ScreenContainer } from '../components/ScreenContainer';

type LoginScreenProps = {
  accountId: string;
  onAccountIdChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  error?: string | null;
};

export function LoginScreen({
  accountId,
  onAccountIdChange,
  onSubmit,
  onBack,
  error,
}: LoginScreenProps): JSX.Element {
  return (
    <ScreenContainer>
      <div className="hero">
        <Reveal>
          <p className="kicker">Sessao</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="title">Entrar</h1>
        </Reveal>
        <Reveal delay={220}>
          <p className="subtitle">Use o account id salvo para acessar sua sessao.</p>
        </Reveal>
      </div>

      <div className="card">
        <InputField
          label="Account id"
          value={accountId}
          onChange={onAccountIdChange}
          placeholder="00000000-0000-0000-0000-000000000000"
        />
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="actions">
        <ActionButton label="Entrar" onClick={onSubmit} />
        <ActionButton label="Voltar" onClick={onBack} variant="ghost" />
      </div>
    </ScreenContainer>
  );
}
