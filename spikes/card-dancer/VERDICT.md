# Verdict — can cards read as a dancing woman?

**Question.** At phone size (390 × 844), does a figure built out of playing cards read as a
woman dancing a salsa step — clearly enough to be charming, and without landing in the uncanny
valley or looking like a pile of cards?

## Decision

The spike's recommendation was **abandon**. The owner, who is the audience for this app,
watched the loop and overruled it: the card woman is funny and charming enough to ship, and
the audience is one person. It ships as-is; ticket 06 does the integration. The costs below
are accepted with that decision, not argued away: a 265 KB gzipped dependency in an offline
app, and no device frame-rate number yet.

**The answer the spike found: no, not as a dancer.** A figure wrapped in cards does read as a
woman — the skirt of fanned cards, the narrow waist and the Queen of Hearts for a head are
immediately legible, and at t = 2 s the still is genuinely charming. What does not read is the
*dance*. Across the four-second loop the silhouette barely changes: eight frames sampled at
half-second intervals contain about two distinct poses (`shots/queen-loop.png`). The salsa
step, the weight shift and the hip rotation all happen along the camera axis, so from the front
the figure stands still and waves one arm. The two things that would fix that — a different
camera angle and a rig whose legs separate — are a redesign of the rig and the choreography,
not a polish pass, and there is no evidence yet that the redesign works. On the ticket's own
rule, the cheaper ideas on the map carry the feature.

## What was built

`index.html` + `main.js` + `figure.js` + `motion.js` + `cards2d.js`, plus vendored Three.js.
A 19-bone Object3D rig (hips, spine, chest, neck, head, two arms, two legs, hands and feet),
each bone dressed in card-shaped planes using the app's own card art. Three card treatments
(`shell`, `plume`, `ribbon`) plus `queen`, the best-case treatment built for the verdict:
tangent cards wrapped around the bones, a two-tier fan skirt, a queen card head and card hair.
The dance is eight hand-authored keys over 4.0 s at 120 BPM in `motion.js`, sampled with a
periodic Catmull-Rom so the loop is smooth. 513 instanced cards, 33 draw calls, ~2.1k triangles.
Deterministic screenshots via `?t=&dist=&style=&cards=&head=&debug=&ui=0`.

## Evidence, at phone size

| File | What it shows |
| --- | --- |
| `shots/queen-loop.png` | Eight frames, t = 0 to 3.5 s, side by side. The motion problem in one image. |
| `shots/queen-closeup.png` | The figure at its best: skirt, waist, queen head, hands at 12 cards per bone. |
| `shots/queen-t0.png` … `queen-t3.5.png` | The loop, individually. |
| `shots/queen-debug.png` | Skeleton under the cards, to show the pose is not the rig's fault. |
| `shots/style-shell.png` | The naive treatment: cards scattered around each bone. Reads as debris. |
| `shots/style-plume.png`, `shots/style-ribbon.png` | The other two treatments. Neither is better. |
| `shots/doll-t0.png`, `doll-t1.5.png`, `doll-t2.5.png` | The flat 2D cutout alternative, same keyframes. |

All frames are 390 × 844 CSS px, `ui=0`, `dist=3.35`, `cards=8`, `head=1`.

## The cheap alternative, measured

`doll.html` + `doll.js` build the same figure as flat cards on a 2D canvas, driven by the same
`motion.js` keys, in about 300 lines and with no dependency. It is worse: card pieces layered
flat lose the depth and lighting that make the 3D figure read as a body rather than a fan of
cards, and the depth-axis step has to be reinterpreted as a sideways step because a flat view
cannot show it. The conclusion is not "2D is better because it is cheap". It is that the idea
does not have a cheap version that looks as good, and the expensive version does not dance.

## Cost

| Item | Number |
| --- | --- |
| Vendored Three.js r170, raw | 1,314,681 bytes |
| Vendored Three.js r170, gzip -9 | 264,941 bytes |
| The entire app script today, gzip -9 | ~10,400 bytes |
| 3D figure at 8 cards per bone | 513 cards, 33 draw calls, 2.1k triangles |
| 3D figure at 12 cards per bone | 1,039 cards, 33 draw calls, 4.2k triangles |

The dependency alone is about 25× the weight of the whole app's JavaScript, for an app whose
selling point is that it installs and runs offline with nothing to download.

**Frame rate: unknown.** The only measurement available was headless Chromium with a software
renderer (4–9 fps), which says nothing about an iPhone. No device was available in this spike.

## Effort to productionise, if it were adopted anyway

- 3D dancer as built: **8 to 12 days**. Rig and card dressing 3–4, choreography 3–4, camera and
  framing 1, integration with the existing celebration seam and the win-card handover 1–2,
  device performance and fallbacks 1–2. Plus the payload above.
- Flat 2D cutout dancer: **3 to 4 days** to reach the quality of the 3D figure, 1 day for what
  was built here.

## Still unknown

- Whether a three-quarter or side-on camera makes the legwork read; not tested, about one day.
- Real iPhone and iPad frame rate and memory for 500–1,000 instanced cards plus Three.
- Whether the dance reads better in motion than in stills. The strip suggests not: with only two
  distinct silhouettes per loop, more frames will not add motion.
- Whether a WebGL canvas can hand over to the existing 2D win card cleanly.
- How it behaves with `prefers-reduced-motion` and with a tap-to-skip part way through.

## What this hands back to the map

The strongest asset the spike produced is a still: the Queen of Hearts as a card woman, in a fan
skirt. It is worth keeping as a possible *win card illustration* — one image, no animation, no
dependency, about a day of work. That is a different ticket and it is not this round's scope.

If the dancer is ever revisited, the first experiment is the camera, not the cards.

Nothing from this spike is on `master` or in the app's service-worker shell.
