# Truthbound

A small, accessible company website about research toward release tests for reward hacking and misleading behavior in autonomous agents.

**Website:** https://franciscoliu.github.io/truthbound/

## Local preview

Serve this directory with a static server:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/. No install or build step is needed.

## Files

- `index.html`: copy, accessible document structure and metadata.
- `demo/`: the interactive replay demo (`index.html` with the archived run data embedded, `demo.css`). It is the one page on the site that uses JavaScript; it makes no network requests beyond the shared stylesheet and font.
- `styles.css`: responsive layout, typography and print styles.
- `assets/`: icon and social preview image.
- `assets/fonts/`: self-hosted Instrument Sans variable font and SIL Open Font License.
- `.nojekyll`: serve files directly on GitHub Pages.

The site uses no analytics or external font requests. The demo uses JavaScript
for archived replays; the review page uses it to display rules and save review
choices. Contact links open the visitor's email application. This website
describes a research-stage project, not an available commercial service. The
demo replays archived test runs on one airline policy; it is not a benchmark
and not a customer deployment.

## Connect to the current backend

`runtime-config.js` defaults to `mode: 'archive'`. The static review page keeps
its original examples and stores annotations in this browser. No backend is
required for that mode.

The updated `agent-red-teaming` backend installs these assets with
`scripts/sync_truthbound_frontend.py` and serves them at `/truthbound/`. It
overrides the runtime configuration to `mode: 'live'`, using same-origin APIs:

- `GET /api/playground-runs` for current saved runs.
- `GET /api/runs/{run}/review` for rules, cases, evidence-source mappings and
  execution counts.
- `POST /api/runs/{run}/review` for review notes bound to the exact snapshot and
  revision; HTTP 409 requires reloading after a change.
- `GET /api/runs/{run}/result` for the full saved report.

Live mode does not fall back to archived examples when its API fails. Review
approvals are annotations, not automatic runtime authorization. Current run
metrics are separate from the historical demo. Reading a run makes no new model
calls; the connected workspace links to the existing pipeline for new work.

For another deployment, configure `apiBase` and `workbenchUrl` in
`runtime-config.js`, and provide the deployment's authenticated API origin.
Same-origin hosting avoids additional CORS setup. Never embed provider keys or
passwords in frontend configuration. Publishing the default static files alone
does not connect GitHub Pages to a local machine's backend.

The four-section design uses Instrument Sans, larger body text and a concise illustrative example. The font is from the [Instrument Sans project](https://github.com/Instrument/instrument-sans), distributed through Google Fonts and converted to WOFF2 for this site. Its license is included in `assets/fonts/OFL.txt`.

## Sources

- [KnownLieBench paper](https://arxiv.org/abs/2608.26372v1)
- [KnownLieBench code](https://github.com/franciscoliu/KnownLieBench)

Research statistics refer to the study's controlled customer-service simulations. The illustrative report/evidence mismatch is not a measured product result.
