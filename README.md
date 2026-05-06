# salesden-backend

Tiny Express server that mints Twilio Access Tokens and serves TwiML for the SalesDen Mobile app.

```bash
npm install
cp .env.example .env       # then open .env and fill in real Twilio values
npm start                  # http://localhost:3000
```

Endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/token?identity=salesden_user` | Returns `{ identity, token }` (Twilio Access Token JWT) |
| `POST` | `/voice` | TwiML webhook called by Twilio (outbound + inbound) |
| `POST` | `/status-callback` | Logs call lifecycle events |
| `GET`  | `/` | Health check |

See the top-level `DOCUMENTATION.md` for full setup, `TROUBLESHOOTING.md` for errors, and `CONTEXT.md` for a one-pager.

## Smoke test

```bash
curl "http://localhost:3000/token?identity=salesden_user"
curl -X POST -d "To=+919886306995" http://localhost:3000/voice
curl -X POST http://localhost:3000/voice    # inbound case
```

Decode the `/token` response at https://jwt.io and verify:
- `grants.identity = "salesden_user"`
- `grants.voice.outgoing.application_sid = <your TwiML App SID>`
- `grants.voice.push_credential_sid = <your Push Credential SID>` (only if you set it)

## Notes

- `.env` is **never** committed and never read by Claude. Only `.env.example` exists in source.
- In `NODE_ENV=development`, Twilio webhook signature validation is skipped (ngrok rewrites headers, breaking validation).
- CORS is wide open (`*`) for development. Restrict before any real deployment.
