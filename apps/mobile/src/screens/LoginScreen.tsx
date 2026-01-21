import { ActionButton } from '../components/ActionButton';
import { InputField } from '../components/InputField';
import { Reveal } from '../components/Reveal';
import { ScreenContainer } from '../components/ScreenContainer';

type LoginScreenProps = {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  error?: string | null;
};

export function LoginScreen({
  email,
  password,
  onEmailChange,
  onPasswordChange,
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
          <p className="subtitle">Use seu email e senha para acessar sua sessao.</p>
        </Reveal>
      </div>

      <div className="card">
        <InputField
          label="Email"
          value={email}
          onChange={onEmailChange}
          placeholder="voce@email.com"
          type="email"
        />
        <InputField
          label="Senha"
          value={password}
          onChange={onPasswordChange}
          placeholder="••••••••"
          type="password"
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
