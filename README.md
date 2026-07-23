# Emovid Insights

A small Netlify app for exploring Emovid's monthly usage exports: a dashboard
of predefined questions, plus a free-text box for custom questions answered
by an LLM (Groq).

## How it works

- **Storage**: each month's CSV is stored as one entry in **Netlify Blobs**
  (no external database). Upload a new file every month from the Upload page
  — no redeploy needed.
- **Predefined questions**: a fixed catalog of queries (active users/month,
  Emovids sent/month, plan tier mix, top users, etc.) lives in
  `netlify/functions/query.js` and runs directly against your real data.
- **Custom questions**: `netlify/functions/ask.js` sends your question plus a
  description of the available fields to Groq, which returns a small JSON
  query spec (never raw numbers). That spec is executed against the real
  dataset, and the exact result is what gets phrased back into an answer —
  so the AI can't hallucinate numbers, only pick the wrong query.
- **User profile report**: the "User Profile" page (`profile.html`) looks up
  one user by email and shows a full activity write-up. All numbers (totals,
  per-type breakdown, monthly volume, top-engagement table, biggest
  mail-merge blast) are computed in `netlify/functions/_lib/profileEngine.js`
  directly from the data. Only the "How they use Emovid" theme write-up and a
  couple of extra qualitative bullets are AI-generated (`profile.js`), and
  the AI is only ever handed those exact pre-computed numbers plus the raw
  message clusters — it narrates and groups, it doesn't invent totals.

## Project layout

```
netlify/functions/
  _lib/
    csv.js         CSV parsing
    normalize.js   Raw row -> typed row, header validation
    blobs.js        Netlify Blobs read/write helpers
    dataset.js      Loads + merges all months, tiny in-memory cache
    queryEngine.js  The filter/groupBy/metric DSL executor
    profileEngine.js Exact per-user stats + message clustering
    groq.js         Groq chat completion helper
  upload.js   POST { csvText, filename, month? } -> stores a month's blob
  months.js   GET -> list of months on file
  query.js    GET ?list=1 -> catalog; POST { questionId, monthFrom?, monthTo? } -> result
  ask.js      POST { question } -> { answer, spec, result }
  profile.js  POST { email } -> { profile (exact facts), narrative (AI) }
public/
  index.html, app.js   Dashboard
  profile.html, profile.js   User profile report
  upload.html, upload.js   Upload page
  style.css
```

## One-time setup

1. **Get a free Groq API key**: https://console.groq.com -> API Keys.
2. **Push this folder to a new GitHub repo** (Netlify deploys from git).
3. **Create a Netlify site from that repo** (app.netlify.com -> Add new site
   -> Import an existing project). Build settings are already in
   `netlify.toml`, so the defaults Netlify detects should just work.
4. **Enable Netlify Blobs**: nothing to do — it's automatically available to
   functions on any Netlify site, no extra setup or add-on needed.
5. **Set the environment variable**: Site configuration -> Environment
   variables -> add `GROQ_API_KEY` with your key. (Optional: `GROQ_MODEL` to
   override the default `llama-3.3-70b-versatile`.)
6. **Password-protect the site** (since it's just you + a few teammates):
   Site configuration -> Visitor access -> Password protection -> set a
   shared password. This is enough for internal use; skip real auth.
7. Redeploy after setting the env var (Netlify only picks up new env vars on
   the next deploy/build).

## Adding a new month's data

Go to `/upload.html` on the deployed site, drag in that month's CSV export.
The app reads the `Date (UTC)` column to figure out which month it belongs
to; you can also type a month override (YYYY-MM) if a file has mixed dates.
No redeploy or git push required — it's stored immediately via Netlify
Blobs and shows up on the dashboard right away.

**Expected CSV columns** (must match Emovid's export headers exactly):
`Date (UTC), Username, E-mail, Active Plan, Plan Tier, Type of Emovid,
Emovids Sent, Liveness Status, Send Via, Send To/By, Device Type, Duration,
Emovid Link, Replies, Page Views, Plays, Observations`

## Local development

```bash
npm install
npx netlify-cli dev
```

`netlify dev` runs the functions with a local emulation of Netlify Blobs, so
you can upload a test CSV and try the dashboard/custom questions before
deploying. You'll still need `GROQ_API_KEY` set locally (e.g. in a `.env`
file — `netlify dev` reads it automatically) for the custom-question feature.

## Notes / known limits

- The query engine only supports a fixed set of filters/groupings/metrics
  (see `queryEngine.js`) — this is intentional, so the AI feature can only
  ever select a query, not fabricate a number.
- "Active users" excludes rows where the email looks like a guest
  responder (`guest-user@emovid.com` / username `(Guest)` or `Guest User`),
  since those are people replying to an Emovid, not signed-up Emovid users.
  Adjust `isGuest` in `normalize.js` if that definition needs to change.
- At a few thousand rows per month over 2-3 years (well under ~50k rows
  total), loading everything into memory per request is fine. If the
  dataset grows much larger, swap the Blobs+in-memory approach for a real
  database.
