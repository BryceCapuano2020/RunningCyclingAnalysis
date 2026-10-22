# Deploying RunningCycling to Cloudflare

The deployment runs on Cloudflare Workers Free and D1 Free with a dedicated R2 Standard bucket. It
does not enroll in Workers Paid. The Worker serves the built web app as static files and the API under
`/api`, so both share one origin: `https://<worker>.<your-subdomain>.workers.dev`. Session cookies
work without a custom domain. Static asset requests are free; API requests and database queries use
the free plan's hard quotas. Requests and queries fail when those quotas are exceeded, rather than
automatically upgrading the account. This is a usage-capped deployment, not a guarantee of
continuous availability.

Names used below (from `apps/api/wrangler.toml`):

- Worker: `rca-api`. Its public address is `https://rca-api.<your-subdomain>.workers.dev`. Wherever
  this guide says `<worker-url>`, use that address, with no trailing slash.
- D1 database: `rca`.
- R2 bucket: `rca-files` (private and dedicated to this application).

Original activity files stay on the user's device by default. Users can opt in to retaining
originals in R2, subject to per-user limits and app-wide R2 operation and byte budgets. Those code
limits apply only to requests made through this Worker; they do not constrain other clients,
dashboard access, or direct bucket/API usage. R2 may be billed above its free allowance, so these
limits do not guarantee zero charges.

Run the npm commands from the repository root. Run the `wrangler` commands from `apps/api`.

## 1. Prerequisites

- Node.js 22 (the version in `.nvmrc`). Check with `node --version`.
- A Cloudflare account on the Workers Free plan: <https://dash.cloudflare.com/sign-up>
- A Google account with access to the existing RunningCycling Google Cloud project and OAuth client.
- The repository, with dependencies installed:

  ```bash
  npm ci
  npm exec -w @rca/web -- playwright install chromium webkit
  ```

## 2. Log in to Cloudflare

```bash
cd apps/api
npx wrangler login
```

A browser window opens. Approve Wrangler, then check with `npx wrangler whoami`.

## 3. Create the database and bucket

For the existing deployment, reuse the provisioned `rca` database and the ID already recorded in
`apps/api/wrangler.toml`. Do not run `d1 create` again. Only create a database when setting up a
different Cloudflare account or replacing the current database:

```bash
npx wrangler d1 create rca
```

When creating a replacement, the output contains a `database_id`. Set `database_id` under the `DB`
binding in `apps/api/wrangler.toml` to that printed value.

Create the dedicated Standard-class R2 bucket used by the `FILES` binding:

```bash
npx wrangler r2 bucket create rca-files --storage-class Standard
```

Keep this bucket private and dedicated to this application. The application budgets cannot limit
manual dashboard operations or requests made by other credentials.

The deploy command checks that this is no longer the all-zero placeholder and stops with a clear
error if it is. This avoids publishing a Worker that cannot connect to D1. The R2 bucket must also
exist before deploying because production binds it as `FILES`.

Create the tables in the production database:

```bash
cd ../..
npm run db:migrate:remote -w @rca/api
```

Migrations only ever move forward, so run this again after each new migration file is added. The
command asks for confirmation interactively and still captures a backup when run non-interactively.

## 4. First deploy

The existing account already uses `nutritioncoachapp.workers.dev`, and the checked-in `APP_URL`
already points to `https://rca-api.nutritioncoachapp.workers.dev`. Do not rename the subdomain; an
unrelated Worker already uses it. No address-discovery bootstrap is needed for this known origin;
use the URL in section 5, then deploy normally in section 7 after the Google client and secrets are
configured.

For a new Cloudflare account or a new origin that is not yet known, the bootstrap command builds the
web app into `apps/web/dist` and deploys it to discover the public address. It allows the
not-yet-configured `APP_URL`; sign-in will not work yet:

```bash
npm run deploy:bootstrap
```

If the new account has no `workers.dev` subdomain, Wrangler may ask you to register one. The output
ends with a line like:

```
Published rca-api
  https://rca-api.<your-subdomain>.workers.dev
```

Copy that address. It is your `<worker-url>`. Sign-in does not work yet, which is expected.

## 5. Create the Google OAuth client

The current Cloudflare account already has a RunningCycling Google Cloud project and web OAuth
client. Reuse them; do not create a duplicate project or client. The current production callback
has been smoke-tested only with the owner's Google account. For a new Cloudflare account, follow
these steps to create a project and client in the Google Cloud Console at
<https://console.cloud.google.com/>.

1. **Create a project.** Use the project picker in the top bar, then **New project**. Name it
   `RunningCycling`.
2. **Set up the Google Auth Platform.** Open **Google Auth Platform** from the left menu. If it
   shows a **Get started** button, click it.
   - **Branding:** app name `RunningCycling`, user support email your own address, developer
     contact email your own address.
   - **Audience:** choose **External**. Leave the publishing status as **Testing** while testing.
     Add the accounts you will test under **Test users**. Google documents an exception: when an
     External app requests only the basic identity scopes `openid`, `email`, and `profile`, other
     Google users can also access it while it is in Testing, but they see a testing warning. See
     Google's [OAuth app state guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview).
   - **Data Access:** add the scopes `openid`, `.../auth/userinfo.email` and
     `.../auth/userinfo.profile`. These are the `openid`, `email` and `profile` scopes the API
     asks for.
3. **Create the client.** Open **Clients**, then **Create client**.
   - Application type: **Web application**. Name: `RunningCycling web`.
   - **Authorized JavaScript origins**, add both:
     - `<worker-url>` (for example `https://rca-api.<your-subdomain>.workers.dev`)
     - `http://localhost:5183`
   - **Authorized redirect URIs**, add both. They must match exactly:
     - `<worker-url>/api/auth/google/callback`
     - `http://localhost:5183/api/auth/google/callback`
   - Google only accepts `http://` for `localhost`. Origins take no path, so do not add
     `/api/...` to them.
4. **Copy the credentials.** Click **Create**. Copy the **Client ID** and the **Client secret**.
   Treat the secret like a password and never commit it.

## 6. Store the Google credentials as Worker secrets

```bash
cd apps/api
npx wrangler secret put GOOGLE_CLIENT_ID
```

Paste the Client ID and press Enter. Then:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Paste the client secret and press Enter. Secrets are encrypted by Cloudflare, are not stored in
the repository, and survive later deploys.

## 7. Set APP_URL and deploy again

Open `apps/api/wrangler.toml` and set the `[vars]` value:

```toml
[vars]
ENVIRONMENT = "production"
APP_URL = "https://rca-api.<your-subdomain>.workers.dev"
```

Use your `<worker-url>` with no trailing slash. The API sends Google back to
`APP_URL` + `/api/auth/google/callback`, and it sends the browser to `APP_URL` after sign-in.

For an External app in Production, Google's OAuth policy requires a public homepage describing the
app and linking to its privacy policy and terms of service, hosted on a verified domain you own.
Google's [OAuth policies](https://developers.google.com/identity/protocols/oauth2/policies) and
[branding requirements](https://support.google.com/cloud/answer/15549049?hl=en) describe these
requirements. The current `workers.dev` deployment remains in Testing; only the owner's Google
account has been used for the live sign-in smoke test. A public launch with verified branding still
requires the public policy pages and domain verification to be completed.

Deploy again from the repository root:

```bash
cd ../..
npm run deploy
```

Commit the `wrangler.toml` change. Each deploy writes the `[vars]` values from that file, and the
GitHub workflow in section 10 reads the same file from the repository.

## 8. Smoke test

1. Health check. It should print `{"status":"ok"}`:

   ```bash
   curl -i <worker-url>/api/health
   ```

2. Open `<worker-url>` in a browser. The app loads.
3. Click **Sign in with Google** and choose your Google account. With only the basic identity
   scopes configured above, Google may display a Testing notice. Confirm that the requested
   scopes and destination match this app. An unexpected unsafe-app screen or broader permissions
   should prompt a review of the OAuth configuration before continuing.
4. Open `<worker-url>/api/me` in the same browser. It should show your profile as JSON. Without
   signing in it returns `401`.

If sign-in fails with `redirect_uri_mismatch`, the redirect URI in the Google client does not match
`<worker-url>/api/auth/google/callback` exactly, or `APP_URL` in `wrangler.toml` is wrong.

Activity digests are derived when an activity is imported; deployment and database migrations do not
recompute existing rows. The JSON `modelRevision` tracks analysis changes independently of the
`digest_version` schema column. Revision 2 excludes older digests from current analysis and reports
them as outdated. Re-importing the original FIT file upgrades that row only when its SHA-256 matches;
the API preserves its id, original-file metadata and quota reservation. When original files are
retained in R2, the browser can download and reprocess them. Otherwise, original files stay on the
device and must be re-imported to reprocess. Rows without a matching original file remain safely
excluded until that file is supplied; no mass reset or broad library deletion is required. Test
this recovery with a saved library containing both retained and missing originals before release.

## 9. Local development with real Google sign-in

Local development uses the dedicated `apps/api/wrangler.local.toml` configuration with local D1
and R2 storage, so it never touches production data or creates Cloudflare resources. Production
uses `wrangler.toml` with the provisioned D1 database and R2 bucket. Local development needs its
own `.dev.vars` file, which Git ignores.

One-time setup:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Edit `apps/api/.dev.vars`, and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. You can use the
same client as production, because the `http://localhost:5183` redirect URI is already registered.
The file also sets `ENVIRONMENT=development` and `APP_URL=http://localhost:5183`, which override the
production values while you develop. Local Wrangler scripts select `wrangler.local.toml` so
retained-file tests use Miniflare's local R2.

Then, from the repository root:

```bash
npm run build                                  # wrangler dev serves apps/web/dist, so build once
npm run db:migrate:local -w @rca/api           # create the local tables
```

Run two terminals from the repository root:

```bash
# Terminal 1: the API, on http://localhost:8787
npm run dev:api

# Terminal 2: the web app, on http://localhost:5183
npm run dev -w @rca/web -- --port 5183 --strictPort
```

Open <http://localhost:5183> and sign in. Vite forwards `/api` to port 8787, so the session cookie
stays on one origin, as it does in production.

Rebuild the web app with `npm run build` if you want `wrangler dev` to serve the latest build. The
Vite dev server does not need this.

## 10. Deploy from GitHub Actions (optional)

The workflow `.github/workflows/deploy.yml` runs only when you start it by hand: in the GitHub
repository, open **Actions**, choose **Deploy**, select **main**, then **Run workflow**. It runs
the complete reusable CI gate first, downloads the exact verified web build, applies remote
migrations and deploys the Worker. It never deploys on a push or from another branch. The
`production` GitHub environment can be configured with reviewer rules in repository settings.

Create a Cloudflare API token:

1. In the Cloudflare dashboard, open **My Profile**, then **API Tokens**, then **Create Token**,
   then **Create Custom Token**.
2. Add these permissions, all at the **Account** level:
   - **Workers Scripts**: Edit
   - **D1**: Edit
   - **Account Settings**: Read
3. Under account resources, select only your account. Create the token and copy it. It is shown
   once.

Find your account ID: in the dashboard, open **Workers & Pages**. The **Account ID** is in the
right-hand panel.

Add both values as repository secrets: in GitHub, open **Settings**, then **Secrets and
variables**, then **Actions**, then **New repository secret**. Create `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`.

Token permission names change from time to time. If a run fails with a permission error, the error
names the permission to add.

## 11. Costs and hard free-plan limits

Figures below are the documented free-plan allowances at review time. See
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) and
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/), plus each storage
product's pricing page, before relying on them.

| Service       | Free-plan limit                                                                                                                                     | What the app uses                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workers       | 100,000 requests per day; 10 ms CPU per invocation; 128 MB memory; 50 subrequests per invocation.                                                   | Every `/api` call                                                                                                                                                             |
| Static assets | Requests and storage are free; asset delivery does not use the Worker request quota.                                                                | The web app's HTML, JavaScript, CSS and images                                                                                                                                |
| D1            | 5 million rows read per day; 100,000 rows written per day; 5 GB total storage.                                                                      | Accounts, sessions, profiles and activity digests                                                                                                                             |
| R2            | Standard free allowance includes 10 GB-month storage, 1 million Class A and 10 million Class B operations per month; usage beyond it can be billed. | Optional original-file retention; app code applies a 4 GiB lifetime PUT charge budget (at least 64 KiB per attempt) and 100,000 chargeable operations per UTC calendar month. |

Cloudflare documents that Workers Free and D1 Free operations fail when daily usage limits are
exceeded; D1 queries stay unavailable until the daily reset and writes also fail if the storage cap
is reached. This setup does not enroll the account in Workers Paid. The application-level R2
budgets reserve bytes and operation capacity before requests. Failed PUTs and retries retain their
charges; a fresh lifetime ledger can admit at most 65,536 PUT attempts and fewer for larger files.
The limits cover only traffic handled by this application. They cannot cap direct bucket access,
other clients, dashboard actions, or provider-side charges. Keep the bucket private and dedicated,
and monitor usage; R2's free
allowance is not a hard account spending cap. See
[Workers pricing and limits](https://developers.cloudflare.com/workers/platform/pricing/), [D1
pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [Static Assets billing and
limits](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) for
current details and [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Monitor usage in the dashboard under **Workers & Pages**, **D1**, and **R2**.

Google sign-in with the basic `openid email profile` scopes has no usage charge for this app.

## 12. Roll back a deploy

Every deploy creates a version. To list them and roll back:

```bash
cd apps/api
npx wrangler deployments list
npx wrangler rollback                 # back to the previous version
npx wrangler rollback <version-id>    # or to a specific version from the list
```

A rollback changes only the Worker code and the web app. It does not undo database migrations, so
data written by a newer version stays. If a migration is the problem, fix forward with a new
migration file and run `npm run db:migrate:remote -w @rca/api`.

## 13. Delete everything

This is permanent. All accounts, sessions, activity data and any kept files are lost, and nothing
can be recovered. Each step asks for confirmation.

```bash
cd apps/api
npx wrangler delete                   # removes the Worker, its secrets and its address
npx wrangler d1 delete rca            # deletes the database
```

Empty the R2 bucket before deleting it: in the dashboard, open **R2**, select the bucket, and delete
its objects. Then:

```bash
npx wrangler r2 bucket delete rca-files
```

Then, in the Google Cloud Console, delete the OAuth client under **Google Auth Platform**, then
**Clients**, or shut down the whole project under **IAM & Admin**, then **Settings**.

Finally, delete the GitHub repository secrets and the Cloudflare API token if you created them, and
delete `apps/api/.dev.vars` on your machine.

See [PRODUCTION.md](PRODUCTION.md) for rate limits, model upgrades, recovery, diagnostics and
release evidence still required. Normal `npm run deploy` includes `npm run verify:release`.

## Reference

| Command                                               | What it does                                         |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `npm run deploy`                                      | Runs release verification, then deploys the Worker   |
| `npm run db:migrate:remote -w @rca/api`               | Applies migrations to the production D1 database     |
| `npm run db:migrate:local -w @rca/api`                | Applies migrations to the local D1 database          |
| `npm run dev:api`                                     | Local API on port 8787                               |
| `npm run dev -w @rca/web -- --port 5183 --strictPort` | Local web app on port 5183, which proxies `/api`     |
| `npm run build`                                       | Production build of the web app into `apps/web/dist` |
