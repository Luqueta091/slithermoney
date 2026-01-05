import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { HttpError } from '../../../shared/http/http-error';
import { ValidationError } from '../../../shared/errors/validation-error';
import { CarteirasRepository } from '../../carteiras/repository/carteiras.repository';
import { LedgerService } from '../../ledger/services/ledger.service';
import { RunStartInput } from '../dtos/run-start.dto';
import { RunRecord, RunsRepository } from '../repository/runs.repository';

export type RunStartResult = {
  run: RunRecord;
  joinToken: string;
  arenaHost: string;
};

export class RunsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly walletRepository: CarteirasRepository,
    private readonly ledgerService: LedgerService,
    private readonly runsRepository: RunsRepository,
  ) {}

  async startRun(
    accountId: string,
    input: RunStartInput,
    options: { arenaHost: string; minStakeCents: number; maxStakeCents: number },
  ): Promise<RunStartResult> {
    const stakeCents = assertStake(input.stakeCents, options.minStakeCents, options.maxStakeCents);
    const amount = BigInt(stakeCents);
    const joinToken = randomUUID();

    const run = await this.prisma.$transaction(async (tx) => {
      await this.walletRepository.ensureAccountAndWallet(accountId, tx);

      const wallet = await this.walletRepository.updateBalancesWithGuard(
        accountId,
        { availableBalanceCents: -amount, inGameBalanceCents: amount },
        { availableBalanceCents: amount },
        tx,
      );

      if (!wallet) {
        throw new ValidationError('Saldo insuficiente');
      }

      const createdRun = await this.runsRepository.create(
        {
          accountId,
          stakeCents: amount,
          status: 'PREPARING',
        },
        tx,
      );

      await this.ledgerService.registerMovement(
        {
          accountId,
          walletId: wallet.id,
          entryType: 'STAKE_RESERVED',
          direction: 'DEBIT',
          amountCents: stakeCents,
          currency: 'BRL',
          referenceType: 'RUN',
          referenceId: createdRun.id,
          externalReference: createdRun.id,
          metadata: {
            run_id: createdRun.id,
          },
        },
        tx,
      );

      return createdRun;
    });

    return {
      run,
      joinToken,
      arenaHost: options.arenaHost,
    };
  }

  async eliminateRun(input: {
    runId: string;
    reason?: string;
    sizeScore?: number;
    multiplier?: number;
  }): Promise<RunRecord> {
    return this.prisma.$transaction(async (tx) => {
      const run = await tx.run.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new HttpError(404, 'run_not_found', 'Run não encontrada');
      }

      if (run.status === 'ELIMINATED' || run.status === 'CASHED_OUT') {
        return run;
      }

      const updatedRun = await tx.run.update({
        where: { id: run.id },
        data: {
          status: 'ELIMINATED',
          resultReason: input.reason ?? 'eliminated',
          endedAt: new Date(),
        },
      });

      const wallet = await this.walletRepository.updateBalancesWithGuard(
        run.accountId,
        { inGameBalanceCents: -run.stakeCents },
        { inGameBalanceCents: run.stakeCents },
        tx,
      );

      if (!wallet) {
        throw new ValidationError('Saldo em jogo insuficiente');
      }

      await this.ledgerService.registerMovement(
        {
          accountId: run.accountId,
          walletId: wallet.id,
          entryType: 'STAKE_LOST',
          direction: 'DEBIT',
          amountCents: Number(run.stakeCents),
          currency: 'BRL',
          referenceType: 'RUN',
          referenceId: run.id,
          externalReference: run.id,
          metadata: {
            run_id: run.id,
            reason: input.reason ?? 'eliminated',
            size_score: input.sizeScore ?? null,
            multiplier: input.multiplier ?? null,
          },
        },
        tx,
      );

      return updatedRun;
    });
  }

  async cashoutRun(
    input: { runId: string; multiplier: number; sizeScore?: number },
    options: { feeBps: number },
  ): Promise<RunRecord> {
    const multiplierBps = normalizeMultiplier(input.multiplier);
    const feeBps = normalizeFee(options.feeBps);

    return this.prisma.$transaction(async (tx) => {
      const run = await tx.run.findUnique({
        where: { id: input.runId },
      });

      if (!run) {
        throw new HttpError(404, 'run_not_found', 'Run não encontrada');
      }

      if (run.status === 'CASHED_OUT' || run.status === 'ELIMINATED') {
        return run;
      }

      const prizeCents = (run.stakeCents * BigInt(multiplierBps)) / 10000n;
      if (prizeCents <= 0n) {
        throw new ValidationError('Premio invalido');
      }

      const feeCents = (prizeCents * BigInt(feeBps)) / 10000n;
      const payoutCents = prizeCents - feeCents;

      const updatedRun = await tx.run.update({
        where: { id: run.id },
        data: {
          status: 'CASHED_OUT',
          multiplier: new Prisma.Decimal(input.multiplier),
          payoutCents: prizeCents,
          houseFeeCents: feeCents,
          resultReason: 'cashout',
          endedAt: new Date(),
        },
      });

      const wallet = await this.walletRepository.updateBalancesWithGuard(
        run.accountId,
        { availableBalanceCents: payoutCents, inGameBalanceCents: -run.stakeCents },
        { inGameBalanceCents: run.stakeCents },
        tx,
      );

      if (!wallet) {
        throw new ValidationError('Saldo em jogo insuficiente');
      }

      await this.ledgerService.registerMovement(
        {
          accountId: run.accountId,
          walletId: wallet.id,
          entryType: 'PRIZE',
          direction: 'CREDIT',
          amountCents: Number(prizeCents),
          currency: 'BRL',
          referenceType: 'RUN',
          referenceId: run.id,
          externalReference: run.id,
          metadata: {
            run_id: run.id,
            multiplier: input.multiplier,
            size_score: input.sizeScore ?? null,
          },
        },
        tx,
      );

      if (feeCents > 0n) {
        await this.ledgerService.registerMovement(
          {
            accountId: run.accountId,
            walletId: wallet.id,
            entryType: 'HOUSE_FEE',
            direction: 'DEBIT',
            amountCents: Number(feeCents),
            currency: 'BRL',
            referenceType: 'RUN',
            referenceId: run.id,
            externalReference: run.id,
            metadata: {
              run_id: run.id,
              fee_bps: feeBps,
            },
          },
          tx,
        );
      }

      return updatedRun;
    });
  }
}

function assertStake(stakeCents: number, minStakeCents: number, maxStakeCents: number): number {
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw new ValidationError('Stake invalido');
  }

  if (stakeCents < minStakeCents) {
    throw new ValidationError('Stake abaixo do minimo');
  }

  if (stakeCents > maxStakeCents) {
    throw new ValidationError('Stake acima do maximo');
  }

  return stakeCents;
}

function normalizeMultiplier(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new ValidationError('Multiplicador invalido');
  }

  return Math.round(multiplier * 10000);
}

function normalizeFee(feeBps: number): number {
  if (!Number.isInteger(feeBps) || feeBps < 0) {
    throw new ValidationError('Fee invalida');
  }

  return feeBps;
}
