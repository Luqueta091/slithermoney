import { BlockList, isIP } from 'net';
import { IncomingMessage } from 'http';

type ClientIpOptions = {
  trustProxyEnabled: boolean;
  trustedProxyCidrs: readonly string[];
};

const IPV4_MAPPED_IPV6_PREFIX = '::ffff:';

export function extractClientIp(req: IncomingMessage, options: ClientIpOptions): string {
  const remoteAddress = normalizeIp(req.socket.remoteAddress);
  if (!remoteAddress) {
    return 'unknown';
  }

  if (!options.trustProxyEnabled) {
    return remoteAddress;
  }

  const allowList = buildProxyAllowList(options.trustedProxyCidrs);
  if (!allowList || !isTrustedProxyIp(remoteAddress, allowList)) {
    return remoteAddress;
  }

  const forwardedIps = parseForwardedForHeader(req.headers['x-forwarded-for']);
  if (forwardedIps.length === 0) {
    return remoteAddress;
  }

  const addressChain = [...forwardedIps, remoteAddress];
  for (let index = addressChain.length - 1; index >= 0; index -= 1) {
    const candidate = addressChain[index];
    if (!isTrustedProxyIp(candidate, allowList)) {
      return candidate;
    }
  }

  return addressChain[0] ?? remoteAddress;
}

function buildProxyAllowList(cidrs: readonly string[]): BlockList | null {
  const blockList = new BlockList();
  let hasAnySubnet = false;

  for (const cidr of cidrs) {
    const parsed = parseCidr(cidr);
    if (!parsed) {
      continue;
    }

    blockList.addSubnet(parsed.network, parsed.prefix, parsed.type);
    hasAnySubnet = true;
  }

  return hasAnySubnet ? blockList : null;
}

function isTrustedProxyIp(ip: string, blockList: BlockList | null): boolean {
  if (!blockList) {
    return false;
  }

  return blockList.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

function parseForwardedForHeader(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }

  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw
    .split(',')
    .map((entry) => normalizeIp(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function parseCidr(raw: string): { network: string; prefix: number; type: 'ipv4' | 'ipv6' } | null {
  const input = raw.trim();
  if (!input) {
    return null;
  }

  const parts = input.split('/');
  if (parts.length !== 2) {
    return null;
  }

  const network = normalizeIp(parts[0]);
  if (!network) {
    return null;
  }

  const prefix = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(prefix)) {
    return null;
  }

  const ipVersion = isIP(network);
  if (ipVersion === 4 && (prefix < 0 || prefix > 32)) {
    return null;
  }
  if (ipVersion === 6 && (prefix < 0 || prefix > 128)) {
    return null;
  }

  return {
    network,
    prefix,
    type: ipVersion === 6 ? 'ipv6' : 'ipv4',
  };
}

function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const bracketMatch = trimmed.match(/^\[([^\]]+)\](?::\d+)?$/);
  const withNoBrackets = bracketMatch?.[1] ?? trimmed;
  const maybeIpv4WithPort = withNoBrackets.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/)?.[1];
  const value = maybeIpv4WithPort ?? withNoBrackets;

  if (value.toLowerCase().startsWith(IPV4_MAPPED_IPV6_PREFIX)) {
    const mapped = value.slice(IPV4_MAPPED_IPV6_PREFIX.length);
    if (isIP(mapped) === 4) {
      return mapped;
    }
  }

  return isIP(value) ? value : null;
}
