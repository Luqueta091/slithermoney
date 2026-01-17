import { ActionButton } from '../components/ActionButton';
import { InputField } from '../components/InputField';
import { Reveal } from '../components/Reveal';
import { ScreenContainer } from '../components/ScreenContainer';

const PIX_TYPES = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telefone' },
  { key: 'cpf', label: 'CPF' },
  { key: 'random', label: 'Aleatoria' },
] as const;

export type PixKeyType = (typeof PIX_TYPES)[number]['key'];

type IdentityScreenProps = {
  accountId: string;
  fullName: string;
  cpf: string;
  pixKey: string;
  pixKeyType: PixKeyType;
  termsAccepted: boolean;
  onTermsChange: (value: boolean) => void;
  onFullNameChange: (value: string) => void;
  onCpfChange: (value: string) => void;
  onPixKeyChange: (value: string) => void;
  onPixKeyTypeChange: (value: PixKeyType) => void;
  onSubmit: () => void;
  onSignOut: () => void;
  error?: string | null;
};

export function IdentityScreen({
  accountId,
  fullName,
  cpf,
  pixKey,
  pixKeyType,
  termsAccepted,
  onTermsChange,
  onFullNameChange,
  onCpfChange,
  onPixKeyChange,
  onPixKeyTypeChange,
  onSubmit,
  onSignOut,
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
          {PIX_TYPES.map((type) => (
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
        <ActionButton label="Sair" onClick={onSignOut} variant="ghost" />
      </div>
    </ScreenContainer>
  );
}

function pixKeyPlaceholder(type: PixKeyType): string {
  switch (type) {
    case 'email':
      return 'email@exemplo.com';
    case 'phone':
      return '+5511999999999';
    case 'cpf':
      return '000.000.000-00';
    case 'random':
      return '00000000-0000-0000-0000-000000000000';
    default:
      return '';
  }
}

function pixKeyHelper(type: PixKeyType): string {
  switch (type) {
    case 'phone':
      return 'Use o formato internacional com +55.';
    case 'random':
      return 'Chave aleatoria deve ser um UUID.';
    default:
      return '';
  }
}
