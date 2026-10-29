# Third-party notices

## Spine Runtimes

This repository depends on `@esotericsoftware/spine-core`, part of the
[Spine Runtimes](https://github.com/EsotericSoftware/spine-runtimes),
Copyright (c) 2013-2025 Esoteric Software LLC, licensed under the
[Spine Runtimes License Agreement](https://esotericsoftware.com/spine-runtimes-license),
as a **development dependency**: a clone and CI install it, and every Spine file
`rigc build` writes there is read back through it before it is written. **The
published package does not carry it** — an install of `@rig-c/core` (or of `rig-c` or
`spine-rigc`, the same product files under the convenience or legacy name) has no
Spine runtime in it unless one is installed beside it, and then the same `rigc`
uses it.

Its terms, as the licence states them: integration of the Spine Runtimes into
software is permitted **under the terms and conditions of Section 2 of the
[Spine Editor License Agreement](https://esotericsoftware.com/spine-editor-license)**;
otherwise it is permitted **provided that each user of the Products obtains their
own Spine Editor license** and any redistribution of the Products includes the
licence and copyright notice. Where a Spine Runtime is integrated with rigc — this
repository, its CI, or an install with the runtime beside it — those terms apply
there.

### What that means for rigc, as a chain of facts

rigc's own code is MIT (see `LICENSE`). The following is a restatement of Esoteric
Software's terms, not a licence term of this project:

1. rigc's output **is Spine skeleton data**.
2. A product that plays it with **a Spine Runtime** — the official runtimes, the Web
   Player — has integrated the Spine Runtimes. rigc also writes the model document
   its own core poses, and a product may play that or anything else; what the terms
   turn on is the integration.
3. Integrating a Spine Runtime into a product is permitted **under Section 2 of the
   Spine Editor License Agreement**, or otherwise on the condition that **each user
   of the product obtains their own Spine Editor license** and the product carries
   the Runtimes licence and copyright notice — the two routes above.
4. The published rigc **links no Spine runtime**. This repository does, as a
   development dependency for its own gate, and so does an install with
   `spine-core` added beside it. Validation is not optional on either: the gate
   runs through the runtime where it is installed and through rigc's own validator
   where it is not, and the two are held to the same verdicts in CI on 49 of the
   50 assertions — the official parser's own parse runs only where the runtime is.

> **If a product integrates a Spine Runtime to play rigc's output, that integration
> is subject to the terms above** — rigc neither creates those terms nor removes
> them. Running the published rigc links no Spine runtime, and whether its output is
> then played by one, by rigc's own core, or by something else is the consumer's
> choice.

### The Spine Web Player, and what `rigc preview` does with it

`rigc preview` writes an HTML file that plays a compiled rig in the **Spine Web
Player** (`@esotericsoftware/spine-player`), also part of the Spine Runtimes and
under the same licence as above.

⚖️ **It is referenced, never redistributed.** The generated page loads the player
from a CDN with a `<script src>` and a `<link rel="stylesheet">`; no byte of it is
committed to this repository, bundled into the published npm package, or copied
into the generated file. What the generated file *does* contain is the user's own
skeleton, atlas and page images, embedded as data URIs so the page opens without a
server — those are the user's, not Esoteric Software's.

Two consequences worth stating plainly:

- a generated preview needs a network connection the first time it is opened, and
  says so in the page when the player does not arrive;
- using the Spine Web Player is a Spine Runtimes integration, subject to the
  terms described above.

## Example assets

The official Spine example projects are the yardstick this compiler is measured
against. They are owned by Esoteric Software. **The example projects themselves are
not committed to this repository**: `scripts/fetch-examples.sh` downloads them into a
gitignored `examples/` directory for local evaluation. What this repository *does*
commit is its own rendered frames of them, under the grant the examples' own licence
files carry — *Rendered reference frames*, below.

Each example directory upstream carries its own `license.txt`, so the terms are
per-directory rather than repository-wide. Verified on 2026-08-22 against
`spine-runtimes` branch `4.3`:

| Example               | `license.txt` | Copyright line                                  |
| --------------------- | ------------- | ----------------------------------------------- |
| `1-weight-and-mass`   | present       | (c) 2021-2025, Esoteric Software LLC            |
| `2-the-12-principles` | present       | (c) 2021-2025, Esoteric Software LLC            |
| `3-timing-and-spacing`| present       | (c) 2021-2025, Esoteric Software                |
| `4-wave-principle`    | present       | (c) 2021-2025, Esoteric Software LLC            |
| `5-squash-and-stretch`| present       | (c) 2021-2025, Esoteric Software                |
| `6-arcs`              | present       | (c) 2022-2025, Esoteric Software                |
| `7-anticipation`      | **absent**    | —                                               |
| `8-follow-through`    | present       | (c) 2024-2025, Esoteric Software                |
| `spineboy`            | present       | (c) 2013, Esoteric Software LLC                 |

Every `license.txt` above states the same two terms verbatim, differing only in
the copyright line:

> The images in this project may be redistributed as long as they are accompanied
> by this license file. The images may not be used for commercial use of any
> kind.
>
> The project file is released into the public domain. It may be used as the basis
> for derivative work.

So, for this repository's purposes:

- **Images** — redistributable only with the accompanying `license.txt`, and
  **non-commercial only**. That is why the example projects are fetched rather than
  committed, and why the rendered frames this repository *does* commit each carry a
  verbatim copy of that file beside them — *Rendered reference frames*, below.
- **Project files** (`.spine`, and the exports derived from them) — **public
  domain**, usable as the basis for derivative work. This is what makes the
  examples usable as a structural yardstick.
- ⚠️ **`7-anticipation` has no `license.txt` upstream**, so the redistribution
  grant its siblings carry does not exist for it — there is no licence file to
  accompany its images with. `scripts/fetch-examples.sh` prints a warning naming
  it. Treat its images as not redistributable.

### Rendered reference frames

`bench/reference/` contains **1,293 PNG frames rendered by this project** from the
examples' own exports: `bench/render_reference.ts` loads each example's `export/`
out of the gitignored `examples/`, poses it with `spine-core`, and rasterises each
posed attachment.

A rendered frame contains those images' pixels, so committing one **is**
redistribution — and each example's `license.txt` grants exactly that, *"as long as
they are accompanied by this license file"*. So **a verbatim copy of the relevant
`license.txt` sits at each example root** under `bench/reference/`, put there by
`render_reference.ts` rather than left to memory; all eight are present. The
**non-commercial** condition in that same file rides along with those images, and
`LICENSE` says so — rigc's MIT grant covers rigc's own code, documentation and art,
and does not extend to this material.

⚠️ **`7-anticipation` is excluded, and mechanically so.** With no upstream
`license.txt` there is no grant to rely on, so its frames are never committed:
`render_reference.ts` writes them only into a gitignored directory, refuses any
`--out` inside the repository that `git check-ignore` will not accept, fails closed
if git cannot answer, and drops a `LOCAL-ONLY.txt` beside them in place of the
licence file that does not exist.

`bench/reference/` is repository material — it is not in `package.json`'s `files`
list, so it is not part of the published npm package. The full reasoning, and the
per-rung framing behind it, is in
[`bench/reference/README.md`](https://github.com/rig-c/core/blob/main/bench/reference/README.md).
