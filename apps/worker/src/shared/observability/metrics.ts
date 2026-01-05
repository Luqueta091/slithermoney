import { createMetricsStore } from '@slithermoney/shared';

export const metrics = createMetricsStore({ histogramSize: 500 });

const metricNames = {
  jobsPendingWithdrawals: 'worker.jobs.pending.withdrawals',
  jobsPendingDeposits: 'worker.jobs.pending.deposits',
  jobsRetryErrors: 'worker.jobs.retry_errors_total',
  jobsDeadLetter: 'worker.jobs.dead_letter_total',
  pixDepositFailed: 'pix.deposit.failed_total',
  pixWithdrawalPaid: 'pix.withdrawal.paid_total',
  pixWithdrawalFailed: 'pix.withdrawal.failed_total',
  pixWithdrawalProcessingMs: 'pix.withdrawal.processing_ms',
  ledgerDivergenceDetected: 'ledger.divergence.detected_total',
  ledgerDivergenceRepaired: 'ledger.divergence.repaired_total',
};

export function setPendingWithdrawals(count: number): void {
  metrics.setGauge(metricNames.jobsPendingWithdrawals, count);
}

export function setPendingDeposits(count: number): void {
  metrics.setGauge(metricNames.jobsPendingDeposits, count);
}

export function recordRetryError(): void {
  metrics.incCounter(metricNames.jobsRetryErrors);
}

export function recordDeadLetter(count = 1): void {
  metrics.incCounter(metricNames.jobsDeadLetter, count);
}

export function recordDepositFailed(count = 1): void {
  metrics.incCounter(metricNames.pixDepositFailed, count);
  recordDeadLetter(count);
}

export function recordWithdrawalPaid(processingMs: number): void {
  metrics.incCounter(metricNames.pixWithdrawalPaid);
  metrics.observeHistogram(metricNames.pixWithdrawalProcessingMs, processingMs);
}

export function recordWithdrawalFailed(processingMs: number): void {
  metrics.incCounter(metricNames.pixWithdrawalFailed);
  metrics.observeHistogram(metricNames.pixWithdrawalProcessingMs, processingMs);
  recordDeadLetter();
}

export function recordLedgerDivergenceDetected(count = 1): void {
  metrics.incCounter(metricNames.ledgerDivergenceDetected, count);
}

export function recordLedgerDivergenceRepaired(count = 1): void {
  metrics.incCounter(metricNames.ledgerDivergenceRepaired, count);
}
