# X42 Switch

Central switch for the 50-bank interbank system. Banks call X42; X42 routes transfers to the receiving bank. X42 stores no customer names, KYC data or balances.

## Setup (Jebin, tonight)

1. Firebase console: create a project, enable Firestore (production mode), paste `firestore.rules` into Rules and publish.
2. Project settings → Service accounts → Generate new private key → save as `serviceAccount.json` in the repo root (never commit it).
3. `cp .env.example .env` and set `ADMIN_KEY` and `SWITCH_KEY` to long random strings (run `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` twice).
4. `npm install`

## Run locally

```bash
npm run dev          # switch on :8080
npm run mock:a       # mock ABC Bank on :9001
npm run mock:b       # mock XYZ Bank on :9002
npm run e2e          # 10 end-to-end checks, needs all three running
```

## Endpoints

Bank calls carry `x-bank-id` (e.g. `P657`) + `x-api-key`. Admin calls carry `x-admin-key`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/x42/health` | none | Switch is up |
| POST | `/x42/banks/register` | admin | `{bankId, bankName, ifsc, baseUrl?}` → returns `apiKey` once; INACTIVE until it has a `baseUrl` |
| PATCH | `/x42/banks/:bankId` | admin | Set `baseUrl` and/or `status` (`ACTIVE` needs a `baseUrl`) |
| POST | `/x42/banks/:bankId/rotate-key` | admin | Issue a new API key |
| GET | `/x42/banks` | bank | Directory of ACTIVE banks: bankId, bankName, ifsc |
| POST | `/x42/validate` | bank | `{ifsc, accountNo}` → `{valid, maskedName}` |
| POST | `/x42/transfer` | bank | `{txnId, fromIfsc, fromAccount, toIfsc, toAccount, amount}`, amount = whole paise |
| GET | `/x42/transfers/:txnId` | bank | Status; re-checks the receiver if PENDING |
| POST | `/x42/transfers/:txnId/reverse` | bank (sender) | Reverse a PENDING or SUCCESS transfer |

Transfer replies: `200 SUCCESS`, `202 PENDING` (receiver timed out, poll status), `422 FAILED` with `reason`, `409 DUPLICATE_TXN`.

## What every bank must expose

X42 calls these with header `x-switch-key: <SWITCH_KEY>`; banks must reject calls without it. `mock-bank/index.js` is the reference.

| Method | Path | Body | Reply |
| --- | --- | --- | --- |
| POST | `/interbank/validate` | `{ifsc, accountNo}` | `{valid, maskedName}` |
| POST | `/interbank/credit` | `{txnId, fromIfsc, fromAccount, toIfsc, toAccount, amount, timestamp}` | `{status: "SUCCESS"}` or `{status: "FAILED", reason}`; same txnId twice = same answer, no double credit |
| GET | `/interbank/status/:txnId` | | `{status}` |
| POST | `/interbank/reverse` | `{txnId}` | `{status: "REVERSED"}` |

Banks are identified by `bankId` (e.g. `P657`) and their full IFSC (e.g. `JEBI0D3Q8LP`: 4 letters + zero + 6 letters/digits). `txnId` must start with the sending bankId + `-`, e.g. `P657-5f2c...`. `amount` is an integer in paise (₹500 = 50000).

## Onboard banks

`banks.json` already holds all 50 banks (bankId, name, IFSC, owner) with empty `baseUrl`. Run `npm run seed` against the live switch: every bank is registered INACTIVE and its key lands in `keys.csv`. Send each person only their own key, then delete the file. When a bank shares its backend URL, activate it:

```bash
curl -X PATCH $X42_URL/x42/banks/P657 -H "content-type: application/json" -H "x-admin-key: $ADMIN_KEY" -d '{"baseUrl":"https://fleeca.onrender.com","status":"ACTIVE"}'
```

## Deploy

```bash
docker build -t x42-switch .
docker run -p 8080:8080 --env-file .env -e FIREBASE_SA_BASE64="$(base64 -w0 serviceAccount.json)" x42-switch
```

On Azure Container Apps / AWS App Runner / Cloud Run: push the image, set `ADMIN_KEY`, `SWITCH_KEY`, `FIREBASE_SA_BASE64` as secrets, expose port 8080 over HTTPS.

## Module owners

| File | Owner |
| --- | --- |
| `src/index.js`, `src/auth.js`, `src/db.js`, `Dockerfile` | Jebin |
| `src/routes/banks.js`, `scripts/seed.js` | Teammate 2 |
| `src/routes/transfer.js` (validate, transfer), `src/call.js` | Teammate 3 |
| `src/routes/transfer.js` (status, reverse), `move()` in `src/db.js` | Teammate 4 |
| `mock-bank/`, `scripts/e2e.js`, Postman collection, onboarding guide | Teammate 5 |
