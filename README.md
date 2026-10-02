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
- `styles.css`: responsive layout, typography and print styles.
- `assets/`: icon and social preview image.
- `assets/fonts/`: self-hosted Instrument Sans variable font and SIL Open Font License.
- `.nojekyll`: serve files directly on GitHub Pages.

The site uses no analytics, cookies, form service, external font requests or JavaScript. Contact links open the visitor's email application. This website describes a research-stage project, not an available commercial service.

The four-section design uses Instrument Sans, larger body text and a concise illustrative example. The font is from the [Instrument Sans project](https://github.com/Instrument/instrument-sans), distributed through Google Fonts and converted to WOFF2 for this site. Its license is included in `assets/fonts/OFL.txt`.

## Sources

- [KnownLieBench paper](https://arxiv.org/abs/2608.26372v1)
- [KnownLieBench code](https://github.com/franciscoliu/KnownLieBench)

Research statistics refer to the study's controlled customer-service simulations. The illustrative report/evidence mismatch is not a measured product result.
