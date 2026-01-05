export type IdentidadeProfile = {
  id: string;
  accountId: string;
  fullName: string;
  cpf: string;
  pixKey: string;
  pixKeyType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

export type IdentidadeUpsertInput = {
  accountId: string;
  fullName: string;
  cpf: string;
  pixKey: string;
  pixKeyType: string;
  status: string;
};

export interface IdentidadeRepository {
  findByAccountId(accountId: string): Promise<IdentidadeProfile | null>;
  findByCpf(cpf: string): Promise<IdentidadeProfile | null>;
  upsert(input: IdentidadeUpsertInput): Promise<IdentidadeProfile>;
}
