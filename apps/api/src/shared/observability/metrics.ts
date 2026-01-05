import { createMetricsStore } from '@slithermoney/shared';

export const metrics = createMetricsStore({ histogramSize: 500 });

const metricNames = {
  httpRequestsTotal: 'http.requests.total',
  httpRequests4xx: 'http.requests.4xx_total',
  httpRequests5xx: 'http.requests.5xx_total',
  httpRequestsInFlight: 'http.requests.in_flight',
  httpRequestDurationMs: 'http.request.duration_ms',
  pixDepositCreated: 'pix.deposit.created_total',
  pixDepositConfirmed: 'pix.deposit.confirmed_total',
  pixDepositConfirmationMs: 'pix.deposit.confirmation_ms',
  pixWithdrawalRequested: 'pix.withdrawal.requested_total',
};

export function recordHttpRequest(durationMs: number, statusCode: number): void {
  metrics.incCounter(metricNames.httpRequestsTotal);
  metrics.observeHistogram(metricNames.httpRequestDurationMs, durationMs);

  if (statusCode >= 400 && statusCode < 500) {
    metrics.incCounter(metricNames.httpRequests4xx);
  }

  if (statusCode >= 500) {
    metrics.incCounter(metricNames.httpRequests5xx);
  }
}

export function setHttpInFlight(count: number): void {
  metrics.setGauge(metricNames.httpRequestsInFlight, count);
}

export function recordPixDepositCreated(): void {
  metrics.incCounter(metricNames.pixDepositCreated);
}

export function recordPixDepositConfirmed(confirmationMs: number): void {
  metrics.incCounter(metricNames.pixDepositConfirmed);
  metrics.observeHistogram(metricNames.pixDepositConfirmationMs, confirmationMs);
}

export function recordPixWithdrawalRequested(): void {
  metrics.incCounter(metricNames.pixWithdrawalRequested);
}
