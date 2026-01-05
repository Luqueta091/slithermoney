import { IdentidadeInput } from '../dtos/identidade.dto';
import { parseCpf } from '../domain/value-objects/cpf.vo';
import { parsePixKey } from '../domain/value-objects/pix-key.vo';
import {
  IdentidadeProfile,
  IdentidadeRepository,
} from '../repository/identidade.repository';
import { ValidationError } from '../../../shared/errors/validation-error';
import { FraudFlagsService } from '../../fraud/services/fraud-flags.service';

export class IdentidadeService {
  constructor(
    private readonly repository: IdentidadeRepository,
    private readonly fraudFlagsService?: FraudFlagsService,
  ) {}

  async upsert(accountId: string, input: IdentidadeInput): Promise<IdentidadeProfile> {
    const cpf = parseCpf(input.cpf);
    const pixKey = parsePixKey(input.pixKey, input.pixKeyType);
    const existingCpf = await this.repository.findByCpf(cpf);

    if (existingCpf && existingCpf.accountId !== accountId) {
      await this.fraudFlagsService?.createFlagIfOpen({
        accountId,
        flagType: 'DUPLICATE_CPF',
        severity: 'high',
        details: {
          cpf_masked: maskCpf(cpf),
          existing_account_id: existingCpf.accountId,
        },
      });

      throw new ValidationError('CPF ja cadastrado');
    }

    return this.repository.upsert({
      accountId,
      fullName: input.fullName.trim(),
      cpf,
      pixKey,
      pixKeyType: input.pixKeyType,
      status: 'complete',
    });
  }

  async getByAccount(accountId: string): Promise<IdentidadeProfile | null> {
    return this.repository.findByAccountId(accountId);
  }

  async assertWithdrawAllowed(accountId: string): Promise<void> {
    const identity = await this.repository.findByAccountId(accountId);

    if (!identity || identity.status !== 'complete') {
      throw new ValidationError('Identidade incompleta');
    }
  }
}

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) {
    return '***';
  }

  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}
