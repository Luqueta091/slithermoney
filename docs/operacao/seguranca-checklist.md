# Checklist de seguranca

- [ ] Segredos e chaves ficam fora do repo (env/secret manager), sem commit de `.env`.
- [ ] Rate limit ativo em rotas criticas (identidade, Pix, runs).
- [ ] Webhook Pix protegido com `PIX_WEBHOOK_SECRET`.
- [ ] Webhook game-server protegido com `GAME_SERVER_WEBHOOK_KEY`.
- [ ] Logs nao expõem CPF/pix key; CPF mascarado quando usado em alertas.
- [ ] Consentimento do usuario exibido no onboarding (termos + privacidade).
- [ ] Scan automatico de dependencias configurado (npm audit/CI).
