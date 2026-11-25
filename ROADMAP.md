# Where rig-c core is going

No dates and no feature list. Each item below is a condition that has to become
true, with the test that says it has. Direction comes from what the people and
agents using core run into, not from what this page predicts.

## What this is for

**Rigging and animation made by an AI, with no human hands.**

The line that makes that checkable is posing. Writing the brief is not a hand.
Choosing the art is not a hand. Making a pose is. Other tools have a person
making poses somewhere; core is trying not to, at any layer, and a run can be
measured against that.

Core is the compiler. It takes a rig spec and a motion spec and writes skeleton
data only after every check has passed, so an agent that cannot see the rig is
told by name what is wrong with it.

## What is done

- **1.0: the input spec holds still.** A change an existing rig spec cannot
  survive is a major version. The number was claimed on an exam over shipped
  production rigs, and the conditions it had to meet are kept as a record in
  [docs/ROADMAP_TO_1.0.md](docs/ROADMAP_TO_1.0.md).
- **2.0: a second oracle.** Core has its own compiled model and its own posing
  core, held equal to the Spine runtime's poses in this repository's CI. The
  published package checks every build with its own validator and installs no
  Spine runtime. [docs/SECOND_ORACLE.md](docs/SECOND_ORACLE.md) is the design
  and how it landed.
- **3.0: a closed import surface.** Only the named entries of the package can
  be imported, and [RELEASING.md](RELEASING.md) says which of them are promised.

## Where the three bets stand

Core bets on three places where a hand is the wrong instrument. None is proven
end to end on real art yet.

| Bet | What holds today | What is not shown yet |
| --- | --- | --- |
| **Vertex work**: geometry too dense to pose by hand | The checks hold at that density, and a deform key can state its transform instead of a table of offsets ([AUTHORING §4.11.1](docs/AUTHORING.md)) | A dense deform is still stored as per-vertex numbers, and at that density one key is megabytes |
| **Jiggle**: how a soft region answers an impulse | Physics is emitted and checked for structure: a constraint that drives nothing is refused by name | Nothing in core measures whether a jiggle is *right*, and a check that cannot fail on a wrong one is not a check |
| **2.5D**: turning a flat drawing through an angle it was not drawn at | The angle a depth mesh supports is derived in closed form and reported before anything is animated ([FACE.md](docs/FACE.md)) | On a measured depth map noise is also a slope, so the reported angle could be set by sampling rather than by shape |

## What is next

> **Draft note.** The order below is a proposal, not a decision. Remove this
> note when the order is settled.

1. **Prove the three bets on real art.** First, because the answers decide the
   rest: whether a deform is stored as offsets or evaluated from a depth and an
   angle is a question about the model every later item builds on.
   *Done when* each bet has a run on real art with no hand-made pose at any
   layer, and each line in the table's right-hand column is answered by a
   measurement in the docs.
2. **Hold the contract with the toolchain still.** Second, because proving the
   bets runs through the other packages, and that is when core learns what they
   need from it.
   *Done when* the entries the other rig-c packages import are the promised
   ones, and several releases in a row pass without one of them having to change.
3. **The own player, and adapters for engines.** Third, because a player is
   only as stable as the model it plays. [`@rig-c/play`](https://github.com/rig-c/play)
   plays the compiled model in a browser today, and the
   [adapters](https://github.com/rig-c/adapters) play it inside PixiJS, Phaser
   and Three.js.
   *Done when* a build plays the same in each of them, measured against core's
   own poser rather than by eye.
4. **Spine as one backend among several.** Last, because nobody has asked for
   another backend, and one cannot ship without its own oracle: output nothing
   can check is worth nothing.
   *Done when* a second format is written by a build and read back by a parser
   core did not write.

## Not planned

- **Scenes.** Core compiles an object: what a rig can do, and that its
  animations meet cleanly. When it does any of that, what else is on screen and
  where the camera sits belong to whoever uses the rig.
- **Full coverage of the Spine format.** What core emits, it emits correctly;
  what it does not, it refuses by name. A construct nobody has asked for is not
  a gap.

## The toolchain around core

Core depends on none of the other rig-c packages. They turn a painting into the
specs it compiles, add motion, play the result and show it to a person. The
[getting-started guide](https://github.com/rig-c/getting-started#the-whole-thing-in-one-glance)
says what each one takes and gives, and the
[organisation page](https://github.com/rig-c) lists them all.

## How direction changes

By what users hit. An [issue](https://github.com/rig-c/core/issues) that says
what could not be expressed, or what was refused and should not have been, moves
this page. A prediction does not. Nothing here is promised by a date.
