# Music video treatment

The second film, `?film=mv`: **quiet outside, epic inside.** Outside, in LABAS, the quiet
one is small, at the edge of a loud grey world drawn in cool hairlines. The camera keeps
diving into the firefly in their chest and coming out in LOOB, the world inside: a
luminous raymarched sea under floating islands, fog, thousands of fireflies, where every
big move of the film happens. At GITNA the inside breaks out and floods the outside.

It shares the song, the analysis, the lyric timing and the LIWANAG curve with the lyric
video ([TREATMENT.md](TREATMENT.md)), and none of its drawings: every shot is a 3D world
with a moving camera, shot through an adaptive motion-blur shutter
([ENGINE.md](ENGINE.md#the-music-video-filmmv)).

## Rules

- **Warm light only comes from inside.** LABAS is grey, ash and paper hairlines on night.
  The only warm things in it are the self's chest light and whatever leaks out of it; its
  brightness is `LIWANAG` (`mv/timeline.ts`), the lyric video's arc, 0.02 until the first
  *“May sarili rin akong mundo”* and 1.00 on the last *“ako”*. LOOB is gold from the start:
  it is the light seen from inside.
- **The edge until GITNA.** In LABAS the self stands at the rim of the crowd, the yard, the
  hall. The spotlight hunts the centre. From DAMI III the light finds them and they stay;
  at GITNA they walk into the middle.
- **Kinetic hero words, not subtitles.** A handful of words per scene, word-synced and big,
  standing in the world: flown past, stamped, shattered, orbited. Archivo extra-condensed
  for the loud world and the hero words; Fraunces italic for the self's own quiet ones
  (*huminga*, *lihim*, *dahan-dahan lang*, *pero ako ’to*).
- **The cut is the move.** Every cut is hard, on a beat, on a frame boundary; the energy is
  in the camera (whips, crash zooms, cranes, corkscrews), never in a crossfade or a post
  shake.
- **The chorus returns three times.** DAMI NG TAO and SULOK (and SIMULA NOON twice): v1 in
  LABAS; v2 smash-cut on the downbeats against its LOOB twin; v3 at dawn, lit, the self
  found and staying.

## Cut grammar

| cut | outgoing shot | incoming shot |
|---|---|---|
| **DIVE** | pushes into the chest light until gold (`DIVE_COL`) fills the frame | opens out of the same gold |
| **FLARE** | a short dive off a flash | a fast open |
| **IMPACT** | ends on the beat | opens on a flash, chromatic kick and shake (`impact()`) |
| **CONT** | LOOB into LOOB: the next shot carries on the same camera, sea and flies | |
| **PLAIN** | a straight cut | |

## Scenes

| # | scene | window (s) | in | world | action | hero words |
|---|---|---|---|---|---|---|
| 00 | SIMULA | 0–10.70 | | LOOB→LABAS | One spark in the dark, chased: a long corkscrew through dust that thickens with the build, whipping in front of it and back behind it as the letters of TAHIMIK flash past. On the downbeat at 9.40 the camera crashes out ×50: it was the chest light of the quiet one all along, standing at the edge of a line-art world that draws itself outward from them. | TAHIMIK |
| 01 | GILID | 10.70–19.17 | PLAIN | LABAS | A schoolyard whose centre is a ring of six laughing friends. The camera spirals out from among them, passes close behind the self standing still by the fence, and cranes over the ring. On *“sumasabay”* the whole yard sways as one; the self doesn't. | GILID · NAKIKINIG |
| 02 | ALON | 19.17–30.35 | IMPACT | LABAS | The laughter becomes a line-mesh ocean. We skim the swell as HAHAs pop on the crests, ride a giant wave to its crest, whip down to a rock on the shore with a light on it; on the downbeat the wave curls over the self in slow motion as the camera whips round. The light survives; we dive into it. | HAHA · BATO |
| 03 | LALAMUNAN | 30.35–41.55 | DIVE | the body, cool | Up the throat. SAGOT bursts out of the light and whooshes past the lens; the letters jam at a knot that clenches on every beat. On *“Nagpapaliban”* it slams shut and MAMAYA NA is stamped on it; on *“naman”* the camera is sucked back down in a corkscrew; laughter echoes down it as rings. | SAGOT · MAMAYA NA |
| 04 | DAMI NG TAO | 41.55–51.95 | IMPACT | LABAS | Crane up out of a crowd of thousands to the horizon; a spotlight hunts it beat by beat. On *“sentro”* it slams onto the empty clearing; on *“eksena”* a whip pan finds the self at the rim, and they step out of the light. | SENTRO · EKSENA |
| 05 | SULOK | 51.95–61.67 | PLAIN | LABAS | One unbroken move behind the self as they walk off the rim into a corner, turn, sit and hug their knees; a push-in that breathes on *“huminga”* while the crowd drains away figure by figure; the walls recede into a vast quiet. | *huminga* · SULOK |
| 06 | SIMULA NOON | 61.67–72.03 | PLAIN | memory | A corridor of floating line prints, 2026 back to 2008, one per beat, the self at the edge of every group and ringed in gold as we pass. On *“noon”* the camera flies through the O into the last photograph. | NOON |
| 07 | SARILING MUNDO | 72.03–82.67 | PLAIN | LABAS→LOOB | A loud crowd, a level meter over every head; the self's gauge reads 0.00 through *“sumisigaw”*. A crash into the chest light, gold, and on *“May sarili rin”* it bursts out into LOOB: the sea, the islands, rising fireflies that settle into MUNDO. An epic crane up. | MUNDO |
| 08 | BULSA | 82.67–93.22 | CONT | LOOB | A pocket drawn in the sky, packed with folded notes. On *“kwento”* four hundred notes fold into paper birds and pour out; the camera punches through KWENTO and flies with the flock. One note unfolds huge, its handwriting written in light, and ILABAS rises off it; on *“nanahimik”* every note dives back into the pocket and we dive into the light. | KWENTO · ILABAS |
| 09 | ENTABLADO | 93.22–105.13 | DIVE | LABAS | Out of the gold as the self's gaze: a rush up the aisle to a line-art school stage. On *“sumikat”* the spots slam on one by one; the camera circles the stage and looks back over the dark hall to one small warm light at the back door, cranes to it, and pushes in on the smile they keep to themselves. | SUMIKAT · *lihim* |
| 10 | DAMI NG TAO · II | 105.13–115.75 | IMPACT | LABAS↔LOOB | The same camera, smash-cut on the downbeats between the crowd and its LOOB twin: a firefly where each person stands, over the sea, the self's light at the centre. | SENTRO · EKSENA |
| 11 | SULOK · II | 115.75–125.58 | PLAIN | LABAS↔LOOB | The corner against its twin, a line house on an island over the firefly sea, the move carried across every cut. | *huminga* · SULOK |
| 12 | SIMULA NOON · II | 125.58–136.08 | PLAIN | LABAS↔LOOB | The corridor against LOOB's sky, where fireflies draw the same photographs as constellations; the last is 2008, and the child's chest flares on *“noon”*. | NOON |
| 13 | SARILING MUNDO · II | 136.08–145.35 | DIVE | LOOB, cosmic | Fireflies rising off the sea assemble a constellation of the self. A corkscrew out, an orbit, a corkscrew back in through its chest star on *“mundo”*, and a fall out the far side towards the self on the sea. | MUNDO |
| 14 | ISANG HAKBANG | 145.35–168.67 | CONT | LOOB→LABAS | Behind the self on the sea. *“lakas-loob”* swells the light; *“paabante”* in slow motion as the foot lifts, and it lands on the downbeat: a camera slam and a shockwave across the sea that lifts every line of the outer world into view. Dawn; on *“dahan-dahan”* time slows and the camera cranes back until LOOB has become LABAS at daybreak. | LAKAS-LOOB · ISANG HAKBANG · DAHAN-DAHAN |
| 15 | DAMI NG TAO · III | 168.67–179.37 | IMPACT | LABAS, lit | Dawn. Fireflies leak out of the self, who now stands in the clearing; the spot hunts, lands on them on *“sentro”*, warms to gold, and they stay: the first orbit centred on them. | SENTRO · EKSENA |
| 16 | SULOK · III | 179.37–189.37 | PLAIN | LABAS, lit | The corner fills with the light leaking out of them; the walls go warm and recede into fireflies; they stand up in it. | *huminga* · SULOK |
| 17 | BUO | 189.37–200.03 | IMPACT | both | The chest bursts and every world so far comes out in pieces (a patch of wave, the throat's rings, a note, a photo frame, the stage arch), wheeling in a vortex over a disc of firefly sea. One shard slams into place per beat; TANGGAPIN crowns their head letter by letter; the vortex hangs in bullet time; on *“buo”* the flare, and BUO slams into the arch. | TANGGAPIN · BUO |
| 18 | GITNA | 200.03–210.08 | FLARE | LABAS floods | The self walks down the lane into the centre of a crowd that has turned to face them. On *“Mag-stand”* fireflies burst from the chest and a ring runs out through the crowd, tinting every line warm; on *“ako”* (LIWANAG 1.0) a second ring to the horizon, thousands of lights over the whole world, and a crane away to planet scale: one light at the centre of a little world. | MAG-STAND OUT DIN AKO |
| 19 | WAKAS | 210.08–end | CONT | quiet | The little world folds back into the one light, the far side first, while the camera comes back down to it: a single firefly in the dark, as at the start. The title under it; the last light goes out. | TAHIMIK · *pero ako ’to* |

`node scripts/mv-cues.mjs` prints the edit (every entry's window and LIWANAG), and with
`--only <scene>` the bars, lines and word times inside it.
