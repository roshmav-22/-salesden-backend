/**
 * SalesDen Mobile — Twilio Voice backend
 *
 * Three endpoints:
 *   GET  /token            → Twilio Access Token (JWT) for the requesting identity
 *   POST /voice            → TwiML webhook called by Twilio for outbound + inbound routing
 *   POST /status-callback  → Twilio call lifecycle events (logged)
 *
 * Run:  npm start         (after `cp .env.example .env` and filling in real values)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_PUSH_CREDENTIAL_SID,
  TWILIO_PHONE_NUMBER,
  BACKEND_PORT = 3000,
  NODE_ENV = 'development',
} = process.env;

// Fail fast if required Twilio creds are missing — better than confusing 500s later.
const required = {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_PHONE_NUMBER,
};
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`[fatal] ${k} is not defined in .env`);
    process.exit(1);
  }
}

const app = express();
app.use(cors({ origin: '*' })); // dev-only; tighten before any real deploy
app.use(express.urlencoded({ extended: false })); // Twilio webhooks send form-urlencoded
app.use(express.json());

// ---------- GET /token ----------
app.get('/token', (req, res) => {
  const identity = (req.query.identity || 'salesden_user').toString();

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    pushCredentialSid: TWILIO_PUSH_CREDENTIAL_SID || undefined,
    incomingAllow: true,
  });

  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY_SID,
    TWILIO_API_KEY_SECRET,
    { identity, ttl: 3600 } // 1 hour
  );
  token.addGrant(voiceGrant);

  res.json({ identity, token: token.toJwt() });
});

// ---------- POST /voice ----------
// Twilio webhook — called by Twilio Cloud (NOT by the mobile app directly).
// Two cases:
//   1. Outbound: mobile SDK initiates call → Twilio POSTs here with `To=+91...` → return <Dial><Number>
//   2. Inbound : someone dials our Twilio number → Twilio POSTs here with `To=+19377453209` → return <Dial><Client>
const voiceWebhookValidator = (_req, _res, next) => next();

app.post('/voice', voiceWebhookValidator, (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const response = new VoiceResponse();
  const to = (req.body.To || '').toString().trim();
  const from = (req.body.From || '').toString().trim();

  console.log(`[voice] To="${to}" From="${from}" TWILIO_PHONE_NUMBER="${TWILIO_PHONE_NUMBER}"`);

  // Outbound: app passes a contact's phone number as `To`.
  // Inbound: someone calls our Twilio number, so `To` == TWILIO_PHONE_NUMBER — route to client.
  const isOutbound = /^\+\d{6,}$/.test(to) && to !== TWILIO_PHONE_NUMBER;
  console.log(`[voice] isOutbound=${isOutbound}`);

  if (isOutbound) {
    // Outbound: mobile dialing a real phone number
    const dial = response.dial({
      callerId: TWILIO_PHONE_NUMBER,
      answerOnBridge: true,
      action: '/status-callback',
    });
    dial.number(
      {
        statusCallback: '/status-callback',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      },
      to
    );
  } else {
    // Inbound: external phone calling our Twilio number → ring the registered client
    const dial = response.dial({
      callerId: TWILIO_PHONE_NUMBER,
      answerOnBridge: true,
      action: '/status-callback',
    });
    dial.client(
      {
        statusCallback: '/status-callback',
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      },
      'salesden_user'
    );
  }

  res.type('text/xml').send(response.toString());
});

// ---------- POST /status-callback ----------
app.post('/status-callback', (req, res) => {
  const { CallSid, CallStatus, From, To, Direction, Duration } = req.body;
  console.log(
    `[status] sid=${CallSid} status=${CallStatus} dir=${Direction} from=${From} to=${To} duration=${Duration || '-'}`
  );
  res.type('text/xml').send('<Response/>');
});

// ---------- Health check ----------
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'salesden-backend', env: NODE_ENV });
});

app.listen(BACKEND_PORT, () => {
  console.log(`SalesDen backend listening on http://localhost:${BACKEND_PORT}`);
  console.log(`Identity for token: salesden_user`);
  if (!TWILIO_PUSH_CREDENTIAL_SID) {
    console.warn(
      '[warn] TWILIO_PUSH_CREDENTIAL_SID is not set — inbound push notifications are disabled.'
    );
  }
});
