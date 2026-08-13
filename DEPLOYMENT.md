# Deployment

Setup for the rebuilt NPS flow. Work through it in order — the shared secret
has to exist before anything else will work.

## What changed and why

Two problems drove this rebuild.

**Phantom zero scores.** Recording a vote used to happen on a `GET` request.
Mail security scanners (Defender Safe Links, Proofpoint, Mimecast) fetch every
link in an email *and* follow the links on the pages those links return, so the
scanner walked straight through the confirmation page and voted. It always
picked `0` because that was the first rating link in the email, and the old
duplicate check locked the customer out of correcting it.

**Phishing flags.** The email was sent from `impressivebatteries.com.au` but
every link pointed at `nps-redirect.vercel.app`, which then redirected to
`script.google.com`. A link domain that doesn't match the From domain, chained
through two free hosting providers, is close to a textbook phishing signature.
The old endpoint also reflected the `score` parameter into the page unescaped,
which is the kind of thing URL reputation services actively probe for.

The flow now looks like this:

```
email link  →  GET  https://nps.impressivebatteries.com.au/r?score=9&t=<token>
                    renders a confirmation page, writes nothing

confirm     →  POST https://nps.impressivebatteries.com.au/r
                    verifies the JS-injected submit token,
                    then calls Apps Script server-side
```

The customer's browser never touches `script.google.com`, and no link a crawler
can follow will record anything.

## 1. Generate the two secrets

```bash
openssl rand -base64 32   # NPS_SECRET  — signs tokens and votes
openssl rand -base64 32   # NPS_API_KEY — lets n8n request a token
```

`NPS_SECRET` goes in exactly two places: **Vercel** and **Apps Script**. It never
enters n8n.

`NPS_API_KEY` goes in **Vercel** and in an **n8n Header Auth credential**. It only
buys the ability to mint invite tokens, so it can be rotated on its own without
invalidating anything already sent.

Store both in your password manager — neither is recoverable afterwards.

## 2. Vercel + Cloudflare DNS

`impressivebatteries.com.au` is on Cloudflare (`maria.ns.cloudflare.com` /
`morgan.ns.cloudflare.com`), so the DNS record goes there, not at your registrar.

**In Vercel:** project → **Settings → Domains** → enter
`nps.impressivebatteries.com.au` → **Add**. Vercel shows a CNAME target,
usually `cname.vercel-dns.com`. Use whatever it displays.

**In Cloudflare:** select the domain → **DNS → Records → Add record**

| Field | Value |
| --- | --- |
| Type | `CNAME` |
| Name | `nps` |
| Target | the value Vercel gave you |
| Proxy status | **DNS only (grey cloud)** |
| TTL | Auto |

> **The proxy must be off.** Cloudflare's orange-cloud proxy in front of a
> Vercel domain causes certificate issuance to fail and can produce redirect
> loops, because both platforms try to terminate TLS. Click the orange cloud
> until it turns grey.

Propagation is usually under a minute. Check with:

```bash
dig +short nps.impressivebatteries.com.au
```

Vercel's domain page will move to **Valid Configuration** once it sees the
record and issues the certificate.

Set the environment variables (Production, Preview and Development):

| Variable | Value |
| --- | --- |
| `NPS_SECRET` | the signing secret from step 1 |
| `NPS_API_KEY` | the API key from step 1 |
| `NPS_APPS_SCRIPT_URL` | the `/exec` URL from step 3 |
| `NPS_PUBLIC_URL` | `https://nps.impressivebatteries.com.au` |
| `NPS_BRAND_NAME` | `Impressive Electrical` |
| `NPS_BRAND_URL` | `https://impressiveelectrical.com.au` |
| `NPS_SUPPORT_EMAIL` | `support@impressivebatteries.com.au` |

```bash
vercel env add NPS_SECRET production
vercel env add NPS_APPS_SCRIPT_URL production
# ...and so on
vercel --prod
```

## 3. Apps Script

1. Open the Google Sheet → **Extensions → Apps Script**
2. Replace the contents with `google-apps-script.js`
3. **Project Settings → Script Properties → Add script property**
   - Property: `NPS_SECRET`
   - Value: the secret from step 1
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the `/exec` URL into Vercel as `NPS_APPS_SCRIPT_URL`, then redeploy Vercel

The sheet gains two columns, `Revisions` and `Original Score`. Existing sheets
are widened automatically on the next write.

> A new deployment gets a new URL. Use **Manage deployments → Edit** on the
> existing deployment if you would rather keep the current one.

## 4. n8n

No secret and no `crypto` module are needed in n8n. Code nodes cannot read
credentials, so the workflow asks Vercel to mint the token over HTTP using an
API key held in a proper credential.

The workflow becomes:

```
[ Customer Data ] → [ Get NPS Token ] → [ Prepare NPS Email ] → [ Send Email ]
                     HTTP Request         Code node
```

**Create the credential** — **Credentials → New → Header Auth**

| Field | Value |
| --- | --- |
| Credential name | `NPS Token API` |
| Name | `x-api-key` |
| Value | the `NPS_API_KEY` value from step 2 |

n8n encrypts this at rest and redacts it from logs and workflow exports.

**Add the HTTP Request node**, named exactly `Get NPS Token`:

| Setting | Value |
| --- | --- |
| Method | `POST` |
| URL | `https://nps.impressivebatteries.com.au/api/token` |
| Authentication | Generic Credential Type → Header Auth → `NPS Token API` |
| Send Body | on, JSON |

```json
{
  "customer": "{{ $json.customer_id }}",
  "email":    "{{ $json.customer_email }}",
  "record":   "{{ $json.record_id }}"
}
```

It returns `token`, `expiresAt` and a `ratingUrls` map for scores 0-10.

**Then the Code node:**

1. Set it to **Run Once for Each Item**
2. Replace the contents with `n8n-code-node-example.js`
3. Set `CUSTOMER_SOURCE_NODE` to the name of the node holding customer details
4. Paste the contents of `email-template.html` into the `emailTemplate` constant
   where marked, and set `businessAddress` to your registered address
5. In the Send Email node, map `text` as well as `html`, and add the two
   `List-Unsubscribe` headers the Code node outputs

**Rotating the API key:** change `NPS_API_KEY` in Vercel, redeploy, update the
credential. Tokens already in customers' inboxes keep working, because they are
signed with `NPS_SECRET`, which hasn't changed.

## 5. Email authentication

The domain move only pays off if the mail itself authenticates. Current state
of `impressivebatteries.com.au`:

```
SPF    v=spf1 include:_spf.google.com ~all
DMARC  v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:rodrigo@impressivebatteries.com.au
```

DMARC is in good shape. **SPF authorises Google Workspace and nothing else**,
and DMARC is at `p=quarantine` — so any survey mail that leaves through a
different server fails authentication and gets quarantined or flagged.

So the question that decides this: **how does the n8n Send Email node connect?**

- **Google Workspace SMTP** (`smtp.gmail.com`, or the Gmail node) — nothing to
  do. SPF and DKIM already align.
- **Anything else** (SendGrid, Mailgun, Postmark, Amazon SES, a VPS running
  Postfix, n8n's own SMTP) — mail is failing DMARC today. You must:
  1. add that provider to SPF, e.g.
     `v=spf1 include:_spf.google.com include:sendgrid.net ~all`
  2. set up DKIM with that provider and publish the CNAME/TXT it gives you in
     Cloudflare, so the `d=` domain aligns with `impressivebatteries.com.au`

Check the `rua` reports at `rodrigo@impressivebatteries.com.au` — DMARC
aggregate reports name every IP sending as your domain and will tell you
directly whether the survey mail is passing.

Then test a send with [mail-tester.com](https://www.mail-tester.com) — aim for
9/10 or better before you resume the campaign.

## 6. Verify

Unit tests, no deployment needed:

```bash
npm test
```

Then run the scanner probe against the live deployment. It replays the exact
crawl that was recording zeros:

```bash
NPS_URL=https://nps.impressivebatteries.com.au \
NPS_SECRET=<the secret> \
npm run verify:scanner
```

Every check must pass. Add `--write` to also verify the happy path — that
records one row for a probe customer, which you should then delete.

## Rollout notes

**Links in already-delivered emails will stop working.** They point at the old
host and carry no token, so they now show "That link looks incomplete". This is
deliberate: those are the links currently generating false zeros. If you need
that window covered, send the affected customers a fresh survey.

**Clean up the existing data.** Any response that arrived without a human
confirming it is suspect. Zeros are the ones to look at:

```
=QUERY('NPS Responses'!A:J, "select A,C,D,H where B = 0 order by A desc")
```

Cross-check those against customers you've spoken to. There is also a
`SCANNERTEST` row from diagnosing this — delete it.
