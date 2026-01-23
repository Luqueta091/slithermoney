import { ActionButton } from '../components/ActionButton';
import { InputField } from '../components/InputField';
import { Reveal } from '../components/Reveal';
import { ScreenContainer } from '../components/ScreenContainer';
import {
  PIX_KEY_TYPES,
  type PixKeyType,
  pixKeyHelper,
  pixKeyPlaceholder,
} from '../utils/pixKey';

type IdentityScreenProps = {
  accountId: string;
  fullName: string;
  cpf: string;
  pixKey: string;
  pixKeyType: PixKeyType;
  termsAccepted: boolean;
  email?: string;
  password?: string;
  onEmailChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
  onTermsChange: (value: boolean) => void;
  onFullNameChange: (value: string) => void;
  onCpfChange: (value: string) => void;
  onPixKeyChange: (value: string) => void;
  onPixKeyTypeChange: (value: PixKeyType) => void;
  onSubmit: () => void;
  onSignOut: () => void;
  onSwitchToLogin?: () => void;
  onBack?: () => void;
  error?: string | null;
};

export function IdentityScreen({
  accountId,
  fullName,
  cpf,
  pixKey,
  pixKeyType,
  termsAccepted,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  onTermsChange,
  onFullNameChange,
  onCpfChange,
  onPixKeyChange,
  onPixKeyTypeChange,
  onSubmit,
  onSignOut,
  onSwitchToLogin,
  onBack,
  error,
}: IdentityScreenProps): JSX.Element {
  return (
    <ScreenContainer>
      <div className="hero">
        <Reveal>
          <p className="kicker">Identidade</p>
        </Reveal>
        <Reveal delay={120}>
          <h1 className="title">Complete o cadastro</h1>
        </Reveal>
        <Reveal delay={220}>
          <p className="subtitle">Precisamos de alguns dados para liberar depositos e saques.</p>
        </Reveal>
      </div>

      <div className="card">
        {onEmailChange ? (
          <InputField
            label="Email"
            value={email ?? ''}
            onChange={onEmailChange}
            placeholder="voce@email.com"
            type="email"
          />
        ) : null}
        {onPasswordChange ? (
          <InputField
            label="Senha"
            value={password ?? ''}
            onChange={onPasswordChange}
            placeholder="••••••••"
            type="password"
          />
        ) : null}
        <InputField
          label="Nome completo"
          value={fullName}
          onChange={onFullNameChange}
          placeholder="Seu nome"
        />
        <InputField
          label="CPF"
          value={cpf}
          onChange={onCpfChange}
          placeholder="000.000.000-00"
        />

        <div className="chips">
          {PIX_KEY_TYPES.map((type) => (
            <button
              key={type.key}
              type="button"
              className={`chip ${pixKeyType === type.key ? 'active' : ''}`}
              onClick={() => onPixKeyTypeChange(type.key)}
            >
              {type.label}
            </button>
          ))}
        </div>

        <InputField
          label="Chave Pix"
          value={pixKey}
          onChange={onPixKeyChange}
          placeholder={pixKeyPlaceholder(pixKeyType)}
          helperText={pixKeyHelper(pixKeyType)}
        />

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => onTermsChange(event.target.checked)}
          />
          <span>Li e aceito os termos de uso e a politica de privacidade.</span>
        </label>

        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="actions">
        <ActionButton label="Salvar identidade" onClick={onSubmit} disabled={!termsAccepted} />
        {onSwitchToLogin ? (
          <ActionButton label="Já tenho conta" onClick={onSwitchToLogin} variant="ghost" />
        ) : null}
        {onBack ? (
          <ActionButton label="Voltar" onClick={onBack} variant="ghost" />
        ) : (
          <ActionButton label="Sair" onClick={onSignOut} variant="ghost" />
        )}
      </div>
    </ScreenContainer>
  );
}
