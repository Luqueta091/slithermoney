import { AsyncLocalStorage } from 'async_hooks';

export type RequestContext = {
  request_id?: string;
  trace_id?: string;
  user_id?: string;
  auth_source?: 'jwt' | 'legacy_header';
  auth_token_id?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}

export function setRequestContext(partial: Partial<RequestContext>): void {
  const current = storage.getStore();
  if (!current) {
    return;
  }

  Object.assign(current, partial);
}
