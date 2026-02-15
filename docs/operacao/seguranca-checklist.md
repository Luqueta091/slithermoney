# Checklist de seguranca

- [ ] Segredos e chaves ficam fora do repo (env/secret manager), sem commit de `.env`.
- [ ] Rate limit ativo em rotas criticas (identidade, Pix, runs).
- [ ] Webhook Pix protegido com `PIX_WEBHOOK_TOKEN` no `postbackUrl`.
- [ ] Webhook game-server protegido com `GAME_SERVER_WEBHOOK_KEY`.
- [ ] Eventos `runs/events/*` assinados com HMAC (`x-run-event-*`) e nonce anti-replay.
- [ ] `TRUST_PROXY_ENABLED` e `TRUST_PROXY_CIDRS` configurados para usar IP real com segurança.
- [ ] Logs nao expõem CPF/pix key; CPF mascarado quando usado em alertas.
- [ ] Consentimento do usuario exibido no onboarding (termos + privacidade).
- [ ] Scan automatico de dependencias e secrets configurado no CI (bloqueando high/critical).
