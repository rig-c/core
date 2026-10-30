# Authoring a motion from key poses

**Read this when the request is a movement rather than a skeleton.** It is written
for an agent that has been handed loose part PNGs, a sentence of intent, and
between zero and N pictures of what the movement passes through, and that has to
come back with a Spine animation somebody would choose.

[AUTHORING.md](AUTHORING.md) is the file formats, the failure map and the CLI —
read it first and keep it open; this page never restates a field it documents. This
page is the part AUTHORING.md deliberately does not have: **what to put between two
poses**, when nothing anywhere has told you.

🚨 **Nothing in this document grades your output, and no instrument named here
can.** `build` says a file is valid. `render` and `preview` let you look. `pose`
reads a picture you were given. The one thing that judges a movement is a person's
eye, through `rigc vote` — which is why this recipe ends by producing candidates
rather than by producing a number. There is no pass bar for a movement in this
toolchain and this page does not invent one.

- The two spec files, field by field: **AUTHORING §1–§4**
- Named failures, and the file each one points at: **AUTHORING §5–§6**
- What the Spine editor does when nobody tells it otherwise: **AUTHORING §10**
- Reading a pose out of a picture — the instrument this recipe consumes:
  **AUTHORING §11**
- The parts of that picture `pose` refuses because something is drawn over them,
  once a first candidate exists: **AUTHORING §12** (`rigc chainfit`). It reports the
  `rotate` key value each answer implies, which is the form this recipe wants them in
- If the **skeleton** is what you have to decide rather than the movement — how many
  bones, where each pivot goes, what hangs off what, and which of those the frames
  can check: [RIGGING.md](RIGGING.md). §3.9's pivot solve is the one piece of that
  page this one already carries, and RIGGING §2 is what a wrong answer to it looks
  like from inside a fit
- If the movement is a **face** — a blink, a gaze, or a head turning off axis —
  everything on this page still applies, and [FACE.md](FACE.md) is the geometry it
  does not have: a turn is a projection rather than a pose, so its values are
  evaluated rather than chosen
- If what you were handed is a **compiled skeleton** rather than loose parts — reading
  it, transcribing it into specs, re-pivoting it, extending it with an animation:
  [INGEST.md](INGEST.md)
- If you are the *person operating* an agent rather than the agent:
  [PROMPTING.md](PROMPTING.md)

---

## 0. The normal form

**Every motion request normalises to a key-pose sequence plus in-betweens.** That
is the whole internal shape, and it does not vary with how much the user gave you.
What varies is only **where the key poses come from**:

| Level | What arrived | Where the key poses come from |
| --- | --- | --- |
| **L0** | parts + words (*"a breathing idle"*) | you invent them. A loop is the special case where the first and last are the **same** pose |
| **L1** | parts + two pictures (*"from this to this"*) | the two pictures, read into spec coordinates by `rigc pose`. They are **given conditions** |
| **L2** | parts + N ordered pictures | the same, N times. This is the general form and L1 is the N=2 case |

⭐ **The recipe below is one recipe.** L0 spends its effort inventing poses and then
in-betweening them; L1 and L2 skip the inventing. Nothing else differs — not the
key plan, not the easing table, not the candidate axes, not the loop. If you find
yourself writing a second procedure for a second input level, you have split
something that is not two things.

🚨 **At L1 and L2 the end poses are inputs, not targets.** Once the spec carries the
numbers `pose` read out of the picture, the animation **states** those poses by
construction; there is nothing left for it to be close to, and nothing in this
toolchain measures how near it got. This is not modesty about a weak instrument, it
decides what you do with your loops: you do not iterate toward the ends, you iterate
on the movement between them. AUTHORING §11.1 argues the same point from the
instrument's side.

The loop this page is inside:

```
key poses  →  in-betweens  →  rigc build  →  rigc render / rigc preview  →  rigc vote
   ↑                                                                            │
   └──────────── a `both-unacceptable` verdict comes back here ─────────────────┘
```

and the last hop is the one that matters: a `both-unacceptable` tie means **propose
again from a different axis** (§4), not *nudge the same candidate*. §5 has the
detail.

### 0.1 When the axis is not time — an animation a `slider` applies

⛔ **One shape of request does not normalise to the table above, and carrying it
through §3 anyway produces a defect nothing on this page can measure.** A `slider`
constraint (AUTHORING §3.5.2) applies an animation as a function of a **value**: it
reads a driving bone's transform property, maps it with
`time = to + (value − from) × scale`, and applies the animation at that time on
every frame. What it applies is an ordinary animation in the motion spec — same
tracks, same keys, the same `duration` — but **nothing plays it**. It is a lookup
table, and `t` in it is a coordinate on the axis rather than a moment.

⇒ **So the constructs in §3 that are functions of time are not available to it,
and each fails in its own way rather than merely reading oddly:**

| §3 construct | On an animation a slider applies |
| --- | --- |
| §3.4 slow in and slow out | an easing curve makes the pose a **non-linear** function of the dial. The consumer moves the value at one rate and the face moves at another, and at a value held still the pose is still whatever the curve says there |
| §3.6 anticipation | places a counter-pose at a dial *position*, so the pose runs backwards while the value runs forwards. Nothing anticipates a number |
| §3.8 overshoot and settle | there is no settle: at a held value the pose is what the table says at that value, indefinitely. An overshoot keyed past the extreme is just a wrong pose at the top of the dial |
| §3.7 follow-through and the offset table | wants parts to arrive at different **times**. Here they differ by **amount** at every value, which is §3.7.1's construct and not this one |
| §3.3 timing | the key times are the axis's own coordinates — one per angle, position or level the table states — so spacing them is choosing where to sample, not choosing a rhythm |

⭐ **What is still this page's job is whatever moves the dial**, and that is an
ordinary animation with §3 applying to it unchanged. The split is visible in the
worked example: in
[`gallery/look`](https://github.com/rig-c/core/tree/main/gallery/look) the two
lookup tables `turn` and `tilt` carry **no easing at all**, and `sweep` — the one
animation there meant to be played — carries every `ease` in the file.

```bash
bun -e 'const m = JSON.parse(await Bun.file("gallery/look/motion.json").text());
for (const [name, a] of Object.entries(m.animations))
  console.log(name, (JSON.stringify(a).match(/"ease"/g) ?? []).length);'
```

⚠️ **And two of §4's candidate axes stop being axes.** *Anticipation* and
*Termination* are both readings of how a movement is placed in time, so a ballot
spread on either of them over a slider-applied animation is asking a person to
choose between two wrong answers. The axes that survive are the ones about
**amount** — *Part amount*, *Path*, *Key density* — because those are still
readings of the value.

📘 The face case is worked end to end in [FACE.md](FACE.md): its §8 derives the
slider's range from the turn ceiling `build` reports, which is the one number on
that axis an author cannot guess.

---

## 1. Prompt grammar — what a request is made of

A user writes prose. The recipe reads a fixed set of elements out of it. Both halves
of that are deliberate: the user gets natural language, you get something you can
act on without asking a questionnaire.

📌 **Every absent element has a default, and every default you take gets one line of
output saying you took it.** A silently defaulted duration is the same defect as a
silently defaulted pivot: the user cannot correct a decision they were not told
about.

| Element | How it arrives | Default when it is absent |
| --- | --- | --- |
| **parts directory** | a path, *"the PNGs in `art/`"*, a folder dropped in | ⛔ **no default.** Nothing can start without the art, because rigc measures PNGs rather than trusting a size you typed (AUTHORING R5). Ask for it |
| **pose frames, ordered 0..N** | file paths, pictures, *"first this one, then this one"* | **none = L0.** Invent the key poses, and say in one line which poses you invented and why those |
| **target duration** | *"half a second"*, *"quick"*, *"over about two beats"* | **propose one, write it into `duration`, and say so.** A movement has to have a length; the user not naming one is not permission to leave it undecided |
| **loop or not** | *"idle"*, *"cycle"*, *"loops"* vs *"and then it stops"* | **loop if the first and last key poses are the same pose, otherwise not** — and say which reading you took. At L1 with two different pictures that reading is *not a loop*; at L0 an idle is the A=B case |
| **intent adjectives** | *"heavy"*, *"snap"*, *"weary"*, *"mechanical"* | **none = no adjectives, not a neutral adjective.** With nothing said, take the defaults in §3 as written and do not invent a character for the movement. An adjective the user did not say is the thing they will react to first |
| **animation name** | *"call it `walk`"* | the intent's own verb, lower-case, one word (`raise`, `idle`, `strike`). It is a key in `animations` and the user will type it |
| **frame rate** | *"at 12 fps"* | ⛔ **do not adopt one.** Spine's times are seconds and frames exist only for convenience (AUTHORING §10.3), so a rate belongs to `render --fps` and to nothing in either spec file |
| **pose-frame scale** | almost never stated | search the default window once, read the `search` block back, and narrow it if the answer sits at a window edge — §2.2 |

📖 **A request in an animator's words — *"heavier"*, *"follow through"*, *"keep
the volume"* — maps to a construct in §3.1.1's table.** Two of its rows are
corrections rather than translations, so read it before assuming a word means
here what it means elsewhere.

⚠️ **Read the intent adjectives before you read the pictures, and write down what
you think they mean, in movement terms, before any measurement.** *"Snap"* means the
extreme arrives early and the value settles late; *"heavy"* means the parts separate
in time more than they otherwise would; *"mechanical"* means constant speed, which is
the one case AUTHORING §10.4 says to argue for rather than default to. Doing this
first is what stops the pictures — which are precise, and about the ends only — from
crowding out the sentence, which is imprecise and about everything in between.

---

## 2. Getting the key poses

### 2.1 L0 — you invent them

With no pictures, the key poses are yours, and the honest procedure is short:

1. **Name the extremes.** A movement is a list of positions it visibly passes
   through. Write them as sentences first (*"weight on the back foot, chest turned
   away"* → *"weight forward, chest square"*), because a sentence is a thing you can
   change cheaply and a set of bone angles is not.
2. **Two is the floor and three is usually right.** A move between two extremes needs
   both of them; a *cycle* needs the same pose twice with something different in the
   middle, or it does not read as a cycle.
3. **A loop is the A=B case, and its seam is a real defect.** The last key must carry
   the **same value** as the first, not a value near it — AUTHORING §0's note on
   `check`'s per-frame column is about exactly this class of defect, and nothing in an
   aggregate can see it. Write the value twice rather than trusting yourself to have
   ended where you began.
4. **Then look.** `rigc render` writes a contact sheet of every frame in one image,
   and spacing is a comparison **across** frames, so that grid is the picture to open
   first (AUTHORING §0). A pose you invented and never looked at is a guess with a
   number attached.

### 2.2 L1 and L2 — the pictures, through `rigc pose`

```bash
rigc pose --images parts/ --frame poseA.png --out poseA.json
rigc pose --images parts/ --frame poseB.png --out poseB.json
```

One frame per call, by design. The fields are AUTHORING §11.3; what follows is how
to **consume** them, and every item is a property of the instrument rather than
advice.

**⚠️ Read `refusal` before `placement`.** Under a `no-match` refusal the placement is
**still filled in, on purpose** — a refusal says *do not trust this number*, it does
not hide it. Code that reads `placement` first and treats a non-null value as an
answer will silently adopt a refused one. `empty-part` and `larger-than-canvas` leave
`placement` null because nothing was searched; those two are the only nulls.

**📐 The coordinates are frame pixels, y down, origin top-left, and `(x, y)` is where
the part image's own centre lands** — not a corner, not a pivot. To reach Spine's
y-up, counter-clockwise world use the two conversions that already exist and
open-code neither: `screenToSpineDegrees(rotationDeg)` and
`cropToSpineY(y, frameHeight)`, both in
[`src/transform.ts`](../src/transform.ts). The `space` field of every report repeats
the contract in the file, so a consumer never has to remember which way the flip
goes. (Canonical: AUTHORING §11.2, which states the same contract as a field
reference; it is restated here because §2 is where you convert one.)

⚠️ A **bone offset** in a spec is expressed in its parent's local axes, so the y flip
applies there too and it applies **once**. Converting a world point and then also
negating the local offset you derived from it is the commonest way to build a rig
that is a mirror of the picture in one joint and correct in the others.

**📊 Residuals are a trust signal and they are not comparable — not across parts, not
across pictures.** The residual is an alpha-weighted mean over **one** part's own
footprint against **one** frame's pixels, so it answers *how well does this placement
explain this frame here*. It does not say that a part with 0.03 was placed better
than a part with 0.06, and it does not say that pose A was read better than pose B.
⇒ Use it to decide **which numbers to lean on** — where two placements of the same
part in the same frame differ, and whether to look at a part again — and never to
rank parts or frames.

**🔀 A symmetric part comes back as an unordered set, and ordering it across two
frames is your job.** `alternates` non-empty means the answer was not unique;
`ambiguous` means at least one alternate is inside the margin. Two identical limbs
look exactly like that, and so does a shape whose silhouette fits itself at more than
one angle. The instrument has run out — it sees one frame and has no notion of which
limb is which. A left/right pair cut from one drawing is two files that each fit both
places, so each comes back with both, and narrowing `--scale` or `--rotation` until one
place is left picks the answer — it does not read it; the `ambiguous:` reading names
this route instead of a window when every placement in the margin is one size in
another place (AUTHORING §11.5). A method that works:

1. **Enumerate the assignments, not the placements.** With k interchangeable
   placements of one part in frame A and k in frame B, there are k! ways to pair them.
   For two, that is two options; do not treat it as a search.
2. **Pick the assignment that minimises total movement** — the sum, over the part's
   instances, of the distance its centre travels from A to B, with rotation counted in
   at the part's own radius so the two terms are commensurate. Adjacent poses are
   adjacent, so the pairing that makes the parts travel least is the pairing that does
   not swap them.
3. **Then pin it for the whole animation and let nothing reopen it.** Re-deciding per
   frame is what produces a limb that jumps back and forth between two answers, cheap
   in every frame and wrong in the relation between two — AUTHORING §8.1 documents that
   failure from the fitting side.
4. ⚠️ **Ask the user instead when continuity does not separate them.** Two cases: the
   two candidate assignments come out **within a few percent of each other** (a
   near-symmetric pose, or two poses far enough apart that both pairings travel about
   as far), or the assignment **changes the meaning** rather than the geometry — which
   arm is in front, which leg leads. Those are not measurements you are missing, they
   are decisions nobody has made. One question with the two readings named is cheaper
   than a rig that is confidently mirrored.

**🕶️ A middling residual next to a high `unexplained` usually means *right place,
seen through something*.** Occlusion is documented rather than solved: a part drawn
behind another has the occluder's pixels where its own should be, so its residual
rises **at the correct placement**. `unexplained` is the share of the part's material
that actually disagrees, and it is what separates the two readings — high with a
plausible placement is occlusion, high with an implausible placement is a wrong
answer. ⭐ **And it is evidence you want:** a part whose `unexplained` goes **up** in
the frame where another part crosses it is telling you the crossing part is in
**front**, which is the only place a slot order can come from at this input level
(AUTHORING R4 — the slots array *is* the draw order). §6 derives one that way.

**🔍 Surface the `search` window whenever you narrow it, and read it back before you
trust a surprise.** A window that does not contain the truth **does not reliably
refuse**: a part shrunk inside the region it came from still explains those pixels, so
the report's answer is the best placement available *inside* the window and its
residual can look perfectly reasonable. The tell is a placement sitting **at a window
edge**, or a part whose scale disagrees with its neighbours' by more than a few
percent when the picture cannot have been drawn that way. ⇒ Run the default window
once, read `search` and the scales together, narrow, run again, and **say in your log
what window produced the numbers you kept**. §6 shows the before and after on a real
part.

**🎨 Branch on `background.kind: "unknown"`.** With no dominant colour on the border
ring, every pixel counts as material, the silhouette signal is gone and the residual
is colour agreement alone. It is reported rather than being quietly weaker, so treat
it as a different input regime: lean harder on the parts whose interiors carry detail,
expect more `ambiguous` verdicts, and prefer a crop of the picture with a clean border
if the user can give one. Do not narrow `--max-residual` to make an `unknown` frame
look tidier; that suppresses the refusals, which are the only thing telling you the
frame is hard.

### 2.3 What the poses do and do not fix

Two placements per part fix a great deal: the setup pose, every part's attachment
offset, the slot order (via `unexplained`, above), and both end poses of every
timeline. They do **not** fix the pivots — see §3.9, which is where pivots belong,
because a pivot is not visible in either end pose and only shows up in the movement
between them.

---

## 3. The in-betweening recipe

This is the part with no reference and no possible reference. The pictures are of the
**ends**; the frames between them are not given anywhere, cannot be measured, and
would not exist even if the user had more pictures of the same two poses. Everything
below is therefore authored knowledge, and it is sourced the way AUTHORING §10 sourced
the editor's conventions.

⚠️ **All of it assumes the axis is time.** If what you are authoring is an
animation a `slider` applies — a face angle, a dial, a suspension that compresses
as the wheel rises — §0.1 is the exception, and it is not a small one: the easing,
the anticipation and the overshoot below each produce a specific defect there
rather than merely reading oddly.

### 3.1 Where these come from, and how each line is marked

Two public bodies of material, and nothing else: **the twelve basic principles of
animation** as publicly catalogued, and **Spine's own documentation**. No sentence
below is copied from either — the 📗 lines are paraphrases and each carries the page
it paraphrases.

- 📗 **stated** — named and defined on the page linked in the line.
- 🧩 **inferred** — this guide's reading of that material, applied to a rigc spec.
  The source does not say it, and the numbers in these lines are **defaults to start
  from, not answers**.

🚨 **Nothing here is the answer to any request.** Each item is a default to adopt
*unless the intent says otherwise*, exactly as AUTHORING §10 puts it, and the
adjectives in §1 are what overrides them.

### 3.1.1 The animator's words, in this vocabulary

A request arrives in an animator's words — *"make it feel heavier"*, *"keep the
volume when it lands"*, *"the cape should follow through"* — and this table is
the map from those to the construct that carries them. §1's intent-adjective
paragraph does this for three words; this is its full form.

⚠️ **Two rows are corrections rather than translations**, and they are the
reason the table earns its place: Spine's `Ease in`/`Ease out` mean the
**opposite** of the web's, and a *moving hold* is not §3.3's *hold*. Both are
words an agent already thinks it knows.

Marks are §3.1's: 📗 stated on the linked page, 🧩 this guide's reading. Per
cell, because most rows are a sourced word mapped to an unsourced construct.

| The animator's word | What it means | rigc's construct |
| --- | --- | --- |
| **weight** — *"make it feel heavier"* | 📗 how an object answers a push: a light one reacts sooner than a heavy one ([twelve principles]) | 🧩 not one field. A longer `duration`, a slower attack on the leading `ease`, and **larger** offsets down §3.7's table — heavy is *parts separating in time*, which is what §1 already says the adjective means |
| **timing** | 📗 how many frames an action takes, which is its speed ([twelve principles]) | 📗 `duration` and the key times, **in seconds** — frames exist for convenience only ([Keys]) · §3.3 |
| **spacing** | 🧩 how far the value moves between one sampled frame and the next. Timing is *when the keys are*; spacing is *what happens between them* | 🧩 the `ease` on the key, not the key times. It has no field of its own — §2.1 sends you to the contact sheet because spacing is only visible across frames · §3.4 |
| **slow in / slow out** | 📗 a body needs time to accelerate and to stop, so more drawings fall near each end ([twelve principles]) | 📗 a named entry in `easings` · §3.4. 🚨 **Spine's preset names invert the web's**: its *Ease out* changes more slowly near **the key**, its *Ease in* more slowly near **the next key** ([Graph]). An agent carrying the CSS meaning picks the opposite shape |
| **arcs** | 📗 natural movement follows a curved path; straight lines read as mechanical ([twelve principles]) | 🧩 the **channel**, not a setting: `rotate` gives the arc free, `translate` draws the straight line. The question is never *arc or line*, it is *which channel carries this move* · §3.5 |
| **anticipation** — *"wind up first"* | 📗 a small preparation that makes the action read ([twelve principles]) | 🧩 §3.6's interior key, the other way. 🚨 It goes **after** `t: 0` at L1/L2 — `t: 0` is a given condition, not a pose to move |
| **follow-through** | 📗 loosely attached parts keep going after the body stops, then are pulled back ([twelve principles]) | 🧩 the trailing part's extreme lands later than its driver's **and overshoots once** — §3.7's last rows are that pull-back · §3.8 |
| **overlapping action** — *"don't let it move as one piece"* | 📗 parts of a body move on different timings from one another ([twelve principles]) | 📗 in the editor it is literally *moving keys in time*, which is what the offset button is for ([Keys]). 🧩 here: a later extreme per bone, or `groups` + `stagger` where members share a value · §3.7 |
| **drag** — *"it should lag"* | 📗 parts take a few frames to catch up when a body starts moving ([twelve principles]) | 🧩 the same offset applied at the **start** rather than at the stop. ⚠️ Convert the source's frames to a **fraction** of the duration — §3.7's offsets are fractions, so a 0.15 s snap and a 2 s idle share one table · §3.7 |
| **the wave principle** | 📗 Esoteric's own framing: the thing to understand for tails, hair, cloth and flags — anything that follows through (video 4) | 🧩 the offset **compounding down a chain**, so the lag travels: `groups` + `stagger` where the members are a chain. ⚠️ **`wave` already names something else here** — a deform transform kind (AUTHORING §4.11.1) that ripples an attachment's vertices, not a chain's timing |
| **squash and stretch** | 📗 what gives a drawing weight and flexibility ([twelve principles]); Spine notes the shear tool is used in small amounts for organic squash and stretch ([Tools]) | 🧩 two spellings. **Cheap:** a `scale` key whose two axes differ. **Full:** a `deform` timeline, which is what `gallery/squash` uses. §7 is rigid-first — land the movement, then deform · §4 |
| **keeping the volume** | 📗 in *realistic* animation a squashed object keeps its volume: stretch it one way and it must narrow the other ([twelve principles]) | 🧩 `x·y ≈ 1` on a `scale` key, which `explain` prints beside it, and the `area` figure a `deform` key already carried. **A reading, never a rule** — a shadow, a zoom and a cartoon squash all change area on purpose. ⚠️ Say *scale product* in a message: `volume` already means an event's audio and 4.3's `ScaleYMode.Volume` |
| **overshoot and settle** | 📗 exaggeration — a motion that imitates reality exactly reads as dull ([twelve principles]) | 🧩 §3.8's interior key past the final value, then back. 🚨 The last key still carries the given end pose exactly |
| **a moving hold** — *"it should never be fully still"* | 📗 a character that is barely moving still breathes; two nearly-identical poses keep it from going lifeless ([twelve principles]) | 🧩 **not** §3.3's *hold*, which is two EQUAL keys meaning *nothing moves here*. A moving hold is the opposite: §3.3's 1.5–3 s idle band with a small excursion — §0's A=B case |
| **secondary action** | 📗 a supporting movement that emphasises the main one rather than competing with it ([twelve principles]) | 🧩 a whole extra timeline, and the **first thing to leave out of a first candidate**: a ballot spreading on both primary timing and a secondary action has asked two questions · §3.10 |
| **pose to pose** vs **straight ahead** | 📗 the two ways animation is made — extremes first and fill in, or forward frame by frame ([twelve principles]) | 🧩 a keyframed skeleton can only do the first. Nothing in the format means *"and then draw the next frame"* — §3.2 |

[twelve principles]: https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation
[Keys]: http://esotericsoftware.com/spine-keys
[Graph]: http://esotericsoftware.com/spine-graph
[Tools]: http://esotericsoftware.com/spine-tools

⚠️ **None of this table comes from the narration of the eight *Animating with
Spine* videos**, so nothing here is presented as something said in one. Two rows
cite a video's published *description*, which is Esoteric's own prose and marked
as such; everything else is the twelve principles and Spine's written
documentation.

### 3.2 📗 Pose to pose is the normal form, and it is one of two

Animation is publicly catalogued as being made either **straight ahead** — drawn
forward, frame after frame — or **pose to pose**, where the extremes are laid down
first and the rest is filled in between them —
[Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation).

🧩 **⇒ A keyframed skeleton can only do the second one, so §0's normal form is not a
convention this page picked.** A Spine animation *is* sparse keys plus interpolation;
there is no channel in the format that means "and then draw the next frame". This is
why a fitter's output — one pose per frame — is the wrong shape for a motion spec even
when every pose in it is right: AUTHORING §10.3 and PROMPTING clause 4 both land on
that from the measured side.

### 3.3 📗 Timing is the number of frames, and 🧩 in rigc it is seconds

Timing — how long a movement takes — is catalogued as what gives a movement its weight
and its meaning; the same two poses with different spacing between them read as
different actions
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).
Spine's own guide states that times are seconds and *frames exist only for
convenience* — [Keys](http://esotericsoftware.com/spine-keys).

🧩 **⇒ Author in seconds and never pin a key to a frame grid.** A key at `t: 0.07` is
ordinary; a key plan whose times are all multiples of 1/12 has quietly adopted a frame
rate that nothing in the spec asked for, and will re-time itself the first time
somebody renders at another rate.

🧩 **⇒ Defaults for a single move, when the user named no duration.** A movement a
figure *does* (a reach, a raise, a step) lands between **0.3 s and 0.8 s**; a movement
that happens *to* it (a hit, a snap, a recoil) between **0.1 s and 0.3 s**; an idle
cycle between **1.5 s and 3 s**. Propose the middle of the band the intent picks out,
write it in `duration`, and say in one line that you proposed it. These are starting
points chosen so a first candidate is watchable, not measurements of anything.

🧩 **⇒ How many interior keys, and where.** Key count is a timing decision, so it lives
here, and it is decided by **naming what each key is for** rather than by picking a
number:

| Interior keys | When that is the right count |
| --- | --- |
| **none** — the two ends plus a curve | the intent names no shape. This is a legitimate candidate rather than a stub, and it is exactly what candidate B is in §6 |
| **one**, at the extreme the intent names | one named effect: an anticipation (§3.6), an overshoot (§3.8), or the point a straight path would bow off its line (§3.5). One key per effect, at that effect's own time |
| **two or three** | the effects stack — anticipate, overshoot, settle — or the intent names a shape the ends cannot carry (*"hesitates"*, *"in two stages"*) |
| **four or more** | ⛔ ask what the extra ones are for. A key that is not an end, a named extreme, or a hold boundary is a **sample**, and §7 prices samples |

⭐ **The three kinds of key that are forced are AUTHORING §10.3's**, and they are the
whole of what a key plan owes: the series' own ends, every change of direction, and
**both ends of any run of equal values** — a hold is authored, not omitted, and two equal
keys are the only way to say *nothing moves here* on an interpolated timeline.

### 3.4 📗 Slow in and slow out, and 📗 Spine says constant speed reads badly

Movements are catalogued as accelerating out of an extreme and decelerating into the
next, with more drawings near the extremes than in the middle
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).
Spine's guide is explicit about the consequence: when all the parts of a skeleton move
at constant speed *the movement tends to be robotic and lifeless* —
[Animating](http://esotericsoftware.com/spine-animating). Its curve editor offers
automatic handles first and named presets after, and its handles are normalised to
0..1 on both axes — [Graph](http://esotericsoftware.com/spine-graph).

🧩 **⇒ Bezier is the default and linear is the exception you argue for** — AUTHORING
§10.4 states this and §4.1's `easings` block is where it lives. For a single authored
move, **three named shapes carry it**: one that leaves an extreme slowly and gathers
speed, one that leaves fast and arrives slowly, one symmetric shape for everything
else. A fourth is worth adding when a part has to *stop dead*; a table of eight for a
half-second move is a table nobody chose from.

🚫 **Do not fit free handles and then substitute the nearest named shape.** AUTHORING
§10.4 measures what that costs on a fitted shot, and the same trap exists here in a
smaller form: pick the table first, then write every key against the table you will
actually emit. Nothing in the loop can see the difference — the key count, the curve
kinds and the duration are all unmoved — and the rendered result changes.

### 3.5 📗 Arcs, and 🧩 the channel decides whether you get one

Natural movement is catalogued as following arced trajectories rather than straight
lines, because limbs are hinged
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).

🧩 **⇒ In a skeleton the arc is free, and losing it takes effort.** A `rotate` track on
a parent bone carries every descendant along a circular path about that bone's pivot —
that *is* an arc, and it costs one timeline. A `translate` track between two positions
draws the **straight line** between them, and two `translate` tracks with the same
times draw the straight line in both axes. ⇒ **The real question is never "arc or
line", it is "which channel carries this move".** Reach for `translate` only where the
thing genuinely slides — a lift, a slide, a prop on a rail — and for a hinge use
`rotate` and take the arc.

🧩 **⇒ Where a move must be a straight line through a hinge, it needs an interior
key.** A hand held level while the shoulder rotates is a straight path built out of two
arcs, and two keys cannot express it: the mid-point of the arc bulges away from the
line. One key at the middle of the span, placed on the line, removes most of the bulge;
two removes the rest. This is the one case where key count is doing geometric work
rather than shaping timing.

### 3.6 📗 Anticipation, and 🧩 where it is allowed to live

A movement is catalogued as being prepared for by a smaller counter-movement — a
crouch before a jump, a wind-up before a throw — which readies the audience for what
is about to happen
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).

🚨 **⇒ At L1 and L2 the anticipation goes *after* `t: 0`, never before it, and this is
not a style point.** The first key pose is a **given condition**: the spec states it at
`t: 0` by construction. An anticipation authored by moving the first key earlier, or by
setting `t: 0` to the counter-pose, has overwritten an input with an invention. ⇒ Keep
`t: 0` exactly as `pose` read it, and put the counter-pose at a small positive time.

🧩 **⇒ Defaults: the counter-move is 5–10 % of the main excursion, and its key sits at
10–15 % of the duration.** Below 5 % it does not read; past about 15 % it stops being a
preparation and becomes a first move of its own, which is a different animation. A
movement that happens *to* the figure gets **none** — nothing anticipates being hit.

### 3.7 📗 Follow-through and overlapping action, and 🧩 the offset table

Two related catalogued principles: parts of a body continue moving after the body has
stopped (**follow-through**), and parts do not all start and stop at the same time
(**overlapping action**) — the second being what stops a figure reading as one rigid
piece
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).

🧩 **⇒ In a keyed skeleton, overlap is a *timing offset per bone*, and it is the single
cheapest thing on this page.** Every bone's extreme key is at some fraction of the
duration; move a trailing bone's extreme later than its parent's and the chain reads as
connected. Nothing else changes — same poses, same easings, same key count.

🧩 Defaults, as a fraction of the whole movement, for a chain hanging off a driver:

| Part, relative to its driver | Extreme lands | Settles |
| --- | --- | --- |
| the driver itself (the bone the intent is about) | at its own extreme | at the end |
| the next link out (forearm, neck, upper prop) | **+8–15 %** later | after the driver |
| the link after that (hand, head, prop tip) | **+15–25 %** later | last of all |
| something loose and light (cloth, hair, a pennant) | **+20–35 %** later, and it **overshoots** | last, with one crossing |
| a planted part (a base, a foot in contact) | ⛔ no timeline at all | — |

⚠️ **The offsets compound down a chain and they are fractions, not seconds** — a
0.15 s snap and a 2 s idle both get the same table. Past about 35 % the trailing part
is no longer following the driver, it is doing a separate action, and the movement
reads as two events rather than one.

⛔ **A part the pictures show unchanged gets no timeline.** Keys that repeat the setup
value are exactly what the editor's own Clean Up deletes —
[Keys](http://esotericsoftware.com/spine-keys) — and a track that holds one value for a
whole animation is a reader's false lead about what the movement is about.

### 3.7.1 🧩 The value analogue of the offset table — one track, a number per part

The table above is a per-part **timing** offset, and in rigc it has a field:
`groups` names the parts, `stagger` adds the delay in member order, and `gallery/ride`
keys four wheels and two ears that way (AUTHORING §4.3).

🧩 **The other half of "each part gets its own number" is the value.** `groups`
keys its members **identically**, which is right for a wheel pair and wrong for a face:
there, the whole content of the movement is that every part moves a *different* amount.

🧩 **Two spellings, and the choice is whether the numbers are decisions or
arithmetic** (AUTHORING §4.5.1 is the field reference):

- a key's `v` may be a **map keyed by member name**, which is the right form when each
  number is a judgement — six hanging locks given six swings. The emitted file is byte
  for byte the one six separate tracks would produce, so this is a pure relocation;
- a key may state a **`derive` model** instead — `yaw` or `pitch`, an angle, and a
  **depth per member** — and the compiler evaluates each member's value from it. That
  is the right form when the numbers were never judgements: `x·(cos t − 1) − z·sin t` at
  six different columns is arithmetic, and the depths are the only decisions in it.

⭐ **The reason to prefer the model where it fits is not the line count. It is that the
depths get written down.** FACE §2's sharp edge is that a part's `x` is in the file and
its `z` is not — and a `z` nobody wrote down is a number nobody can check, on a page
where a wrong depth reads as a slide rather than a turn and **nothing complains**.

⚠️ **The two axes stay separate, deliberately.** `derive` takes no phase, index or
delay: `stagger` already does timing and two mechanisms for one lag would mean two
places to look for it. A track can carry both, and on a face usually should — the
features' parallax is per-member value, and their settle can still trail per §3.7.

### 3.8 📗 Exaggeration, and 🧩 overshoot as its keyed form

Exaggeration is catalogued as pushing a movement past its literal reading so the
intent survives
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).

🧩 **⇒ For a movement that ends fast, the keyed form is an overshoot: pass the final
value, then come back to it.** Default **8–12 %** of the excursion past the end value,
with the overshoot key at **55–70 %** of the duration and the final value at the end.
🚨 The overshoot is an **interior** key — the last key still carries the given end pose
exactly, for the same reason §3.6 keeps `t: 0` intact. A movement that ends slowly gets
no overshoot; there is nothing to absorb.

### 3.9 🧩 The pivot — the in-between's own geometry, and the one thing two poses may not fix

The two end poses need no pivot: they are stated as placements. **The in-betweens need
one**, because interpolating a `rotate` track means turning about the bone's position,
so the pivot decides the entire path between the ends. It is an in-betweening input,
and this is where it is decided.

📏 **That claim is measured on the other side.** [INGEST.md](INGEST.md) §4.1 moves one
pivot inside an existing rig and reports what `check` sees: the setup pose unchanged to
2.8e-14 units, and the difference climbing monotonically from the first frame the bone
rotates. Read it if you want the numbers behind *"a pivot is invisible in either end
pose."*

**Two placements of the same part fix its rotation's fixed point, when the rotation is
large.** With the part's centre at `cA`, `cB` and its screen rotation at `θA`, `θB`, the
point that is fixed in both is the solution of

```
( R(θA) − R(θB) ) · d  =  cB − cA          d = the pivot, as an offset from the part
                                               image's centre in the part's own axes
```

a 2×2 solve, where `R(θ)` is the frame's clockwise rotation. Reconstruct the world
pivot from either pose — they agree by construction — and take it into the parent's
local space to write it as a bone offset.

🚨 **And here is the honesty this needs, in the same shape AUTHORING §8.1 states it
for a fitted joint: the solve is well-conditioned only when the relative rotation
across the joint actually *changes* between the two poses.** The determinant of that
2×2 is exactly

```
|det|  =  4 · sin²(Δ/2)                    Δ = the CHANGE in relative angle across the joint
```

so a reading error in the placements is amplified into the pivot by about
**1 / (2 · sin(Δ/2))**. That factor **attenuates** at Δ = 80° (≈ 0.8×) and **multiplies
by five** at Δ = 11°. ⚠️ **Nothing reports it.** Both solves return an exact answer, both
reconstruct to a fixed point that agrees between the two poses to the last decimal, and
the residuals in the pose report never move — the ill-conditioned one is simply wrong,
quietly, and every in-between hung off it swings about the wrong centre.

⇒ **The rule, and it is arithmetic you already have:**

- **Δ ≥ 45°** — solve it. The answer is better than the placements it came from.
- **20° ≤ Δ < 45°** — solve it, then **check the conditioning** by re-solving from
  placements perturbed by a pixel and seeing how far the pivot moves. If it moves
  further than you would accept as a bone position, treat it as the next case.
- **Δ < 20°** — ⛔ **do not use the solve.** Take the default below and **say in your
  log that the pivot was defaulted and why** — the number, not the word: *"flag hinge
  defaulted; relative rotation changed 10.5° between the two poses, amplification 5.5×"*.
- **Δ = 0** (a part that only translates, or a rigid pair) — the pivot is not a
  quantity the pictures contain at all. Default it.

🧩 **The default, in order of preference.** Each is a reading of something you can
actually see, which is why they beat an ill-conditioned solve:

1. **The joint the art draws.** Part PNGs cut for rigging usually carry the hinge —
   a collar, a hoist edge, a socket, a darker cap. Take that feature's centre as the
   pivot in the part's own pixels, then use the **placements** to say where it lands.
   Averaged over the poses this is a *measurement of one point*, not a solve, so it
   does not amplify anything.
2. **The overlap of the two parts' footprints.** Where the child's `bbox` and the
   parent's intersect, the centroid of the intersection is the visible joint.
3. **The parent's far end.** The last resort, and often a few pixels out — which is
   exactly why it gets said out loud.

📌 **Then check the default the cheap way: it should agree with itself across the
poses.** Take your chosen pivot point into the parent **bone's** frame once per pose —
origin at the parent's own pivot, not at the centre of its image. A real hinge is
*fixed* there, so the readings should differ by about your placement noise; if they
differ by several pixels, the point you picked is not the hinge. §6 runs this check on
a real pair and gets 0.25 px. ⚠️ The check cannot see the origin: measured from the
wrong one, the readings agree exactly as well, because a constant offset agrees with
itself. §6 shows both, and what the wrong one draws.

### 3.10 📗 Secondary action, and 🧩 what it costs here

A supporting movement that reinforces the main one — catalogued as secondary action —
is what makes a movement specific rather than generic
([Twelve basic principles](https://en.wikipedia.org/wiki/Twelve_basic_principles_of_animation)).

🧩 **⇒ It is a whole extra timeline and it is the first thing to leave out of a first
candidate.** A secondary action is a decision about character, and a ballot that asks a
person to compare two candidates differing in *both* the primary timing and a secondary
action has asked two questions and will get one answer (§4). Land the primary movement,
then propose the secondary action as its own spread.

### 3.11 What this section does not claim

Deliberately absent, because no public page states them and asserting them would be
handing you an answer nobody measured:

- any figure for keys per second, or for how key density should scale with duration;
- what any particular studio, project or shipped rig actually used for any of the
  numbers above;
- that the offsets in §3.7 are right for a specific figure, weight or scale — they are
  starting points chosen to be watchable;
- that a movement built entirely from these defaults is good. They are what a first
  candidate is made of, and §4 is what happens next.

If one of these turns out to matter for a request, it belongs in that run's own notes
as something the user had to teach you — not here.

---

## 4. Candidate-spreading axes

`rigc vote` takes 2–4 compiled candidates and gives a person one page of looping
pixels, no paths and no prose (AUTHORING §0). What comes back is worth having only if
the candidates on it **differ in interpretation**.

⛔ **The same easing at three strengths is a wasted ballot.** A person asked to choose
between *a bit of ease*, *more ease* and *a lot of ease* will pick one, the ledger will
record it, and you will have learned a preference about a knob rather than about the
movement. ⇒ Spread on the axes below: each one is a **different reading of the same
request**, so whichever wins tells you something the next candidate can use.

| Axis | Candidate A | Candidate B | Worth a slot when |
| --- | --- | --- | --- |
| **Path** | the move rides the hinge (`rotate`) | the move is a line (`translate`, or `rotate` with interior keys on the line) | a part travels further than its own length, so the path is visible at all |
| **Part timing** | every part reaches its extreme together | the chain staggers, per §3.7's table | the figure is more than one bone deep. This is the highest-yield axis on the page |
| **Part amount** | every part moves the same distance | each part moves by its own depth, per §3.7.1 | the movement is a turn or a lean rather than a slide, so parallax is what says which. 🧩 One `derive` key per spread, not a table per part |
| **Anticipation** | none — the movement starts at the first pose | a counter-move at 10–15 % | the intent leaves it open whether the figure *does* this or *has it done to it* |
| **Termination** | arrives and stops | overshoots and settles, per §3.8 | the movement ends fast |
| **Segmentation** | one continuous movement | two beats with a hold between them | the prompt has two verbs in it, or a comma doing the work of one |
| **Key density** | ends plus one interior key | ends plus three or four | the intent names a shape (*"hesitates"*, *"in stages"*) that the ends cannot carry |
| **Pivot, where it was defaulted** | the art's own joint feature | the parent's far end | §3.9 defaulted it and the two readings are several pixels apart. The ballot is then answering a question the pictures did not |
| **Deform** (advanced) | rigid throughout | squash/stretch on the extremes via a `deform` timeline (AUTHORING §4.11) | the rigid candidates have already been chosen between. ⚠️ **The base recipe is rigid-first** — see §7. 🧩 A deform key can state its transform rather than a table of offsets (AUTHORING §4.11.1), so this axis is two numbers to spread on rather than two tables to transcribe |

📌 **One axis per ballot.** Two candidates differing on two axes cannot be read: the
winner tells you the pair was better, not which half of it was. If two axes both look
live, that is two ballots, and the first one's answer usually settles the second.

🧩 **Two is the useful width, three is the ceiling.** `vote` accepts four panes, and a
person watching four loops at once is comparing the two they happened to look at
together. Reach for three only when the axis genuinely has three readings (a path that
can go over, under or straight through).

---

## 5. The loop, and what comes back

```bash
rigc build   --rig m.rig.json --motion m.motion.json --images parts --out spine-a
rigc build   --rig m.rig.json --motion b.motion.json --images parts --out spine-b
rigc render  --candidate spine-a                       # look at it yourself first
rigc vote    --candidate spine-a --candidate spine-b   # -> ballot.html
rigc vote    --record vote-<id>.json                   # -> votes.jsonl
```

**Compile first, vote last.** A candidate reaches a ballot only because it already
built green, so the person is never asked to read a spec, a diff or JSON (AUTHORING
§0). And look at your own candidates with `render` before you ask anybody else to:
green says the file is valid and nothing more, and a head sitting off its torso passes
every assertion.

What the ledger can say, and what each one means for the next step:

| Verdict | What it means here |
| --- | --- |
| a **winner**, `preferred` | that reading of the request is the one. Build the next spread **inside** it — take the winner and spread it on a second axis |
| a **winner**, `defect-in-others` | the others had something wrong, which is not the same as this one being right. Look for the defect, fix it, and consider re-asking on the same axis |
| **tie**, `indistinguishable` | the axis you spread on does not matter for this request. ⇒ Stop spending ballots on it and pick either |
| **tie**, `both-acceptable` | the axis matters and both readings work. Pick one, say which, move on |
| **tie**, `both-unacceptable` | 🚨 **propose again from a DIFFERENT axis.** Not a nudge of either candidate — both readings were rejected, so the thing to change is what the candidates disagree about. Going back with the same axis at new strengths is the wasted ballot from §4, arriving by a second route |
| **tie**, `unsure` | the page did not show the difference. Check that the difference is actually visible at the rendered size and rate before re-asking |

⚠️ **A tie is a recorded answer, not a missing one**, and `both-unacceptable` is only
reachable because ties are recordable — check for it before treating a ballot as
settled. Every line carries the winner as a content **digest** rather than a label
(`B` means nothing outside one ballot) and a `coverage` set, so what is still
unreviewed is computable.

---

## 6. A worked example, end to end (L1)

🚫 **Every value in this section is invented.** The parts, the pictures, the numbers,
the easing table, the times — a signal post that exists nowhere else in this
repository, chosen so that the whole recipe runs on something small enough to read.
Nothing here is an answer to anything.

What *is* real: every command line below was run, and every figure printed in an
output block is what the command actually printed.

🖼️ **For the same recipe on art that ships, the
[`gallery/`](https://github.com/rig-c/core/tree/main/gallery) examples are worked
in-betweening material** — `walk` is §3.5's arcs and §3.7's phase offsets on two leg
chains, `ride` puts the same offsets in `groups` + `stagger`, and `squash` is §3.9's
pivot written as a `deform` about a contact point. Each README says what every key is
*for* rather than only what it is, and what looking at the render changed.

### The request

> *"Here are the parts and two pictures of the signal arm — hanging down in the
> first, raised in the second. Make it snap up and settle."*

Normalised against §1: parts directory **given**; two pose frames, **ordered**;
duration **absent** → §3.3 says a movement the figure *does*, so propose **0.55 s** and
say so; loop **absent** and the two pictures are different poses → **not a loop**;
intent adjectives **"snap ... settle"** → the extreme arrives early, the value settles
late, §3.8's overshoot is live; animation name → **`raise`**.

### 1. The art, and the two pictures

```bash setup
mkdir -p semaphore/parts && cd semaphore
bun -e '
const files = {
  "parts/post.png": "iVBORw0KGgoAAAANSUhEUgAAAA4AAABgCAYAAAAttkP7AAAAVklEQVR42mPYsOvMf3Iww6jG4aExr2bKf2Ts4BVDFB7VOKpxVCNOjXIqBv/JwUNJ42gCGNU4qnFU42hJPlqSj2oc1TiqcVTjqMbR+nG0fhxNOaMawRgAyYT+Nyka/GsAAAAASUVORK5CYII=",
  "parts/arm.png": "iVBORw0KGgoAAAANSUhEUgAAADwAAAAOCAYAAABzTn/UAAAAP0lEQVR42mPI8FP4Twp+c6ZpUGNC7mcY9fCoh0e4h49Nc8CLSVVPa/2jHh718KiHRz086uFRD496eNTDA+ZhAPte2VL+X1bRAAAAAElFTkSuQmCC",
  "parts/flag.png": "iVBORw0KGgoAAAANSUhEUgAAABwAAAAUCAYAAACeXl35AAAAMElEQVR42mOo09H4j46PeLjQDDOMWjhqIdUtfDZvCkV41MJRC4ehhaMlzaiFI89CANaNM2RJry/OAAAAAElFTkSuQmCC"
};
for (const [p, b] of Object.entries(files)) await Bun.write(p, Buffer.from(b, "base64"));
'
```

Three plates: a **post** 14×96 with a light cap, a lit left edge and three unevenly
spaced bands; an **arm** 60×14 with a lit top edge, a hub at one end, a collar at the
other and two ties between; a **flag** 28×20 with a dark hoist edge down one side and a
pale blaze across the middle. The interior detail is not decoration — a part that is one
flat colour is self-similar under scaling, and §2.2's window caveat is exactly what that
produces.

The two pictures stand in for what a user would hand over. Both are 160×200 on a flat
`rgb(238, 238, 234)` ground, with the post upright, the arm turned about the top of the
post, and the flag hanging off the arm's collar — **arm drawn over post, flag over arm**.
`poseA` has the arm down and to the right and the flag drooping past it; `poseB` has the
arm raised and the flag close to level. Their bytes are in
[the appendix](#appendix--the-two-pose-frames) so the section runs end to end.

### 2. Read the pictures — `rigc pose`

First call, default windows:

```bash
rigc pose --images parts --frame poseA.png
```

```
rigc pose
  ..    frame   …/semaphore/poseA.png  (160x200)
  ..    ground  rgb(238, 238, 234) over 100% of the border ring
  ..    parts   …/semaphore/parts  (3 png)
  ..    search  scale 0.5–2 in 7 step(s) · rotation -180°–180° in 24 step(s) of 15° · refuse above residual 0.25
  PLACE  arm.png   x=   92.0  y=  122.8  rot=   61.9°  scale=0.970  residual=0.0320  unexplained=  4%
                   found on a 20x25 anchor grid, step 4 at 2x reduction
  PLACE  flag.png  x=  104.7  y=  156.1  rot=   84.3°  scale=0.955  residual=0.0135  unexplained=  0%
                   found on a 40x50 anchor grid, step 2 at 2x reduction
  AMBIG  post.png  x=   80.0  y=  148.6  rot=   -0.1°  scale=0.982  residual=0.0587  unexplained= 16%
                   found on a 14x17 anchor grid, step 6 at 2x reduction
                   alt 2: x=   78.7  y=  164.0  rot=   -0.6°  scale=0.573  residual=0.0612  unexplained= 19%
                   alt 3: x=   79.0  y=  141.7  rot=   -0.5°  scale=0.691  residual=0.0687  unexplained= 25%
                   alt 4: x=   78.4  y=  135.5  rot=   -0.5°  scale=0.500  residual=0.0702  unexplained= 23%
                   ambiguous: part is 14x96 px (span 94.3 frame px, opaque 1) with texture 0.0146, detail 1.406; 50 candidate(s), best 0.0587, next 0.0612, spread 0.0025 — above the measured floor (AUTHORING §11.5: detail 0.5, measured from 24 px up), so size and texture do not explain this; either the frame holds more than one place this part fits, or every candidate missed the true one — a narrower --scale or --rotation window around what you know of the part tells the two apart
```

⚠️ **The post came back `AMBIG`: a best at scale 0.982 and its next alternate at 0.573,
15.4 px lower, trailing it by a spread of 0.0025.** That is §2.2's caveat in the open. The post
is a long part with most of its area in one colour, so a shrunken copy sitting inside the
real post explains those pixels nearly as well, and the report's own `ambiguous:` line
says size and texture do not account for how close the two come. The report cannot say
which one is true, and it says so: it names the alternatives and asks for a narrower window. The
picture can. The arm and the flag read 0.970 and 0.955, so the picture is at the art's
own resolution, and a post at 0.573 would be drawn at about 0.6 of the size of everything
bolted to it. ⇒ Narrow, and say so:

```bash
rigc pose --images parts --frame poseA.png --scale 0.85,1.2 --out poseA.json
rigc pose --images parts --frame poseB.png --scale 0.85,1.2 --out poseB.json
```

```
rigc pose
  ..    frame   …/semaphore/poseA.png  (160x200)
  ..    ground  rgb(238, 238, 234) over 100% of the border ring
  ..    parts   …/semaphore/parts  (3 png)
  ..    search  scale 0.85–1.2 in 2 step(s) · rotation -180°–180° in 24 step(s) of 15° · refuse above residual 0.25
  PLACE  arm.png   x=   91.9  y=  122.8  rot=   61.9°  scale=0.970  residual=0.0320  unexplained=  4%
                   found on a 20x25 anchor grid, step 4 at 2x reduction
  PLACE  flag.png  x=  104.7  y=  156.1  rot=   84.1°  scale=0.956  residual=0.0135  unexplained=  0%
                   found on a 40x50 anchor grid, step 2 at 2x reduction
  PLACE  post.png  x=   79.9  y=  148.5  rot=   -0.1°  scale=0.971  residual=0.0593  unexplained= 16%
                   found on a 14x17 anchor grid, step 6 at 2x reduction
```

```
rigc pose
  ..    frame   …/semaphore/poseB.png  (160x200)
  ..    ground  rgb(238, 238, 234) over 100% of the border ring
  ..    parts   …/semaphore/parts  (3 png)
  ..    search  scale 0.85–1.2 in 2 step(s) · rotation -180°–180° in 24 step(s) of 15° · refuse above residual 0.25
  PLACE  arm.png   x=  102.5  y=   94.8  rot=  -18.3°  scale=0.974  residual=0.0305  unexplained=  4%
                   found on a 20x25 anchor grid, step 4 at 2x reduction
  PLACE  flag.png  x=  137.4  y=   86.0  rot=   -6.4°  scale=0.958  residual=0.0134  unexplained=  0%
                   found on a 40x50 anchor grid, step 2 at 2x reduction
  PLACE  post.png  x=   80.0  y=  148.0  rot=    0.0°  scale=0.995  residual=0.0394  unexplained=  9%
                   found on a 14x17 anchor grid, step 6 at 2x reduction
```

The worked derivation and recipe below keep their recorded rounded authoring inputs:
pose A as printed here, and pose B with the flag at screen rotation −6.6° and scale
0.956. The current rerun above reads −6.4° and 0.958 for that flag. The 0.2° rotation
and 0.002 scale differences are changes in the estimator's reading; the fixed inputs
used to derive this worked rig and its motion are stated here so that the recipe does
not silently change with a rerun.

Three things to read out of that pair, none of which is a score:

- **Scale.** All six readings sit in 0.956–0.995, a spread of about 4 %. The one part
  read twice at one place, the post, reads 0.971 and 0.995 — 2.5 % apart on a part that
  does not move — so a 4 % spread is the size of the method's own repeatability rather
  than six different scales. ⇒ Take the pictures as being at the art's own resolution
  and author the rig in **part pixels**, so no scaling appears in the spec at all. Say
  that this is what the spread was read as.
- **Draw order, from `unexplained`.** The post reads **16 %** unexplained in pose A and
  **9 %** in pose B, at placements that barely move — §2.2's occlusion signature. The arm
  crosses more of the post in pose A, so the arm is **in front of** the post. The flag
  reads 0 % in both: nothing covers it, so it is **in front of** the arm. ⇒ Slots in
  the order `post`, `arm`, `flag` (AUTHORING R4 — the slots array *is* the draw order,
  and there is nowhere else in the file to say it).
- **The post does not move**, so its two readings are two measurements of one number:
  x 79.9/80.0 and y 148.5/148.0. ⇒ Use the mean, **(79.95, 148.25)**, and treat the 0.5 px
  disagreement as the noise floor for every other number on the page.

### 3. Convert, and derive the rig

For those recorded authoring inputs, `cropToSpineY(y, 200) = 200 − y` and
`screenToSpineDegrees(d) = −d`, both from
[`src/transform.ts`](../src/transform.ts) (§2.2 — do not open-code either):

| | pose A, Spine world | pose B, Spine world |
| --- | --- | --- |
| `post` | x 79.9 · y 51.5 · rot 0.1° | x 80.0 · y 52.0 · rot 0.0° |
| `arm` | x 91.9 · y 77.2 · rot −61.9° | x 102.5 · y 105.2 · rot 18.3° |
| `flag` | x 104.7 · y 43.9 · rot −84.1° | x 137.4 · y 114.0 · rot 6.6° |

**The shoulder, by §3.9's solve.** The arm's screen rotation changes from 61.9° to
−18.3°, so **Δ = 80.2°** — well inside the *solve it* band, `|det| = 4·sin²(40.1°) =
1.660`, amplification 0.78×. Solving the 2×2 puts the fixed point at frame **(80.57,
102.51)**, reconstructing identically from both poses, and the offset lands at arm-image
pixel **(6.76, 7.43)** — inside the arm's own hub, which is where a hub is for. In Spine
world that is (80.57, 97.49); in the post bone's local space, **(0.62, 45.74)**. That
point is the `arm` bone's origin, and it is the origin of everything measured in the
arm's frame below.

**The flag hinge, by §3.9's default — and this is the interesting one.** The relative
angle across that joint is 22.2° in pose A and 11.7° in pose B, so **Δ = 10.5°**:
`|det| = 0.0335`, amplification **5.5×**, comfortably inside the *do not use the solve*
band. Run it anyway, to see what it would have cost — it puts the hinge at **(49.15,
−0.38)** in the arm bone's frame, exactly as confidently as the shoulder did. The default
instead: the flag's art draws its hinge as a dark hoist strip down one edge, whose centre
is flag-image **(2.5, 10)**. Carry that point through each pose's placement into the
**arm bone's frame** — origin at the shoulder pivot above, x along the arm, y up: take
the point's frame position, subtract the pivot's, turn it back through the arm's screen
rotation and flip y once. Carried unrounded, printed rounded:

| | pose A | pose B |
| --- | --- | --- |
| the hinge in the frame, through the flag's placement | (103.52, 144.66) | (125.98, 87.32) |
| minus the pivot, (80.57, 102.51) | (22.94, 42.15) | (45.40, −15.18) |
| turned by −61.9° and +18.3°, y flipped | **(47.99, 0.38)** | **(47.87, 0.16)** |

That is §3.9's self-agreement check, and the two poses agree to **0.25 px**. ⇒ Take the
mean, **(47.93, 0.27)**, write it as **(47.93, 0)** — the y is inside the 0.5 px noise
floor — and write in the log that the pivot was **defaulted**, with the number:
*relative rotation changed 10.5°, amplification 5.5×, ill-conditioned solve declined*.

⚠️ **Which origin the arm's frame has is the whole of this step, and the check above
cannot tell you.** A placement reports where the part image's **centre** lands, so the
nearest frame to hand is the one centred on the arm image — and measured from there the
same hinge reads (24.76, −0.05) and (24.64, −0.27). Those agree to 0.25 px just as well,
because a constant offset agrees with itself. They are short by 23.24, the arm
attachment's own offset below, and a flag hung at x 24.70 draws over the middle of the
arm: built and rendered on the pictures' grid, its flag sits 23.5 px from where
`poseA.png` draws it in frame 0 and 23.2 px from `poseB.png` at the end. With x 47.93 it
sits 0.4 px and 0.2 px off, inside the noise floor. A bone sits at its **pivot**, and its
children's offsets are measured from there.

⭐ Worth pausing on, because it is what §3.9 is for: **the two solves are
indistinguishable from the inside.** Both are exact, both reconstruct to a point that
agrees between the poses, and no residual anywhere in either pose report moves. Here
the declined one lands 1.4 px from the drawn hinge — the 5.5× amplification applied to
about a quarter-pixel of placement noise — and nothing in either answer says which of the
two is the one to trust. The only thing separating them is Δ, which is arithmetic you
can do before you trust either.

`semaphore.rig.json` — complete, nothing trimmed:

```json
{
  "spec": "rigc-rig/1",
  "name": "semaphore",
  "images": "parts",
  "skeleton": { "width": 160, "height": 200 },
  "bones": [
    { "name": "root" },
    { "name": "post", "parent": "root", "x": 79.95, "y": 51.75 },
    { "name": "arm", "parent": "post", "x": 0.62, "y": 45.74 },
    { "name": "flag", "parent": "arm", "x": 47.93, "y": 0 }
  ],
  "slots": [
    { "name": "post", "bone": "post", "attachment": "post" },
    { "name": "arm", "bone": "arm", "attachment": "arm" },
    { "name": "flag", "bone": "flag", "attachment": "flag" }
  ],
  "skins": {
    "default": {
      "post": { "post": { "image": "post.png" } },
      "arm": { "arm": { "image": "arm.png", "x": 23.24 } },
      "flag": { "flag": { "image": "flag.png", "x": 11.5 } }
    }
  }
}
```

The two attachment offsets are the last of the arithmetic. A bone sits at its pivot and
the placement told you where the image's **centre** goes, so the offset is the gap
between them, in the bone's own axes with y flipped once: the arm's pivot is at image
(6.76, 7.43) and its centre at (30, 7), giving **x 23.24** (the y term is 0.43, inside
the 0.5 px noise floor, so it is not written); the flag's hinge is at image (2.5, 10) and
its centre at (14, 10), giving **x 11.5** exactly. Bone rotations are left off, which
means *as drawn* — the arm plate is drawn horizontal and the post vertical, so the poses
are entirely the motion spec's business.

### 4. In-between it

Duration 0.55 s, proposed (§3.3). Three easings (§3.4). The arm is the driver. The flag
is the last thing on it and it is cloth, which is the row §3.7's table gives to *a
pennant* — not the *next link out* row, because nothing hangs off the flag — so its
extreme lands **+20–35 %** after the arm's, it overshoots, and it settles last with one
crossing. *"Snap"* buys an anticipation (§3.6) and an
overshoot (§3.8). The post is planted: ⛔ **no timeline**.

`semaphore.motion.json` — complete, nothing trimmed:

```json
{
  "spec": "rigc-motion/1",
  "archetype": "semaphore",
  "cut": "semaphore",
  "easings": {
    "gather": [0.42, 0, 0.8, 0.36],
    "charge": [0.1, 0.72, 0.34, 1],
    "settle": [0.28, 0, 0.36, 1]
  },
  "animations": {
    "raise": {
      "duration": 0.55,
      "loop": false,
      "tracks": [
        {
          "bone": "arm",
          "property": "rotate",
          "keys": [
            { "t": 0, "v": [-61.9], "ease": "gather" },
            { "t": 0.07, "v": [-66.4], "ease": "charge" },
            { "t": 0.32, "v": [24.7], "ease": "settle" },
            { "t": 0.55, "v": [18.3] }
          ]
        },
        {
          "bone": "flag",
          "property": "rotate",
          "keys": [
            { "t": 0, "v": [-22.2], "ease": "gather" },
            { "t": 0.09, "v": [-30.1], "ease": "charge" },
            { "t": 0.47, "v": [-3.8], "ease": "settle" },
            { "t": 0.51, "v": [-15.4], "ease": "settle" },
            { "t": 0.55, "v": [-11.7] }
          ]
        }
      ]
    }
  }
}
```

Every number in there is one of the two given conditions or one of §3's defaults, and
which is which is worth being able to point at:

| Key | Where it came from |
| --- | --- |
| arm `t: 0` = −61.9, flag `t: 0` = −22.2 | **given** — the recorded pose A reading, converted. Untouched, per §3.6 |
| arm `t: 0.55` = 18.3, flag `t: 0.55` = −11.7 | **given** — the recorded pose B reading. The flag's is `6.6 − 18.3`: both world rotations converted first, then differenced, because a child's track carries a **local** rotation under a rotated parent |
| arm `t: 0.07` = −66.4 | §3.6 — 4.5° against an 80° excursion (5.6 %), at 13 % of the duration |
| arm `t: 0.32` = 24.7 | §3.8 — 6.4° past the end value (8 %), at 58 % of the duration |
| flag `t: 0.09`, `t: 0.47` | §3.7 — the flag's extreme lands at 85 % of the duration against the arm's 58 %, an offset of **+27 %**, the middle of its row's band, and it drags the other way first. Not the top of the band: at 35 % (`t: 0.51`) the crossing and the settle below would share 0.04 s, and the 24 fps render would still show the flag at its extreme one frame before the last |
| flag `t: 0.51` = −15.4 | §3.7's *one crossing* for a loose part: it comes back past its own end value before settling, keyed halfway between its extreme and the end |
| the three easings | §3.4 — one that gathers, one that arrives slowly, one symmetric. The **last key of each track carries no easing**, because there is nothing after it to ease towards (AUTHORING §4.5) |
| the post's absent track | §3.7 — a planted part gets no timeline |

### 5. Build, then look

```bash
rigc build --rig semaphore.rig.json --motion semaphore.motion.json --images parts --out spine
```

```
  ..    pages=3 regions=3 bones=4 slots=3 animations=1 version=4.3.13 regionAttachments=3 meshAttachments=0 physicsConstraints=0 rig=semaphore profile=spine
rigc: wrote …/semaphore/spine/skeleton.json
rigc: wrote …/semaphore/spine/skeleton.atlas
rigc: wrote …/semaphore/spine/skeleton.model.json
rigc: look at it: rigc preview --candidate …/semaphore/spine
```

```bash
rigc render --candidate spine --fps 24 --max 200
```

```
  ..    134x200px at 24 fps, 1 set(s) -> …/semaphore/render
  ..    physics: none in this rig — it declares no physics constraint, so no frame steps one
  ..    raise            14 frame(s), 0.542s + contact.png -> …/semaphore/render/raise@24fps
```

Open `render/raise@24fps/contact.png` **before anything else** — fourteen frames as one
grid, and spacing is a comparison across frames rather than a property of any one of
them. What to check on it, and it is not a score: frame 0 is pose A — the flag hanging off
the arm's collar, not over its middle — the last frame is pose B, the anticipation dips
*after* frame 0, and the flag's extreme is visibly later than the arm's: the arm peaks at
frame 8 while the flag is still closing on the arm's line, it keeps closing through
frame 11 as the arm eases back, and at frame 12 it drops past its resting angle.

🚫 **Do not run `rigc check` against `poseA.png` and `poseB.png`.** Two pictures are not
a frame set: `check` reads the second as the frame 1/12 s in, at its default rate. And
the ends' **rotations** are given conditions the spec states by construction, so a
number for how near the movement got to them is a number about the pose estimator. What
the pictures can still catch is §3's arithmetic, because every **offset** in the rig was
derived rather than given, and a wrong one moves an end pose off its picture while every
key stays exact. That is what the frame-0 check above is for, and it is a look, not a
score. §7.

### 6. Spread, and ask

One axis (§4), and **Part timing** is the one this request leaves genuinely open: does a
signal flag lag its arm, or is the whole assembly stiff? Candidate B keeps both given end
poses, keeps the duration, and drops every §3 default — one easing, two keys per track,
no anticipation, no overshoot, no stagger. `semaphore-b.motion.json` is candidate A's file
with **these two fields replaced** and `spec`, `archetype` and `cut` unchanged:

```json
  "easings": { "drive": [0.2, 0, 0.4, 1] },
  "animations": {
    "raise": {
      "duration": 0.55,
      "loop": false,
      "tracks": [
        { "bone": "arm", "property": "rotate", "keys": [
          { "t": 0, "v": [-61.9], "ease": "drive" },
          { "t": 0.55, "v": [18.3] } ] },
        { "bone": "flag", "property": "rotate", "keys": [
          { "t": 0, "v": [-22.2], "ease": "drive" },
          { "t": 0.55, "v": [-11.7] } ] }
      ]
    }
  }
```

```bash
rigc build --rig semaphore.rig.json --motion semaphore-b.motion.json --images parts --out spine-b
rigc vote --candidate spine --candidate spine-b
```

```
rigc vote
  ..    ballot    862f444c58d10e3e
  ..    animation raise
  ..    A         sha256:c49e458df44e…  3 page(s), 0.4 KiB  <- …/semaphore/spine/skeleton.json
  ..    B         sha256:d1bda24d7c36…  3 page(s), 0.4 KiB  <- …/semaphore/spine-b/skeleton.json
  ..    the page shows A/B and nothing else — the paths above are in its manifest, never on the screen
  ..    embedded every candidate's skeleton, atlas and page(s) as data URIs; the player itself loads from unpkg (@4.3.*), so the first open needs a network
rigc: wrote …/semaphore/ballot.html  (22.3 KiB — open it in a browser)
rigc: then record the saved vote with  rigc vote --record vote-862f444c58d10e3e.json --ballot …/semaphore/ballot.html
```

A person opens that page, watches two loops, picks one, and saves the small JSON it hands
them. Then:

```bash
rigc vote --record vote-862f444c58d10e3e.json --ballot ballot.html
```

```
  PASS  V00_RESULT_IS_A_RIGC_VOTE
  PASS  V01_RESULT_NAMES_THIS_BALLOT
  PASS  V02_CANDIDATE_DIGESTS_ARE_THE_BALLOTS
  PASS  V03_BALLOT_ID_DERIVES_FROM_ITS_CANDIDATES
  PASS  V04_CHOICE_IS_ON_THE_BALLOT
  PASS  V05_REASON_CODE_FITS_THE_CHOICE
  PASS  V06_NOT_ALREADY_RECORDED
  ..    winner A = sha256:c49e458df44efd277aa6e50ff8fa1962c1211c7617079d63fbc4cf8008eaf0c5, reason code preferred
  ..    coverage 2 candidate(s): A=sha256:c49e458df44e… B=sha256:d1bda24d7c36…
rigc: appended line 1 to …/semaphore/votes.jsonl
```

🚫 **That answer is invented like every other value in this section — nobody looked at
this ballot.** It is here to show the shape of what comes back: a winner identified by
**digest** rather than by the label `A`, a reason code from the closed enumeration, and
a `coverage` set naming what this vote actually compared. The `PASS` lines are the
ledger checking the answer against the ballot, not anything checking the movement.

Had `both-unacceptable` come back instead, §5's table says what to do: not a nudge of
either candidate, but a new spread on a **different** axis — **Termination**, say, or
**Segmentation** — because a rejection of both readings is a statement about the axis.

---

## 7. Non-goals — stated, so nobody proposes them as gaps

🚫 **No `rigc tween`, and no command that generates in-betweens.** Every other command
in this toolchain either compiles what you wrote, measures it, or shows it. §3 is a page
of authored judgement — timing offsets, arcs, anticipation, the pivot defaults — and a
command that applied it would be making those decisions on the user's behalf with no
place to say it had. **Authoring stays with the agent.** What the toolchain owes you is
that the ends are stateable by construction (`pose`), that the file is checkable
(`build`), that you can look (`render`, `preview`), and that a person can choose
(`vote`).

🚫 **No scoring of end-pose reach, and nothing here to add one to.** At L1 and L2 the
end poses are given conditions, and what a picture gives is a **pose**: the rotations are
`pose`'s readings, which the spec states by construction, so a number for how near the
animation got to *them* is a number about the pose estimator. The **offsets** are the
other half — derived from the pictures rather than given — and a rig can miss its
picture by a wrong one with every key exact. Catching that is a look, not a score (§6.5's
frame-0 check). This is why §6 does not run `check` on the two pictures and why no
threshold, tolerance or pass bar appears anywhere in this document. The
residuals in a `pose` report are trust signals about *placements*, and AUTHORING §11.1
says the same from the instrument's side.

⚠️ **Deform in-betweens are an advanced axis, and the base recipe is rigid-first.**
Squash and stretch is expressible — a `deform` timeline moves an attachment's vertices
over time (AUTHORING §4.11) — and it is a real axis in §4's table. It is last in that
table on purpose: it needs a mesh rather than a region attachment, it multiplies the
things a candidate differs by, and a movement that does not read when rigid will not be
rescued by deforming it. ⇒ Land the rigid movement, choose between rigid candidates,
then propose deform as its own spread.

🚫 **No per-member easings and no per-member key times, and §3.7.1's construct is
bounded by exactly that.** A group's shared times and shared curves are what make it a
group; a per-member `v` map or a `derive` model varies the **value** and nothing else.
A member that needs its own timing has `stagger` (one number, in member order) or its
own track — and a third mechanism would mean the answer to *"when does this bone move"*
lived in three places. 🚫 Nor is `derive` an expression language: the kinds are named,
and a kind the compiler does not know is refused by name rather than evaluated.

🧩 **A deform key stating a transform is not a tween, and the distinction is the
first non-goal above rather than a nuance of it.** AUTHORING §4.11.1 lets a key name a
model — a yaw, a scale about a point, a wave, a bend — and the compiler evaluates it
over the attachment's own vertices. What that removes is **transcription of one key's
arithmetic**, which is never judgement: `gallery/portrait`'s held yaw is 160 floats of
one closed form. What it does not touch is **anything between two keys** — the times,
the easings, the anticipation, the offset table — because a deform timeline still has
one 0..1 blend channel and §3 still owns every value on it. ⇒ Sweeping a deform is
editing one number **per key**, and a command that chose those numbers or the keys
between them would be the `rigc tween` this section refuses.

⚠️ **The one case where the deform is not an axis but the movement itself is a face
turning off axis**, because a rigid candidate of it does not exist — a yaw *is* the
redistribution. [FACE.md](FACE.md) is that case, and it also states what nothing here
measures: a `deform` key that folds a mesh inside out gates green on every assertion,
so a face's arithmetic has to be checked before the build rather than after the render.

🚫 **No frame rate anywhere in either spec file.** `render --fps` is a sampling rate for
looking; times in a motion spec are seconds (§3.3).

🚫 **No key per frame.** A fitted pose per frame is a pixel transcription wearing a
skeleton — AUTHORING §10.3 and PROMPTING clause 4 both price it. Keys are structure.

---

## Appendix — the two pose frames

The bytes of `poseA.png` and `poseB.png`, so §6 runs end to end. Both are 160×200 on a
flat ground; both are invented.

```bash setup
bun -e '
const frames = {
  "poseA.png": "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",
  "poseB.png": "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"
};
for (const [p, b] of Object.entries(frames)) await Bun.write(p, Buffer.from(b, "base64"));
'
```
