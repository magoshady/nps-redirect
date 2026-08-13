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

## 1. Generate the shared secret

```bash
openssl rand -base64 32
```

The same value goes in three places: Vercel, Apps Script, and n8n. Store it in
your password manager — it is not recoverable from any of them.

## 2. Vercel

Add the custom domain to the project:

```bash
vercel domains add nps.impressivebatteries.com.au
```

Vercel will give you a CNAME to add at your DNS provider. Add it, wait for the
certificate to issue, then confirm `https://nps.impressivebatteries.com.au`
serves the placeholder page.

Set the environment variables (Production, Preview and Development):

| Variable | Value |
| --- | --- |
| `NPS_SECRET` | the secret from step 1 |
| `NPS_APPS_SCRIPT_URL` | the `/exec` URL from step 3 |
| `NPS_BRAND_NAME` | `Impressive Electrical` |
| `NPS_BRAND_URL` | `https://impressivebatteries.com.au` |
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

Set `NODE_FUNCTION_ALLOW_BUILTIN=crypto` in the n8n environment (append to the
list if one already exists) and restart n8n. Without it the Code node cannot
sign tokens.

Add `NPS_SECRET` to the n8n environment as well.

Then in the workflow:

1. Open the Code node, set it to **Run Once for Each Item**
2. Replace the contents with `n8n-code-node-example.js`
3. Paste the contents of `email-template.html` into the `emailTemplate` constant
   where marked, and set `businessAddress` to your registered address
4. In the Send Email node, map `text` as well as `html`, and add the two
   `List-Unsubscribe` headers the Code node outputs

## 5. Email authentication

The domain move only pays off if the mail itself authenticates. Check all three
records exist for `impressivebatteries.com.au`:

```bash
dig +short TXT impressivebatteries.com.au | grep spf
dig +short TXT _dmarc.impressivebatteries.com.au
```

- **SPF** must include whatever sends the mail
- **DKIM** must be signing with a `d=` matching your From domain
- **DMARC** should be at least `p=quarantine`; `p=none` gives filters no reason
  to trust you

Test a send with [mail-tester.com](https://www.mail-tester.com) — aim for 9/10
or better before you resume the campaign.

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
