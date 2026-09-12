DCC Wildlife — standalone sprites for sibling plugins
=====================================================

These SVGs are EXPORTS. The source of truth is
includes/class-sprites.php; tools/export-sprites.php regenerates them and the
harness fails if a file here drifts from the registry. Do not hand-edit them —
edit the registry and re-run the exporter.

Why they exist: another DCC plugin needed the fish and drew its own, because it
could not read this repo. Reference these instead, so every DCC surface shows
the same animal.

FILES
  fish.svg    Largemouth bass (Micropterus salmoides)
  heron.svg   Great blue heron (Ardea herodias)
  egret.svg   Snowy egret (Egretta thula)

USE
  <img src=".../dcc-wildlife/assets/sprites/fish.svg" alt="" width="48" height="48">
  or inline the file. Each is a self-contained 48x48 viewBox with its own
  fills and strokes — it needs none of this plugin's CSS, and it scales
  cleanly from ~22px (a chip) to ~112px (a medallion). They are DECORATION:
  give the <img> an empty alt, or aria-hidden on an inline <svg>, and let the
  species name carry the meaning.

  Do not recolour them per surface. If a sibling needs a different treatment,
  ask for a variant here rather than filtering or overriding in CSS — one
  animal, one look, across the site.

PALETTE (measured from these three files)
  Deep teals, the drawing ink
    #17333c  darkest — outlines, eyes, the bass's lateral band
    #24464f  heron body shadow
    #3d4f46  heron legs and toes
    #5a7d8a  heron body
    #4d7d86  waterline strokes under a wading bird
    #8fa7ae  heron neck and crest plumes
  Greens, for the fish
    #2e5d46  darkest green — fins and tail
    #3a6b52  body
  Whites and pale greys
    #f4f7f2  eye highlight (fish), heron bill highlight
    #eef2ee  egret body — the white bird's body colour
    #cfdbd8  egret wing shading
    #c9d8cf  fish gill plate
  One accent
    #e8b84b  yellow — the heron's bill, the egret's feet

  The wider registry also uses #1c3a43 and #20404a (teals), plus browns,
  pinks and further greens on other species. Two rules hold across all of
  them: no stroke thinner than 1.2 units, and every sprite must still read at
  ~22px.

LICENCE
  Hand-drawn for Dora Canal Court; part of this plugin. Use freely on
  doracanalcourt.com properties.
