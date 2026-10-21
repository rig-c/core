# Changelog

## [2.67.1](https://github.com/rig-c/core/compare/v2.67.0...v2.67.1) (2026-10-21)


### Bug Fixes

* **release:** refuse dispatch provenance from a different commit ([#1549](https://github.com/rig-c/core/issues/1549)) ([4c47d90](https://github.com/rig-c/core/commit/4c47d90334fbf040142df12a3f987c3f1a80d45c))

## [2.67.0](https://github.com/rig-c/core/compare/v2.66.0...v2.67.0) (2026-10-21)


### Features

* **core:** override named physics parameters on live tracks ([#1548](https://github.com/rig-c/core/issues/1548)) ([df1da2d](https://github.com/rig-c/core/commit/df1da2d18a432b84a5d1937ae4fdd8fc20feef02)), closes [#1541](https://github.com/rig-c/core/issues/1541)
* **core:** pass current-entry context to local adjustments ([#1546](https://github.com/rig-c/core/issues/1546)) ([c78b540](https://github.com/rig-c/core/commit/c78b540d7483e444146c63a67006508bd317f84a)), closes [#1540](https://github.com/rig-c/core/issues/1540)

## [2.66.0](https://github.com/rig-c/core/compare/v2.65.2...v2.66.0) (2026-10-21)


### Features

* **core:** read named mesh geometry at setup without changing selection ([#1544](https://github.com/rig-c/core/issues/1544)) ([877c54c](https://github.com/rig-c/core/commit/877c54cc86759e8356ec9a8da19c8a5113c1dfae))


### Performance Improvements

* **core:** reuse immutable attachment identity between poses ([#1543](https://github.com/rig-c/core/issues/1543)) ([e660f77](https://github.com/rig-c/core/commit/e660f772206b49b2a28956226794dd2c0b2d8a66)), closes [#1531](https://github.com/rig-c/core/issues/1531)

## [2.65.2](https://github.com/rig-c/core/compare/v2.65.1...v2.65.2) (2026-10-21)


### Bug Fixes

* **cli:** render --help's --out row names the setup-pose set a rig with no animation writes, and RN08 holds it to the folders on disk ([#1533](https://github.com/rig-c/core/issues/1533)) ([67fcf5e](https://github.com/rig-c/core/commit/67fcf5e506c038c66f097a7dbc724a83a8283c72))
* **compile:** the key-order cycle sentence requires equal authored times and checks every trailing key; a pair that collapses on one float32 says so ([#1529](https://github.com/rig-c/core/issues/1529)) ([22f4c42](https://github.com/rig-c/core/commit/22f4c42ba1262405e4be86731f6b938d97243e93))
* **pose:** an ambiguity groups its margin into places before the repeat test, so a twin with a same-centre turned fit still reads as drawn more than once ([#1535](https://github.com/rig-c/core/issues/1535)) ([808e359](https://github.com/rig-c/core/commit/808e359637bb5b2166b43efb38883820774798a8))


### Performance Improvements

* **core:** hand the posed vertex arrays on instead of mapping them again, merge deform into the world pass, and share frozen UV and triangle arrays ([#1539](https://github.com/rig-c/core/issues/1539)) ([28cd34e](https://github.com/rig-c/core/commit/28cd34e5d5de6f44f180baa5d0ff55d897939cb9))

## [2.65.1](https://github.com/rig-c/core/compare/v2.65.0...v2.65.1) (2026-10-20)


### Bug Fixes

* **pose:** a control holds twins six tenths of a span apart as two placements, and an ambiguity of one size in two places names the unordered set instead of a window ([#1521](https://github.com/rig-c/core/issues/1521)) ([ded712f](https://github.com/rig-c/core/commit/ded712fcc471b1f2be01f30b5030d6f8c41bc110))

## [2.65.0](https://github.com/rig-c/core/compare/v2.64.3...v2.65.0) (2026-10-20)


### Features

* **films:** the three films re-cut on rig-c 2.64.3 with the band reading rig-c, each at 1× and a 1200×810 2× ([#1518](https://github.com/rig-c/core/issues/1518)) ([b2d8bf9](https://github.com/rig-c/core/commit/b2d8bf9358b1219207ca7c166a7ce6d865f813d0))


### Bug Fixes

* **ci:** every run that may publish shares one concurrency group, and a confirmation has its own ([#1516](https://github.com/rig-c/core/issues/1516)) ([3bb567f](https://github.com/rig-c/core/commit/3bb567f74b42635ff6ac9964b8445e6fe4330207))
* **ci:** the tag dispatch refuses a prerelease tag by name — this workflow publishes under latest only ([#1515](https://github.com/rig-c/core/issues/1515)) ([8301cba](https://github.com/rig-c/core/commit/8301cbac3886d12df054a2d8fb7b99a1f8e8c28d))
* **compile:** the key-order refusal names both keys and, when the keys repeat, that a cycle's closing key is the next cycle's first ([#1513](https://github.com/rig-c/core/issues/1513)) ([b12ae46](https://github.com/rig-c/core/commit/b12ae46a61b729bd7899b9ba3311869edc1a8f69))

## [2.64.3](https://github.com/rig-c/core/compare/v2.64.2...v2.64.3) (2026-10-20)


### Bug Fixes

* **ci:** a tag release-please cut whose npm publish did not land is republished by workflow_dispatch(tag), through the same gate and publish ([#1508](https://github.com/rig-c/core/issues/1508)) ([c8bb346](https://github.com/rig-c/core/commit/c8bb346d2e8bb18aff2d0335711da87c9d5d2b7d))
* **cli:** render --help's --out row names the set directory each rate writes, and two controls hold the row and the printed paths to the folders on disk ([#1511](https://github.com/rig-c/core/issues/1511)) ([dd6619e](https://github.com/rig-c/core/commit/dd6619ec9004af0a27b30176e1ebb1966fc71fc3))

## [2.64.2](https://github.com/rig-c/core/compare/v2.64.1...v2.64.2) (2026-10-20)


### Bug Fixes

* **core:** apply transverse physics scale modes ([#1454](https://github.com/rig-c/core/issues/1454)) ([7e3fdf5](https://github.com/rig-c/core/commit/7e3fdf5e35267095c5b09e021670c0308d5662a8))

## [2.64.1](https://github.com/rig-c/core/compare/v2.64.0...v2.64.1) (2026-10-19)


### Bug Fixes

* **cli:** route every console.log through writeWhole at the one entry, so a non-blocking stdout gets the whole output ([#1498](https://github.com/rig-c/core/issues/1498)) ([8720c1f](https://github.com/rig-c/core/commit/8720c1f34a5ddeab23783323da6e923e01a881d1))

## [2.64.0](https://github.com/rig-c/core/compare/v2.63.0...v2.64.0) (2026-10-19)


### Features

* **review:** rigc review is the launcher — a bare target opens, never installs, reads review's Bun floor, refuses by name ([#1492](https://github.com/rig-c/core/issues/1492)) ([0a91020](https://github.com/rig-c/core/commit/0a910200cf1d7723cf8a16e639e083abd9232add)), closes [#1486](https://github.com/rig-c/core/issues/1486)


### Bug Fixes

* **bin:** read the CLI's exit and signal before spawnSync's error, so a refusal under Bun is not "could not launch bun" ([#1496](https://github.com/rig-c/core/issues/1496)) ([e302d72](https://github.com/rig-c/core/commit/e302d7282405194c4005976cc4845e9cbfc517eb)), closes [#1488](https://github.com/rig-c/core/issues/1488)
* **guide:** write the guide whole through a loop that survives short writes, so Bun 1.2.0 stops corrupting a byte ([#1495](https://github.com/rig-c/core/issues/1495)) ([a3703dc](https://github.com/rig-c/core/commit/a3703dcd14cf0e044ed5c80ebe836a30112b390e)), closes [#1487](https://github.com/rig-c/core/issues/1487)
* **selftest:** one memory base row per platform and Bun line, so the declared minimum Bun is held to its own ceiling ([#1497](https://github.com/rig-c/core/issues/1497)) ([d5e6347](https://github.com/rig-c/core/commit/d5e6347f46941b6aecc411097e4256371ac4fc62)), closes [#1490](https://github.com/rig-c/core/issues/1490)

## [2.63.0](https://github.com/rig-c/core/compare/v2.62.0...v2.63.0) (2026-10-19)


### Features

* **render:** --overlaps names which slot covers which, per frame, with an outline plate ([#1483](https://github.com/rig-c/core/issues/1483)) ([3e10594](https://github.com/rig-c/core/commit/3e1059408911e1a7fad49a73ea62420db604fac2)), closes [#1480](https://github.com/rig-c/core/issues/1480)


### Bug Fixes

* **render:** the overlaps plate spells slot names in lowercase and places labels that do not collide ([#1491](https://github.com/rig-c/core/issues/1491)) ([396655d](https://github.com/rig-c/core/commit/396655d47897477e25dbe1df176f0784abc48d46)), closes [#1484](https://github.com/rig-c/core/issues/1484)
* **selftest:** run on the declared minimum Bun 1.2.0, reporting what it cannot check as a SKIP and a HOLE ([#1489](https://github.com/rig-c/core/issues/1489)) ([9b3aa9b](https://github.com/rig-c/core/commit/9b3aa9b82d6482d7d175a2bdd90633556de4fa09)), closes [#1482](https://github.com/rig-c/core/issues/1482)

## [2.62.0](https://github.com/rig-c/core/compare/v2.61.1...v2.62.0) (2026-10-19)


### Features

* **scripts:** verify:nova, a thin hand that prepares the tree the full selftest needs on the pool ([#1478](https://github.com/rig-c/core/issues/1478)) ([a40e7f8](https://github.com/rig-c/core/commit/a40e7f80b6d2a4be05d0ae61f73d10e84286050d)), closes [#1474](https://github.com/rig-c/core/issues/1474)


### Bug Fixes

* **selftest:** CUR11 asks git with a pattern no Bun can drop, and refuses an empty listing ([#1481](https://github.com/rig-c/core/issues/1481)) ([3e77fb9](https://github.com/rig-c/core/commit/3e77fb9dc6794c277d93ef615433a554b7d7b624)), closes [#1477](https://github.com/rig-c/core/issues/1477)

## [2.61.1](https://github.com/rig-c/core/compare/v2.61.0...v2.61.1) (2026-10-19)


### Bug Fixes

* **review:** refuse an empty argument by name where the running Bun would drop it ([#1476](https://github.com/rig-c/core/issues/1476)) ([352bb01](https://github.com/rig-c/core/commit/352bb0165bdfa49958639671b3f9d2b7e0c01ab2)), closes [#1465](https://github.com/rig-c/core/issues/1465)
* **stop:** one number format for the stops refusals, rounded so it never fakes an acceptance ([#1473](https://github.com/rig-c/core/issues/1473)) ([687cbb1](https://github.com/rig-c/core/commit/687cbb1be966391447d771e115236dbf4f711ff4)), closes [#1463](https://github.com/rig-c/core/issues/1463)

## [2.61.0](https://github.com/rig-c/core/compare/v2.60.0...v2.61.0) (2026-10-19)


### Features

* **render:** say whether the physics ran, per set ([#1467](https://github.com/rig-c/core/issues/1467)) ([#1472](https://github.com/rig-c/core/issues/1472)) ([e356dab](https://github.com/rig-c/core/commit/e356dab1a18659b6b0027fcf7e1b55662257999e))


### Bug Fixes

* **build:** name the remedy for a directory input and a missing --out ([#1469](https://github.com/rig-c/core/issues/1469)) ([c5b3bce](https://github.com/rig-c/core/commit/c5b3bce6d2edf5ecad9debed3a5759eccacb9f43)), closes [#1466](https://github.com/rig-c/core/issues/1466)

## [2.60.0](https://github.com/rig-c/core/compare/v2.59.0...v2.60.0) (2026-10-18)


### Features

* **cli:** rigc review delegates to the installed @rig-c/review bin ([#1462](https://github.com/rig-c/core/issues/1462)) ([70ecefa](https://github.com/rig-c/core/commit/70ecefac03d8e5d89b7ff7e3a9835e24698a24f0))
* **render:** render --seam — per-frame seam gap and ghost between two slots, a reading that never moves the exit status ([#1464](https://github.com/rig-c/core/issues/1464)) ([24b4714](https://github.com/rig-c/core/commit/24b471410f587c0df29cfe36f0e36d49583b15eb))


### Bug Fixes

* **stop:** name the link, the point and the remedy when a first-link bound passes a half turn ([#1460](https://github.com/rig-c/core/issues/1460)) ([3886df5](https://github.com/rig-c/core/commit/3886df552bcf4af5b322764b065be17cca2a199a)), closes [#1455](https://github.com/rig-c/core/issues/1455)

## [2.59.0](https://github.com/rig-c/core/compare/v2.58.1...v2.59.0) (2026-10-15)


### Features

* **mesh:** promise segments preflight helpers ([#1451](https://github.com/rig-c/core/issues/1451)) ([7134fe0](https://github.com/rig-c/core/commit/7134fe07a182a0c241844de6f1a5300a600a9a15)), closes [#1450](https://github.com/rig-c/core/issues/1450)

## [2.58.1](https://github.com/rig-c/core/compare/v2.58.0...v2.58.1) (2026-10-14)


### Bug Fixes

* **guide:** index parent sections before explicit full reads ([#1448](https://github.com/rig-c/core/issues/1448)) ([844d2a1](https://github.com/rig-c/core/commit/844d2a10413aed8151c618392ea380cb5f43c6c3)), closes [#1447](https://github.com/rig-c/core/issues/1447)

## [2.58.0](https://github.com/rig-c/core/compare/v2.57.0...v2.58.0) (2026-10-14)


### Features

* **guide:** resolve compile errors to one documented row ([#1445](https://github.com/rig-c/core/issues/1445)) ([91a1342](https://github.com/rig-c/core/commit/91a134237f317638e2def70066c69a86dea26506)), closes [#1399](https://github.com/rig-c/core/issues/1399)

## [2.57.0](https://github.com/rig-c/core/compare/v2.56.0...v2.57.0) (2026-10-14)


### Features

* **cli:** rigc help &lt;command&gt; prints what &lt;command&gt; --help prints, the spelling an agent reaches for first ([#1440](https://github.com/rig-c/core/issues/1440)) ([#1443](https://github.com/rig-c/core/issues/1443)) ([5ada1d2](https://github.com/rig-c/core/commit/5ada1d2b2ab3309a25797acddd1cfacf31d97ba2))
* **cli:** rigc split writes a rig spec and motion spec with an authored mesh cut into its connected pieces, deform keys re-sliced, so a mesh the compiler refuses as several pieces does not have to be split by hand ([#1414](https://github.com/rig-c/core/issues/1414)) ([#1438](https://github.com/rig-c/core/issues/1438)) ([cef502f](https://github.com/rig-c/core/commit/cef502f8f347d8c32d28838012ac1b34373314c0))


### Bug Fixes

* **split:** the split pointer quotes the names it prints, an orphan-to-orphan edge is dropped by name, and the meshSlots line states how far to raise the budget ([#1442](https://github.com/rig-c/core/issues/1442)) ([#1444](https://github.com/rig-c/core/issues/1444)) ([932db07](https://github.com/rig-c/core/commit/932db07d9a5ff9cf97ef39881dbdffbfbcede4be))

## [2.56.0](https://github.com/rig-c/core/compare/v2.55.0...v2.56.0) (2026-10-13)


### Features

* **core:** rig-c/core exports bezierPolyline and BEZIER_PIECES, so a curve fitter can hold its tolerance to the polyline the poser evaluates rather than to a copy of it ([#1417](https://github.com/rig-c/core/issues/1417)) ([#1434](https://github.com/rig-c/core/issues/1434)) ([75d85c9](https://github.com/rig-c/core/commit/75d85c96ac32daace49f80efab6608c9480ba113))
* **deform:** a deform transform can carry an envelope, a ramp along a stated axis or the attachment's soft mask, so a wave can ripple the hem and leave the waistband where it is ([#1413](https://github.com/rig-c/core/issues/1413)) ([#1431](https://github.com/rig-c/core/issues/1431)) ([8a9e6b7](https://github.com/rig-c/core/commit/8a9e6b7e0f6a799201948638a857f8f8feaa4d05))
* **explain:** explain --lever-fold names the steps where an inertia lever divides by a nearly vanished length on a scaleX chain, and the jumps it causes, so a folded parent's blow-up is read rather than refused ([#1427](https://github.com/rig-c/core/issues/1427)) ([#1437](https://github.com/rig-c/core/issues/1437)) ([4076b93](https://github.com/rig-c/core/commit/4076b9354dc46da1542242ca21e218a2c5a3f1fe))
* **explain:** rigc explain names the largest turn each physics constraint's bone makes in one step of each animation, so an inertia above 1 shows its whirl rather than being refused ([#1423](https://github.com/rig-c/core/issues/1423)) ([#1433](https://github.com/rig-c/core/issues/1433)) ([e6c0375](https://github.com/rig-c/core/commit/e6c03750f65ccb7d5b9aa2d15592bd10e4fcf23c))
* **render:** render pins a world viewport across candidates and names what falls outside it, reads a bone's angle range against another, and the guide names its folder and geometry.json keys as written ([#1414](https://github.com/rig-c/core/issues/1414)) ([#1435](https://github.com/rig-c/core/issues/1435)) ([98f04d5](https://github.com/rig-c/core/commit/98f04d5f2f12fa96b16f18e4a241a909265ad5c8))
* **rig:** a rig spec's stops declare a leg stop per cloth chain, which expands to the aim, copy and clamp network that keeps a hem out of a thigh, so it no longer has to be assembled by hand ([#1413](https://github.com/rig-c/core/issues/1413)) ([#1436](https://github.com/rig-c/core/issues/1436)) ([c1bc27c](https://github.com/rig-c/core/commit/c1bc27c8b79257ee83b7c99761cd57546443a68a))

## [2.55.0](https://github.com/rig-c/core/compare/v2.54.0...v2.55.0) (2026-10-13)


### Features

* **render:** rigc render --pass-through names every frame where a cloth slot drawn over a leg slot has its side running through the leg's drawn outline, a reading as --folds is ([#1413](https://github.com/rig-c/core/issues/1413)) ([#1428](https://github.com/rig-c/core/issues/1428)) ([c70f4a9](https://github.com/rig-c/core/commit/c70f4a92bd4b12c27136b1e142bcba1d2fc8b27d))
* **validate:** A23 refuses damping 1 and an animation that holds strength at 0 for as long as it plays, the two runaways the step-stability clause could not see ([#1422](https://github.com/rig-c/core/issues/1422)) ([#1429](https://github.com/rig-c/core/issues/1429)) ([25cc02a](https://github.com/rig-c/core/commit/25cc02a312d13453b1913b78bb0de475a8a11714))

## [2.54.0](https://github.com/rig-c/core/compare/v2.53.0...v2.54.0) (2026-10-13)


### Features

* **render:** rigc render --environment draws a rig under a schedule of wind and gravity, posed the same through rigc's core and through spine-core, so a gust can be watched rather than assumed ([#1416](https://github.com/rig-c/core/issues/1416)) ([#1426](https://github.com/rig-c/core/issues/1426)) ([ab0b424](https://github.com/rig-c/core/commit/ab0b4246fd6339804ef3e6d7c188109d4eabab43))
* **validate:** A23 refuses a physics constraint whose step cannot settle, strength·massInverse·step² at or past 2·(1 + damping^(60·step)), at setup and on each animation's worst keyed combination ([#1416](https://github.com/rig-c/core/issues/1416)) ([#1424](https://github.com/rig-c/core/issues/1424)) ([b10ecf2](https://github.com/rig-c/core/commit/b10ecf2d53cc602c4a9b59435e38a4e11ce111f2))

## [2.53.0](https://github.com/rig-c/core/compare/v2.52.0...v2.53.0) (2026-10-13)


### Features

* **mesh:** a segments mesh can weight each vertex to every chain link near it with a falloff that reaches zero at a stated radius, so a skirt bends as one sheet rather than as strips ([#1415](https://github.com/rig-c/core/issues/1415)) ([#1420](https://github.com/rig-c/core/issues/1420)) ([372a610](https://github.com/rig-c/core/commit/372a6108a13a80e7aa74e5a6f8f179ebd687629c))

## [2.52.0](https://github.com/rig-c/core/compare/v2.51.1...v2.52.0) (2026-10-13)


### Features

* **core:** a live track takes the world its physics answers, because cloth has to move with the wind and with the rig the consumer carries across the scene ([#1416](https://github.com/rig-c/core/issues/1416)) ([#1418](https://github.com/rig-c/core/issues/1418)) ([a630155](https://github.com/rig-c/core/commit/a6301552b775e653c40381dc731747e6f547b050))

## [2.51.1](https://github.com/rig-c/core/compare/v2.51.0...v2.51.1) (2026-10-13)


### Bug Fixes

* **emit:** a weighted attachment is written in one bone order, because the Spine editor refuses one whose vertices list their bones in two ([#1407](https://github.com/rig-c/core/issues/1407)) ([#1410](https://github.com/rig-c/core/issues/1410)) ([2c753fa](https://github.com/rig-c/core/commit/2c753fae726532f1a2b362a31048c658e42db9f6))

## [2.51.0](https://github.com/rig-c/core/compare/v2.50.0...v2.51.0) (2026-10-13)


### Features

* **validate:** A11 and A27 are retired, because the player rig-play names draws a clipping attachment and a region on a page named for something else in both of its modes ([#1404](https://github.com/rig-c/core/issues/1404)) ([#1408](https://github.com/rig-c/core/issues/1408)) ([f9f1937](https://github.com/rig-c/core/commit/f9f19378aa69c38161484d33ec9a3169621a89e8))

## [2.50.0](https://github.com/rig-c/core/compare/v2.49.0...v2.50.0) (2026-10-13)


### Features

* **validate:** the opt-in profile is rig-play, and --profile spine-html reads as it for one minor ([#1277](https://github.com/rig-c/core/issues/1277)) ([#1405](https://github.com/rig-c/core/issues/1405)) ([01f51a1](https://github.com/rig-c/core/commit/01f51a17519a4807d2221dd676b25405ee12029f))

## [2.49.0](https://github.com/rig-c/core/compare/v2.48.0...v2.49.0) (2026-10-13)


### Features

* **core:** live tracks take a physics clock, and rig-c/core exports the render's ([#1396](https://github.com/rig-c/core/issues/1396)) ([#1402](https://github.com/rig-c/core/issues/1402)) ([ee3e9dd](https://github.com/rig-c/core/commit/ee3e9dd0b3741f588d133d4fe3b3c5f73458b0b7))

## [2.48.0](https://github.com/rig-c/core/compare/v2.47.1...v2.48.0) (2026-10-13)


### Features

* **guide:** rigc guide prints the row a failure line names, and every such line ends with the command ([#1397](https://github.com/rig-c/core/issues/1397)) ([#1398](https://github.com/rig-c/core/issues/1398)) ([907e820](https://github.com/rig-c/core/commit/907e82006a71da3e5608a110c39e1d1eabe4eacd))

## [2.47.1](https://github.com/rig-c/core/compare/v2.47.0...v2.47.1) (2026-10-12)


### Bug Fixes

* **mesh:** the motion comparison steps its physics on the render's clock ([#1389](https://github.com/rig-c/core/issues/1389)) ([#1393](https://github.com/rig-c/core/issues/1393)) ([a659147](https://github.com/rig-c/core/commit/a6591470085be629b8b4180be74aa3d38e3b9ccb))


### Instrument

* **folds:** hold the degenerate line from both sides with a triangle just below it and one just above it ([#1390](https://github.com/rig-c/core/issues/1390)) ([#1391](https://github.com/rig-c/core/issues/1391)) ([ad453ef](https://github.com/rig-c/core/commit/ad453efebf6ca85a00209e5bea5dbbe52ba8104e))

## [2.47.0](https://github.com/rig-c/core/compare/v2.46.0...v2.47.0) (2026-10-12)


### Features

* **render:** the fold reading says where and how big - a world box and a setup-pose area per folded frame - and inspect --zoom folds frames the picture to it ([#1386](https://github.com/rig-c/core/issues/1386)) ([#1387](https://github.com/rig-c/core/issues/1387)) ([4f8b156](https://github.com/rig-c/core/commit/4f8b156998049a6ca0e903954abfa2fe17109d76))

## [2.46.0](https://github.com/rig-c/core/compare/v2.45.2...v2.46.0) (2026-10-12)


### Features

* **render:** render --folds names the mesh triangles that turn over against the setup pose, and inspect --show folds fills them ([#1383](https://github.com/rig-c/core/issues/1383)) ([#1384](https://github.com/rig-c/core/issues/1384)) ([6a6ae3e](https://github.com/rig-c/core/commit/6a6ae3e7099f0db4bf0ea99023a52d0f7451336c))

## [2.45.2](https://github.com/rig-c/core/compare/v2.45.1...v2.45.2) (2026-10-12)


### Bug Fixes

* **render:** a render's physics clock runs 2^-30 ahead of its frames, so no frame ends on a physics step's tie and a looping spring closes — held by LS05 and LS06 ([#1380](https://github.com/rig-c/core/issues/1380)) ([#1381](https://github.com/rig-c/core/issues/1381)) ([c3876b5](https://github.com/rig-c/core/commit/c3876b51b4c3dfd0c2cbdb8f4a727091cf5cdd8e))

## [2.45.1](https://github.com/rig-c/core/compare/v2.45.0...v2.45.1) (2026-10-12)


### Bug Fixes

* **determinism:** every 2-D length under src/ is the square root of the sum of squares, not Math.hypot, whose last bit Bun 1.4.2 rounds differently on macOS and Linux — held by CUR128 ([#1377](https://github.com/rig-c/core/issues/1377)) ([#1378](https://github.com/rig-c/core/issues/1378)) ([562b8d3](https://github.com/rig-c/core/commit/562b8d338450a43c1df5b486da5a6dc19ad335bd))

## [2.45.0](https://github.com/rig-c/core/compare/v2.44.0...v2.45.0) (2026-10-12)


### Features

* **mesh:** reduceMesh names what refused each kept vertex in the last removal pass — opt-in explainKept writes changes.kept, per-reason counts split boundary / interior and, by-vertex, each vertex's refusal — held to the attempt observer by MQ176 and MQ177 ([#1374](https://github.com/rig-c/core/issues/1374)) ([#1375](https://github.com/rig-c/core/issues/1375)) ([d85ea01](https://github.com/rig-c/core/commit/d85ea011a5a72143f60fb2dcf49ea6ec535883b6))

## [2.44.0](https://github.com/rig-c/core/compare/v2.43.0...v2.44.0) (2026-10-11)


### Features

* **cli:** rigc inspect draws where a rig's triangles are — --show density fills each region and mesh by its triangles per posed world unit² over the figure's, on a log ramp centred on 1x, with the figure's totals over every slot and each slot's row in the legend — held by IN41–IN49 ([#1371](https://github.com/rig-c/core/issues/1371)) ([#1372](https://github.com/rig-c/core/issues/1372)) ([0f42708](https://github.com/rig-c/core/commit/0f427084f77d73483a0770ca7507b7bf51f98dc9))

## [2.43.0](https://github.com/rig-c/core/compare/v2.42.0...v2.43.0) (2026-10-11)


### Features

* **cli:** rigc inspect draws one part's mesh, hull, weights and number over the whole painting — --overlay-slot/--hide-overlay-slot globs, meshes[] and slots[] listing only the slots kept, slotFilter in the legend, a pattern matching no slot refused naming the slots, no flag drawing what it drew — held by IN36–IN40 ([#1363](https://github.com/rig-c/core/issues/1363)) ([#1365](https://github.com/rig-c/core/issues/1365)) ([d9fb3b3](https://github.com/rig-c/core/commit/d9fb3b3cebbdcdb66a42cb994619c61a7cde02fd))

## [2.42.0](https://github.com/rig-c/core/compare/v2.41.0...v2.42.0) (2026-10-11)


### Features

* **cli:** rigc inspect draws what a bone moves and two builds on one transform — mesh edges, hulls, one bone's weights as a heat read off skeleton.json, the draw order at the pose, --compare beside a second build, one name label per pixel with no label over another, and --bone/--hide-bone globs — held by IN16–IN35 ([#1357](https://github.com/rig-c/core/issues/1357)) ([#1362](https://github.com/rig-c/core/issues/1362)) ([00e7202](https://github.com/rig-c/core/commit/00e7202c6449c789b1d11d448b4a6420a6ce356d))

## [2.41.0](https://github.com/rig-c/core/compare/v2.40.1...v2.41.0) (2026-10-11)


### Features

* **cli:** rigc inspect draws one moment of a build for an agent to read — bones, names, axes, a world grid and the declared axes over the art at the setup pose, one grid time or a sheet, zoomed to a bone, a slot or a box — with a legend stating the transform both ways and every bone's origin and tip in world units and pixels, posed as render poses it and held by IN01–IN15 ([#1357](https://github.com/rig-c/core/issues/1357)) ([#1360](https://github.com/rig-c/core/issues/1360)) ([9b18801](https://github.com/rig-c/core/commit/9b188010e373cb0074447afb74ade8d242ba3eb2))

## [2.40.1](https://github.com/rig-c/core/compare/v2.40.0...v2.40.1) (2026-10-11)


### Bug Fixes

* **release:** a pull request whose squash text release-please cannot parse is refused before the merge — release-please's own parser pinned at 0.4.1, 1c04a03 refused at the release log's 20:23, 49 of the last 50 on main parsing, on every edit (CUR124, CUR125) ([#1354](https://github.com/rig-c/core/issues/1354)) ([#1356](https://github.com/rig-c/core/issues/1356)) ([0012363](https://github.com/rig-c/core/commit/0012363321e10728ca08397fdade1caf58d3b224))

## [2.40.0](https://github.com/rig-c/core/compare/v2.39.1...v2.40.0) (2026-10-11)


### Features

* **validate:** A51 holds the bones a rig declares to share an axis to the line through two named bones' setup-pose origins — invariants.axes, refused by name at read, validity under the default profile, equal on both suppliers (AX01–AX06), and declared on gallery/look, nod and portrait at 0.0000° off with no emitted byte moved ([#1351](https://github.com/rig-c/core/issues/1351)) ([#1353](https://github.com/rig-c/core/issues/1353)) ([ef0921a](https://github.com/rig-c/core/commit/ef0921aea81c45d74414aa9656ea5a65c1e448ed))

## [2.39.1](https://github.com/rig-c/core/compare/v2.39.0...v2.39.1) (2026-10-11)


### Bug Fixes

* **pkg:** the repository is rig-c/core and @rig-c/core is published as a third name — 761 links moved in 66 files with the skills' 31 repository URLs and README's 35 blob/tree links read before and after, ALIASES a list CUR122 holds release.yml to name for name (each alias dropped from the publish or either confirmation red over 15 plants), and the scoped pack reading 219 of 219 files the same ([#1347](https://github.com/rig-c/core/issues/1347)) ([#1348](https://github.com/rig-c/core/issues/1348)) ([f2bd939](https://github.com/rig-c/core/commit/f2bd93901d20c14e451a2fd3872e8612c9312e77))

## [2.39.0](https://github.com/firejune/rigc/compare/v2.38.0...v2.39.0) (2026-10-11)


### Features

* **core:** an entry's alpha and additive blending on openTracks — MixOptions.alpha/additive and setAlpha as spine-core 4.3.13's TrackEntry weighs and adds: 3,978 of 3,978 poses equal at tolerance 0 over 18 walks on six gallery-and-probe subjects and a blend probe; alpha inverted or ignored, additive as replace, an additive rotation through the remembered direction and the holds as if no entry added each red ([#1344](https://github.com/firejune/rigc/issues/1344)) ([#1345](https://github.com/firejune/rigc/issues/1345)) ([0c1c296](https://github.com/firejune/rigc/commit/0c1c2966b364b87f09390c364bc2dd7bb1be546d))

## [2.38.0](https://github.com/firejune/rigc/compare/v2.37.0...v2.38.0) (2026-10-11)


### Features

* **repack:** `--keep-pages` writes skeleton.model.json alone for the atlas and pages as they stand — build --atlas-in over the input atlas reproduces nod's and flex's skeleton.json byte for byte, the document's pages equal the atlas, poses equal build's document at tolerance 0 and render draws build's pixels from the untouched pages; a renamed region, a differing skeleton, a line the document cannot state and an existing document each refused by name ([#1339](https://github.com/firejune/rigc/issues/1339)) ([#1342](https://github.com/firejune/rigc/issues/1342)) ([6252b70](https://github.com/firejune/rigc/commit/6252b707d737ea3500877c615a6a3f0c620ecf8b))

## [2.37.0](https://github.com/firejune/rigc/compare/v2.36.0...v2.37.0) (2026-10-11)


### Features

* **core:** the live tracks — `openTracks` sets, queues, mixes and empties several animations as spine-core 4.3.13's AnimationState does, sharing the single track's pose path: 2,652 of 2,652 poses equal at tolerance 0 over 12 walks on five gallery rows and an event probe; the mix reversed, higher tracks from setup, the hold faded and a queued delay read as now each red on 12 of 12 ([#1336](https://github.com/firejune/rigc/issues/1336)) ([#1340](https://github.com/firejune/rigc/issues/1340)) ([0da9e22](https://github.com/firejune/rigc/commit/0da9e2206d2b462e30ae20a73d0ebcd15552534b))

## [2.36.0](https://github.com/firejune/rigc/compare/v2.35.1...v2.36.0) (2026-10-10)


### Features

* **core:** a player's bone-local adjustment — `openTrack({ adjust })` writes the locals after the timelines and before the world, constraints and physics, held to spine-core 4.3.13's `Bone.pose` on gallery/look: 1,812 of 1,812 poses equal at tolerance 0 over 12 walks; the write carried, at draw time and missing on pose 0 each red ([#1336](https://github.com/firejune/rigc/issues/1336)) ([#1337](https://github.com/firejune/rigc/issues/1337)) ([baae184](https://github.com/firejune/rigc/commit/baae184c11d59e7831b559f598f39f18329677de))

## [2.35.1](https://github.com/firejune/rigc/compare/v2.35.0...v2.35.1) (2026-10-10)


### Bug Fixes

* **docs:** the headline says what the tool makes, and names Spine once as the format ([#1334](https://github.com/firejune/rigc/issues/1334)) ([399cb2b](https://github.com/firejune/rigc/commit/399cb2bd8c557870d4e165dc071cc00a0744ea6e))

## [2.35.0](https://github.com/firejune/rigc/compare/v2.34.0...v2.35.0) (2026-10-10)


### Features

* **core:** a live track — `openTrack(doc, animation, { loop, reset })` stepped one `dt` at a time on the batch walk's own body, with events across the wrap and the clipped rows measured against spine-core 4.3.13: 229,656 of 229,656 steps fire what AnimationState's listener fires, the refactored walks byte-identical on 157,771 poses, `openTrack` equal to `poseRawAnimation` on 103,607 and to `poseLoopingWalk` on 44,980 ([#1276](https://github.com/firejune/rigc/issues/1276)) ([#1332](https://github.com/firejune/rigc/issues/1332)) ([486adb6](https://github.com/firejune/rigc/commit/486adb6024121029ae9ed3267540e22fb1fa8358))

## [2.34.0](https://github.com/firejune/rigc/compare/v2.33.0...v2.34.0) (2026-10-10)


### Features

* **package:** a named entry `rig-c/core` for the poser a browser player links — readModel, the raw and looping walks, the page-UV and clip rules, promised by observation (rig-play), held by the smoke from an install with no spine-core and measured to bundle for a browser with no node module reached (vite 8.2.2, 150,995 bytes), its closure held to `src/core/` by CUR123 ([#1275](https://github.com/firejune/rigc/issues/1275)) ([#1330](https://github.com/firejune/rigc/issues/1330)) ([dd48900](https://github.com/firejune/rigc/commit/dd48900d76ef61151b765add494baf92fc8b51be))

## [2.33.0](https://github.com/firejune/rigc/compare/v2.32.2...v2.33.0) (2026-10-10)


### Features

* **mesh:** named interior lines on a reduction and a measurement — `lines: NamedLine[]` held as the hull is: a line vertex leaves only when `MQ_LINE_DEVIATION` (the boundary row's exact symmetric Hausdorff, per line, against the line's own `maxDeviation`) stays in bound and its kept neighbours are joined by a result edge, line runs under the existing `boundaryRuns` opt-in, refused by name under `REDUCE_INPUT_LINE`; absent `lines`, 64 of 64 recorded calls byte-identical ([#1326](https://github.com/firejune/rigc/issues/1326)) ([#1328](https://github.com/firejune/rigc/issues/1328)) ([bb74e90](https://github.com/firejune/rigc/commit/bb74e902b6ef142388f156f91e3ece87ee2bae48))

## [2.32.2](https://github.com/firejune/rigc/compare/v2.32.1...v2.32.2) (2026-10-10)


### Bug Fixes

* **mesh:** the comparison's carrier rule re-reads a sample's support by distance when the per-coordinate reading refuses it — a sample on a 45° shared edge that six-decimal UV rounding moved 1.35e-10 into a sliver was refused as two carriers; the result had no fold (280 of 280 triangles one sign, every interior edge consistent, areas summing to the outline), measured ([#1323](https://github.com/firejune/rigc/issues/1323)) ([#1324](https://github.com/firejune/rigc/issues/1324)) ([1001caf](https://github.com/firejune/rigc/commit/1001cafe104e1d4066aa8dbadeb53722e9d07898))

## [2.32.1](https://github.com/firejune/rigc/compare/v2.32.0...v2.32.1) (2026-10-10)


### Bug Fixes

* **mesh:** refineRegions refuses, by name, an insertion whose triangle MQ_DEGENERATE would read as degenerate, instead of writing it — the square region's three degenerate triangles are the band's outer boundary landing 0.46 px inside a lattice row, not the region's side on the lattice; a second public instance (26 hidden degenerates) is closed by the same rule ([#1311](https://github.com/firejune/rigc/issues/1311)) ([#1321](https://github.com/firejune/rigc/issues/1321)) ([b86a73d](https://github.com/firejune/rigc/commit/b86a73df6aeb26785541a148ab593767d4f02d53))

## [2.32.0](https://github.com/firejune/rigc/compare/v2.31.2...v2.32.0) (2026-10-10)


### Features

* **mesh:** compareMeshesInMotion takes overBound — opt-in, the samples over each motion bound with their carrying triangle, worst first under a declared cap with the total stated, and a per-triangle maximum of every bounded motion row over the selection frames; byte-identical without it — and the localisation premise measured false on the fixture ([#1315](https://github.com/firejune/rigc/issues/1315)) ([#1316](https://github.com/firejune/rigc/issues/1316)) ([52bc534](https://github.com/firejune/rigc/commit/52bc534ff6f020c481aaceb64dc1bd2b229d024f))

## [2.31.2](https://github.com/firejune/rigc/compare/v2.31.1...v2.31.2) (2026-10-10)


### Performance Improvements

* **mesh:** the deviation floor is read from the outline walk before any structure is built for the candidate — byte-identical on 87 of 87 recorded calls and 12 of 12 under weightJump, every refusal named as before, 49 % off the trial call on the largest public input after C1 ([#1309](https://github.com/firejune/rigc/issues/1309), §9's C2) ([#1312](https://github.com/firejune/rigc/issues/1312)) ([31f27e6](https://github.com/firejune/rigc/commit/31f27e6044a3a9d3905c7859f7ab967ad3c1399f))

## [2.31.1](https://github.com/firejune/rigc/compare/v2.31.0...v2.31.1) (2026-10-09)


### Performance Improvements

* **mesh:** edge sets on the removal and boundary-run paths keyed without strings and built only where read — byte-identical on 87 of 87 recorded calls and 12 of 12 under weightJump, 56 % off the trial call and 39 % off the skinning call on the largest public input ([#1307](https://github.com/firejune/rigc/issues/1307), §9's C1) ([#1308](https://github.com/firejune/rigc/issues/1308)) ([2412292](https://github.com/firejune/rigc/commit/241229274a5bffd9215766c3a3807bf939102712))

## [2.31.0](https://github.com/firejune/rigc/compare/v2.30.0...v2.31.0) (2026-10-09)


### Features

* **mesh:** reduceMesh takes targets.skinning — every removal, boundary run and post-pass is held to MQ_SKINNING_RESIDUAL against the call's own source and refused by name when over it, the residual carried per sample and equal to the full recompute on every trial; and uvCarriers searches a grid instead of every triangle, carriers unchanged ([#1295](https://github.com/firejune/rigc/issues/1295)) ([#1298](https://github.com/firejune/rigc/issues/1298)) ([43545f9](https://github.com/firejune/rigc/commit/43545f9b0f793f4e0ed6f186cbc3b878d40fe7f0))

## [2.30.0](https://github.com/firejune/rigc/compare/v2.29.0...v2.30.0) (2026-10-09)


### Features

* **mesh:** MQ_SKINNING_RESIDUAL — a pose-free, source-relative bound in drawing px on how far a candidate draws each UV from where its source draws it under a declared skinning envelope, held against the poser on nine candidates and never understating it; and skinningEnvelopeBone, the helper that turns declared rotation, scale and translation ranges into an envelope entry ([#1294](https://github.com/firejune/rigc/issues/1294)) ([#1296](https://github.com/firejune/rigc/issues/1296)) ([cbf4012](https://github.com/firejune/rigc/commit/cbf4012bea6c49290c976b511cb0ef56b041d63f))

## [2.29.0](https://github.com/firejune/rigc/compare/v2.28.0...v2.29.0) (2026-10-09)


### Features

* **mesh:** motionAmplitude.gradation is optional and the author's — no derivation from what a rig declares holds, measured on 19 subjects — so an amplitude without it measures MQ_DEFORM_LOAD and reads MQ_ALLOCATION_CONTRAST not-measurable naming it; compareMeshesInMotion takes motionAmplitude; the Stage B rerun and Q1's correction recorded ([#1291](https://github.com/firejune/rigc/issues/1291)) ([#1292](https://github.com/firejune/rigc/issues/1292)) ([931dfcb](https://github.com/firejune/rigc/commit/931dfcb83ea46e74c57e5f7af29d588e35bad00a))

## [2.28.0](https://github.com/firejune/rigc/compare/v2.27.0...v2.28.0) (2026-10-09)


### Features

* **mesh:** reduceMesh takes motionAmplitude and hands it to the result's own measurement, so MQ_ALLOCATION_CONTRAST and MQ_DEFORM_LOAD are measured on a reduction's report when the caller declares it — final measurement only, measured ([#1287](https://github.com/firejune/rigc/issues/1287)) ([#1289](https://github.com/firejune/rigc/issues/1289)) ([4ab5e98](https://github.com/firejune/rigc/commit/4ab5e98a7f472584ec9b20dd679ca5876c04d7c8))

## [2.27.0](https://github.com/firejune/rigc/compare/v2.26.0...v2.27.0) (2026-10-09)


### Features

* **mesh:** reduceMesh takes retriangulate: 'delaunay' — a post-pass that re-triangulates the kept vertex set once the reduction ends, taken only when every required row still passes — and removalOrder: 'deformation-load'; both opt-in, the opt-out path byte-identical, replay byte-exact ([#1283](https://github.com/firejune/rigc/issues/1283)) ([#1286](https://github.com/firejune/rigc/issues/1286)) ([5be70d8](https://github.com/firejune/rigc/commit/5be70d8162bbba5b96977538217e7a1752243e7d))

## [2.26.0](https://github.com/firejune/rigc/compare/v2.25.0...v2.26.0) (2026-10-09)


### Features

* **mesh:** five allocation rows — MQ_GRADE, MQ_MIN_ANGLE_P10, MQ_ALLOCATION_CONTRAST, MQ_DEFORM_LOAD, MQ_BOUNDARY_NECESSARY — reported undeclared by every measurement, and the optional motionAmplitude the two weight-aware rows read, not-measurable without it ([#1280](https://github.com/firejune/rigc/issues/1280)) ([#1284](https://github.com/firejune/rigc/issues/1284)) ([44c5fc9](https://github.com/firejune/rigc/commit/44c5fc9963ae77e986133d9eb6a7d52038fbc8d8))

## [2.25.0](https://github.com/firejune/rigc/compare/v2.24.1...v2.25.0) (2026-10-09)


### Features

* **mesh:** acceptedAt is one entry per accepted operation, and reduceMesh takes an opt-in boundaryRuns that replaces a run of hull vertices with one chord as a single step held to every declared row — and a deviation floor that refuses no candidate the rows would accept, measured ([#1279](https://github.com/firejune/rigc/issues/1279)) ([#1281](https://github.com/firejune/rigc/issues/1281)) ([b2503e4](https://github.com/firejune/rigc/commit/b2503e475fd94bcb9d1ee6eee143e13735b542b1))

## [2.24.1](https://github.com/firejune/rigc/compare/v2.24.0...v2.24.1) (2026-10-09)


### Bug Fixes

* **docs:** the dependant is rig-parts — every mention of spine-parts in the tree follows its rename, with one note stating the old name ([#1272](https://github.com/firejune/rigc/issues/1272)) ([656c7e8](https://github.com/firejune/rigc/commit/656c7e842fb678a827f268d4bd8cb9787a08c7c7))

## [2.24.0](https://github.com/firejune/rigc/compare/v2.23.0...v2.24.0) (2026-10-09)


### Features

* **mesh:** reduceMesh reports acceptedAt and replays to the n-th accepted step by name — stopAfterAccepted ends as replayed-to-accepted-step, never as an exhausted budget; and weightJump at exactly J is condition (b), measured ([#1268](https://github.com/firejune/rigc/issues/1268)) ([#1269](https://github.com/firejune/rigc/issues/1269)) ([7473753](https://github.com/firejune/rigc/commit/74737533fa728cab9cde7dd00e9bd3de0136da13))

## [2.23.0](https://github.com/firejune/rigc/compare/v2.22.0...v2.23.0) (2026-10-08)


### Features

* **mesh:** measureAuthoredMeshFit takes connectivity 4 | 8 (default 4, unchanged) so a consumer's gate reads with the rows' fill, and a region's pixel set is found by a scanline bit-identical to inClosedPolygon — hair_back's 3 px vs 5.1 px explained, the once-per-call 1.4 s term gone ([#1262](https://github.com/firejune/rigc/issues/1262), [#1263](https://github.com/firejune/rigc/issues/1263)) ([#1264](https://github.com/firejune/rigc/issues/1264)) ([daaf732](https://github.com/firejune/rigc/commit/daaf7325cfb2921b39ecb80a8797f112979f05b0))

## [2.22.0](https://github.com/firejune/rigc/compare/v2.21.0...v2.22.0) (2026-10-08)


### Features

* **package:** publish as rig-c, with spine-rigc kept as an alias carrying the same files at every version ([#1258](https://github.com/firejune/rigc/issues/1258)) ([#1260](https://github.com/firejune/rigc/issues/1260)) ([c5f9972](https://github.com/firejune/rigc/commit/c5f9972dbf1a2e23d4d58a4f2292857f036cd930))

## [2.21.0](https://github.com/firejune/rigc/compare/v2.20.4...v2.21.0) (2026-10-08)


### Features

* **mesh:** an overshoot or undercut bound declared null is measured and reported undeclared and gates nothing — on reduceMesh's targets and sourceBounds, on measureMeshQuality and on the comparison; a field left out is still refused ([#1254](https://github.com/firejune/rigc/issues/1254)) ([#1257](https://github.com/firejune/rigc/issues/1257)) ([19b2e7f](https://github.com/firejune/rigc/commit/19b2e7fd9cd3c8556592c76972106c09013f5d49))

## [2.20.4](https://github.com/firejune/rigc/compare/v2.20.3...v2.20.4) (2026-10-08)


### Performance Improvements

* **mesh:** a region's rows are carried from the last step too — the art-pixel set of a region computed once per call, hull membership and nearest vertex re-measured only where a step changed them, edge predicates keyed by their ends — byte-identical on 19 recorded inputs, demo/bottomwear with one region 2,575 s → 10–11 s on Nova WSL ([#1253](https://github.com/firejune/rigc/issues/1253)) ([#1255](https://github.com/firejune/rigc/issues/1255)) ([e0e58df](https://github.com/firejune/rigc/commit/e0e58df5afe71b7749064d46af1c7f6aad86593a))

## [2.20.3](https://github.com/firejune/rigc/compare/v2.20.2...v2.20.3) (2026-10-08)


### Instrument

* **release:** the publish gate is the same sharded selftest CI runs — one reusable workflow called by both, and prepublishOnly accepts only that run's merged tally for the exact commit, else runs the full selftest as before ([#1249](https://github.com/firejune/rigc/issues/1249)) ([#1250](https://github.com/firejune/rigc/issues/1250)) ([40c2355](https://github.com/firejune/rigc/commit/40c23555e76180dd2e1f9f4937570015ae5ff880))

## [2.20.2](https://github.com/firejune/rigc/compare/v2.20.1...v2.20.2) (2026-10-08)


### Performance Improvements

* **mesh:** each reduction step is measured by carrying the last step's rasters, distance transform and edge distances through the few triangles a removal changes — byte-identical on 18 recorded parts inputs, demo/bottomwear 32–34 s → 3.0–3.2 s on Nova WSL, 1101 candidates both ([#1246](https://github.com/firejune/rigc/issues/1246)) ([#1247](https://github.com/firejune/rigc/issues/1247)) ([b74a01d](https://github.com/firejune/rigc/commit/b74a01d6a641e0aa1ed997a85f7f52ea572a773e))

## [2.20.1](https://github.com/firejune/rigc/compare/v2.20.0...v2.20.1) (2026-10-08)


### Performance Improvements

* **mesh:** reduceMesh takes the art's rasters once per call and hands them to every step — outputs byte-identical on 18 recorded parts inputs and every fixture, demo/bottomwear 138–185 s → 76–79 s on one loaded machine ([#1240](https://github.com/firejune/rigc/issues/1240)) ([#1242](https://github.com/firejune/rigc/issues/1242)) ([3de9084](https://github.com/firejune/rigc/commit/3de9084b16da731b97472ca307a35e96eeba5f55))


### Instrument

* **smoke:** record SourceMesh and RefinementRegion as observed on spine-rigc/mesh — spine-parts c03dd8a's automatic mode uses them, which rigc[#1238](https://github.com/firejune/rigc/issues/1238) D1 found no row recording ([#1241](https://github.com/firejune/rigc/issues/1241)) ([#1244](https://github.com/firejune/rigc/issues/1244)) ([59e73b1](https://github.com/firejune/rigc/commit/59e73b172dafd8d4acf4622ec7a701d2470c92a1))

## [2.20.0](https://github.com/firejune/rigc/compare/v2.19.1...v2.20.0) (2026-10-08)


### Features

* **mesh:** compareMeshesInMotion through the core poser — UV-carried samples, input equality, the motion section of mesh-quality-report/1 — C1 of [#1230](https://github.com/firejune/rigc/issues/1230) ([#1233](https://github.com/firejune/rigc/issues/1233)) ([3604330](https://github.com/firejune/rigc/commit/36043309ac2e81f5d0dd813461866fbd321a6a47))
* **mesh:** the spine-rigc/meshcompare entry, held by the install smoke running a comparison with no spine-core installed, and the last eight motion controls — every control the [#1221](https://github.com/firejune/rigc/issues/1221) contract lists now exists and prints (C2 of [#1230](https://github.com/firejune/rigc/issues/1230)) ([#1235](https://github.com/firejune/rigc/issues/1235)) ([2fa7d4a](https://github.com/firejune/rigc/commit/2fa7d4a439b7c7318f1ac313c48782245d092234))


### Bug Fixes

* **mesh:** contour and ring generators emit every triangle counter-clockwise in Spine world, as grid, segments and ribbon already did — CT15 holds every generator to it, a comparison over a contour build is now accepted, and gallery/flex's skeleton bytes move ([#1236](https://github.com/firejune/rigc/issues/1236)) ([#1237](https://github.com/firejune/rigc/issues/1237)) ([6264fd8](https://github.com/firejune/rigc/commit/6264fd8d4a2b7050c6f0d97e9952c8dd678846c0))

## [2.19.1](https://github.com/firejune/rigc/compare/v2.19.0...v2.19.1) (2026-10-07)


### Bug Fixes

* **mesh:** a region's density bound exempts only an edge whose contact with the region's active domain is a single point on the band's outer boundary — one predicate shared by measure and refine, the coarse quad converges, seven controls and a plant ([#1229](https://github.com/firejune/rigc/issues/1229)) ([#1231](https://github.com/firejune/rigc/issues/1231)) ([92bf679](https://github.com/firejune/rigc/commit/92bf6792eb35653e9dcd9252c9f5d579f4bb12bb))

## [2.19.0](https://github.com/firejune/rigc/compare/v2.18.0...v2.19.0) (2026-10-07)


### Features

* **mesh:** reduceMesh on spine-rigc/mesh — vertex removal with retriangulation and region refinement as two composed operations, every step held to measureMeshQuality, deform runs remapped on removal and refused by name on insertion, ten more MQ controls (B2 of [#1224](https://github.com/firejune/rigc/issues/1224)) ([#1227](https://github.com/firejune/rigc/issues/1227)) ([b6a186d](https://github.com/firejune/rigc/commit/b6a186d1fdb7a7257837ce046988fc9f09f1e9e8))

## [2.18.0](https://github.com/firejune/rigc/compare/v2.17.1...v2.18.0) (2026-10-07)


### Features

* **mesh:** measureMeshQuality and the mesh-quality-report/1 document on spine-rigc/mesh — the geometry rows of the [#1221](https://github.com/firejune/rigc/issues/1221) contract, five row states, raster sensitivity in the row's unit, and 22 MQ controls (B1 of [#1224](https://github.com/firejune/rigc/issues/1224)) ([#1225](https://github.com/firejune/rigc/issues/1225)) ([d1f7c2e](https://github.com/firejune/rigc/commit/d1f7c2e18783eb071831dbce2594f325b1925d01))

## [2.17.1](https://github.com/firejune/rigc/compare/v2.17.0...v2.17.1) (2026-10-07)


### Instrument

* **installs:** run the install smoke on macOS, Windows and Linux at Bun 1.2.0 in installs-matrix, repair four Windows assumptions in the smoke, and stop its without-bun control going red when two buns are on PATH ([#1219](https://github.com/firejune/rigc/issues/1219)) ([fdb2cf3](https://github.com/firejune/rigc/commit/fdb2cf3844ee7fe46f93d2eee2218f6fa48b9de9))

## [2.17.0](https://github.com/firejune/rigc/compare/v2.16.0...v2.17.0) (2026-10-07)


### Features

* **cli:** build and repack take --report &lt;file&gt; and write a build-report/1 JSON document of what their printed report states — rows, summary, stats, supplier, pack figures — byte-identical for one build, never in --out, with the lines unchanged ([#1217](https://github.com/firejune/rigc/issues/1217)) ([e518433](https://github.com/firejune/rigc/commit/e518433487fe7e8ffff9b17c964ec43494653554)), closes [#1213](https://github.com/firejune/rigc/issues/1213)

## [2.16.0](https://github.com/firejune/rigc/compare/v2.15.1...v2.16.0) (2026-10-07)


### Features

* **package:** name spine-rigc/rig, /mesh and /errors, hold and call every symbol the dependant imports from the install, and read a candidate against that dependant before a release is approved ([#1215](https://github.com/firejune/rigc/issues/1215)) ([72f3280](https://github.com/firejune/rigc/commit/72f3280257d0ac28958c343e210805b85f144f85)), closes [#1212](https://github.com/firejune/rigc/issues/1212)

## [2.15.1](https://github.com/firejune/rigc/compare/v2.15.0...v2.15.1) (2026-10-07)


### Bug Fixes

* **mesh:** traceAlphaOutline scans the filled silhouette for a diagonal pinch, so a corner between two holes no longer refuses a part, and a hole is background no 8-connected path reaches, so a pinch on the outline is still refused ([#1210](https://github.com/firejune/rigc/issues/1210)) ([5a82114](https://github.com/firejune/rigc/commit/5a821146f5929dc1b015f3681c00b0b79c5c3b00)), closes [#1209](https://github.com/firejune/rigc/issues/1209)

## [2.15.0](https://github.com/firejune/rigc/compare/v2.14.1...v2.15.0) (2026-10-06)


### Features

* **validate:** an ik over more than two bones, or over a pair whose second bone is not the first's child, is refused by name — by the rig-spec parser and as a clause of A47 ([#1208](https://github.com/firejune/rigc/issues/1208)) ([936c1e1](https://github.com/firejune/rigc/commit/936c1e16484c598c99f998f40984c9900203d6c9)), closes [#1205](https://github.com/firejune/rigc/issues/1205)


### Bug Fixes

* **tools:** editor_roundtrip reads the editor's version under the trip's own -u and holds it against the export's skeleton.spine, failing by name when they disagree ([#1206](https://github.com/firejune/rigc/issues/1206)) ([65cbab3](https://github.com/firejune/rigc/commit/65cbab3eccd8a711d7381882f15a6087f599085c)), closes [#1199](https://github.com/firejune/rigc/issues/1199)

## [2.14.1](https://github.com/firejune/rigc/compare/v2.14.0...v2.14.1) (2026-10-06)


### Performance Improvements

* **core:** A10's walk assembles only what it scans — no getter readings, oracle bone rows, UV/triangle or vertex copies; three cuts of 6–9 % of A10 each, core-entry build −5.0 % (installed −3.4 to −5.6 %), peak memory up to −25 %, bytes unmoved ([#1203](https://github.com/firejune/rigc/issues/1203)) ([d28f4d9](https://github.com/firejune/rigc/commit/d28f4d9a1d12eb7f06474c2622924914048a55ed))

## [2.14.0](https://github.com/firejune/rigc/compare/v2.13.3...v2.14.0) (2026-10-06)


### Features

* **validate:** A23 names a rotate, shearX or scaleX physics constraint on a zero-length bone, one sentence per reading; gallery/look's whip gets its measured length, 66 ([#1200](https://github.com/firejune/rigc/issues/1200)) ([39fb4b6](https://github.com/firejune/rigc/commit/39fb4b66f93ccc4f3d65e92f2c9e681a88e8fdcb)), closes [#1195](https://github.com/firejune/rigc/issues/1195)


### Bug Fixes

* **validate:** A41 is retired: the Spine editor drops a physics constraint's rotate, scaleX and shearX only on a zero-length bone, at export (4.3.23, 4.3.26), which A23 now refuses; the editorRoundTrip declaration goes with it ([#1202](https://github.com/firejune/rigc/issues/1202)) ([60f4154](https://github.com/firejune/rigc/commit/60f41541d18e67d2a1aa0df329264d9d28d32b02)), closes [#1196](https://github.com/firejune/rigc/issues/1196)

## [2.13.3](https://github.com/firejune/rigc/compare/v2.13.2...v2.13.3) (2026-10-06)


### Bug Fixes

* **selftest:** TY40 is a SKIP stating both figures, never a FAIL, when the driver reads the plant below what its unit wrote; reproduced on macOS under an 8–16 GB sibling: 6 of 46 plants read 610–1,217 MB holding 1,397 ([#1197](https://github.com/firejune/rigc/issues/1197)) ([7159809](https://github.com/firejune/rigc/commit/71598091cc292d7dfa18521b3ae3061f435212b3)), closes [#1185](https://github.com/firejune/rigc/issues/1185)

## [2.13.2](https://github.com/firejune/rigc/compare/v2.13.1...v2.13.2) (2026-10-06)


### Performance Improvements

* **render:** the core poser's render holds one framing set, one pose and one UV and triangle array per drawn part at a time; peak 3,981 to 1,809 MiB on the worst production rig, every frame identical, wall time unmoved ([#1193](https://github.com/firejune/rigc/issues/1193)) ([db4de90](https://github.com/firejune/rigc/commit/db4de90376ab7c13977873a286d1c5318e33ed6e)), closes [#1180](https://github.com/firejune/rigc/issues/1180)

## [2.13.1](https://github.com/firejune/rigc/compare/v2.13.0...v2.13.1) (2026-10-05)


### Bug Fixes

* **smoke:** the rename-symbol plant renames loadPosable, which no shipped module imports, and is alone — on main its rename of headerBoxNumber killed --version, both builds, render and skills while the case read one step ([#1189](https://github.com/firejune/rigc/issues/1189)) ([7568718](https://github.com/firejune/rigc/commit/7568718372ed0afccd55a4a0dbea4e77852b1a34)), closes [#1184](https://github.com/firejune/rigc/issues/1184)


### Performance Improvements

* **core:** A10's walk re-poses only the moved bones' subtrees, keeps each view's ordering plan, reads setup modes once and cuts no clipped row; core-entry build on 14 production rigs 1.78x to 1.46x the round trip, bytes unmoved ([#1191](https://github.com/firejune/rigc/issues/1191)) ([950af35](https://github.com/firejune/rigc/commit/950af352cfe9f518ca4e996f9beb14b81f629ed9)), closes [#1179](https://github.com/firejune/rigc/issues/1179)

## [2.13.0](https://github.com/firejune/rigc/compare/v2.12.0...v2.13.0) (2026-10-05)


### Features

* **selftest:** each suite's children are held under that suite's own figure × 1.5, which no run moves — a figure is added once or moved by --reset-children-base — so the hand-committed ratchet goes and TY40 names core at +56 %, packer at +53 % ([#1187](https://github.com/firejune/rigc/issues/1187)) ([b9cd02e](https://github.com/firejune/rigc/commit/b9cd02eb27bd6ba60955fe563fd1026f6e0db29f)), closes [#1166](https://github.com/firejune/rigc/issues/1166)


### Bug Fixes

* **authoring:** the core entry's two parse rules, A00_MODEL_READ and A00_MODEL_REGIONS_ON_PAGES, get their §5.2 rows; CUR118 holds every code either entry's build prints to one row, and each count sentence says why that report totals 53 ([#1188](https://github.com/firejune/rigc/issues/1188)) ([223f285](https://github.com/firejune/rigc/commit/223f2853000404d019aaa378af916e7adcb18f2f)), closes [#1183](https://github.com/firejune/rigc/issues/1183)
* **selftest:** an argument no reader claims is refused by name, exit 2, before the sweep or the temp root — one HARNESS_FLAGS table the readers answer to, --help prints it and exits 0, TY45 holds it and CONTRIBUTING lists it ([#1182](https://github.com/firejune/rigc/issues/1182)) ([2580b20](https://github.com/firejune/rigc/commit/2580b206dc74483e655de89b58a0419d7c9538fc)), closes [#1174](https://github.com/firejune/rigc/issues/1174)
* **smoke:** a core-entry build that fails is SMOKE_CORE_ENTRY_BUILDS rather than a HOLE, held byte for byte to the round-tripped build, with two plants; CUR117 holds RELEASING's core-entry row to the command table ([#1181](https://github.com/firejune/rigc/issues/1181)) ([f657d83](https://github.com/firejune/rigc/commit/f657d83938eaec586524c5018e43baf170d0b591)), closes [#1178](https://github.com/firejune/rigc/issues/1178)

## [2.12.0](https://github.com/firejune/rigc/compare/v2.11.1...v2.12.0) (2026-10-05)


### Features

* **cli:** rigc repack &lt;build&gt; --out &lt;dir&gt; — repack a build from its own output under build --pack's flags, written only after every region, the skeleton (or --accept-skeleton-differences, every path named) and the gate hold; --stage-box passthrough ([#1177](https://github.com/firejune/rigc/issues/1177)) ([554bb90](https://github.com/firejune/rigc/commit/554bb907b9f7501f92d8bc05d860d66de55e9f75))
* **emit:** a rig can carry its stage in the shipped Spine files as a bounding box (`skeleton.stageBox`), held by A50_STAGE_BOX_IS_THE_STAGE on both suppliers and read back by `ingest --stage-box`; the 2.2.0 migration note joins the tree ([#1175](https://github.com/firejune/rigc/issues/1175)) ([5a81e7b](https://github.com/firejune/rigc/commit/5a81e7b33f59dbd09c2392ad38089ff258863421)), closes [#1168](https://github.com/firejune/rigc/issues/1168)

## [2.11.1](https://github.com/firejune/rigc/compare/v2.11.0...v2.11.1) (2026-10-05)


### Performance Improvements

* **pack:** a footprint pass splits each placed cell's bands over the free-list entries near the cell — the free polygon pack on three production rigs goes from 10.7–41.8 s to 3.4–10.6 s, every page byte-identical, and the docs state where the cost starts ([#1172](https://github.com/firejune/rigc/issues/1172)) ([846b3af](https://github.com/firejune/rigc/commit/846b3afcf894ba8fdf037248f9d4104a9e65ff2e)), closes [#1165](https://github.com/firejune/rigc/issues/1165)

## [2.11.0](https://github.com/firejune/rigc/compare/v2.10.1...v2.11.0) (2026-10-05)


### Features

* **package:** name spine-rigc/render, /png and /compile, hold every observed symbol from the install, and state the release notes' byte-identity sentence as a rule ([#1170](https://github.com/firejune/rigc/issues/1170)) ([6867ae7](https://github.com/firejune/rigc/commit/6867ae71c5305fd0631e7c871df188da34e83a00)), closes [#1167](https://github.com/firejune/rigc/issues/1167) [#859](https://github.com/firejune/rigc/issues/859)

## [2.10.1](https://github.com/firejune/rigc/compare/v2.10.0...v2.10.1) (2026-10-04)


### Bug Fixes

* **tools:** a tool that made its own work directory removes it when its command ends, unless --keep-work, through one helper that EH08 and RH09 hold on every exit path ([#1164](https://github.com/firejune/rigc/issues/1164)) ([a2d86cb](https://github.com/firejune/rigc/commit/a2d86cbe35700b11c85a0d5effd634bfc9745afe))
* **tools:** hull_ceiling counts a region a conversion cannot make as its rectangle, not its silhouette — a page with no alpha no longer reads as a saving of its whole area ([#1162](https://github.com/firejune/rigc/issues/1162)) ([5e09793](https://github.com/firejune/rigc/commit/5e097939fb5e6605b85081f87a6d7e6bffc5fbd2)), closes [#1157](https://github.com/firejune/rigc/issues/1157)

## [2.10.0](https://github.com/firejune/rigc/compare/v2.9.0...v2.10.0) (2026-10-04)


### Features

* **selftest:** every run removes the rigc-selftest- roots that killed runs left once nothing has touched them for 24 h, claiming each by rename so concurrent sweepers never collide, and TY44 holds what it removes and what it must not ([#1160](https://github.com/firejune/rigc/issues/1160)) ([985d538](https://github.com/firejune/rigc/commit/985d5380472b68e8f4d0ecb9944a1e75439d9bd8))


### Performance Improvements

* **core:** the core poser's excess over spine-core, accounted cause by cause with paired runs, and ten substitutions that change no byte (−38.5 %, 6.79x → 4.31x) ([#1159](https://github.com/firejune/rigc/issues/1159)) ([2ca93ab](https://github.com/firejune/rigc/commit/2ca93ab4190dff67fe037b3c7e198a227f8265c2)), closes [#1134](https://github.com/firejune/rigc/issues/1134)

## [2.9.0](https://github.com/firejune/rigc/compare/v2.8.0...v2.9.0) (2026-10-04)


### Features

* **selftest:** both writers of the children's memory base keep the larger of the tracked figure and the run's and say which, --reset-children-base is the one spelling that lowers it, and TY43 holds every case with a plant each way ([#1153](https://github.com/firejune/rigc/issues/1153)) ([05c0405](https://github.com/firejune/rigc/commit/05c04058d40ebef6712482afd9cfebc659d14d2a)), closes [#1151](https://github.com/firejune/rigc/issues/1151)

## [2.8.0](https://github.com/firejune/rigc/compare/v2.7.0...v2.8.0) (2026-10-04)


### Features

* **selftest:** a green merge writes the children's half of its platform's memory base with --memory-base-children, CI's test job writes it and uploads it as selftest-memory-base, and TY41 holds the write to the max over the shard documents and a red merge to none ([#1149](https://github.com/firejune/rigc/issues/1149)) ([342ae0c](https://github.com/firejune/rigc/commit/342ae0c5f89fd488104a91840abd0d18fc7ba596)), closes [#1144](https://github.com/firejune/rigc/issues/1144)

## [2.7.0](https://github.com/firejune/rigc/compare/v2.6.1...v2.7.0) (2026-10-04)


### Features

* **selftest:** every --unit child's peak RSS reaches the parent in its result, the suite line names its children's high-water and the unit that set it, and TY40 holds that figure under a per-platform base — with the scale read through Bun.spawn by ([#1148](https://github.com/firejune/rigc/issues/1148)) ([bcf7777](https://github.com/firejune/rigc/commit/bcf777717f86aa51f2d4b88da035d621673bde24))
* **selftest:** every --unit child's peak RSS reaches the parent in its result, the suite line names its children's high-water and the unit that set it, and TY40 holds that figure under a per-platform base ([#1145](https://github.com/firejune/rigc/issues/1145)) ([af9af3f](https://github.com/firejune/rigc/commit/af9af3fc24ac158b0ed20b1431dac672205070d3))

## [2.6.1](https://github.com/firejune/rigc/compare/v2.6.0...v2.6.1) (2026-10-04)


### Bug Fixes

* **selftest:** every directory a selftest process makes lives in one rigc-selftest- root that its exit removes, so a run leaves tmpdir() as it found it, and TY39 counts it ([#1141](https://github.com/firejune/rigc/issues/1141)) ([cec559d](https://github.com/firejune/rigc/commit/cec559df6ece104aa01b63db515b1c8c898ea9ab)), closes [#1137](https://github.com/firejune/rigc/issues/1137)

## [2.6.0](https://github.com/firejune/rigc/compare/v2.5.1...v2.6.0) (2026-10-04)


### Features

* **selftest:** core's posing-heavy controls run as --unit work shared by --jobs workers, each control's lines and shares applied at its own position, so the log is byte-identical at any --jobs ([#1136](https://github.com/firejune/rigc/issues/1136)) ([8ea177d](https://github.com/firejune/rigc/commit/8ea177d8aa82509b69026b248e67eecf9eb11b89)), closes [#1133](https://github.com/firejune/rigc/issues/1133)

## [2.5.1](https://github.com/firejune/rigc/compare/v2.5.0...v2.5.1) (2026-10-03)


### Bug Fixes

* **selftest:** builds of a fixture or probe land inside its own directory, so no page name spells a temp directory and VF09 counts the same builds in any process ([#1131](https://github.com/firejune/rigc/issues/1131)) ([cf1b125](https://github.com/firejune/rigc/commit/cf1b125a96c887dad4b3b976ac14b75aa9abce44)), closes [#1127](https://github.com/firejune/rigc/issues/1127)

## [2.5.0](https://github.com/firejune/rigc/compare/v2.4.0...v2.5.0) (2026-10-03)


### Features

* **selftest:** a suite's independent units run up to --jobs at once with the log byte-identical, and shards are dealt longest-first from a tracked durations base ([#1129](https://github.com/firejune/rigc/issues/1129)) ([d7aef3c](https://github.com/firejune/rigc/commit/d7aef3ca1e07dd0d0e1c2b0db8268a11b75597cb))

## [2.4.0](https://github.com/firejune/rigc/compare/v2.3.0...v2.4.0) (2026-10-03)


### Features

* **selftest:** the full run as n shards whose merge is the verdict — `--shard i/n` + `--tally-out`, `--merge` replaying the run off the shards' documents, and CI as six shards and a merge ([#1125](https://github.com/firejune/rigc/issues/1125)) ([557e879](https://github.com/firejune/rigc/commit/557e8799544d9b779c5bf8f399206c683b9dfa24)), closes [#1116](https://github.com/firejune/rigc/issues/1116)

## [2.3.0](https://github.com/firejune/rigc/compare/v2.2.0...v2.3.0) (2026-10-03)


### Features

* **selftest:** each suite states its time and the process RSS after it, and the run ends with the ten heaviest suites by time and by RSS growth ([#1122](https://github.com/firejune/rigc/issues/1122)) ([b951c86](https://github.com/firejune/rigc/commit/b951c868db35626e89779f1e197192adae2162a8)), closes [#1116](https://github.com/firejune/rigc/issues/1116)


### Bug Fixes

* **selftest:** the full run's memory — heap and external beside RSS per suite, the three controls that set the high-water cut to a fraction of their peak, and the final RSS held under a tracked per-platform base ([#1124](https://github.com/firejune/rigc/issues/1124)) ([1c36d4d](https://github.com/firejune/rigc/commit/1c36d4d60ce6b93a378abb651673c047dbba44a4))

## [2.2.0](https://github.com/firejune/rigc/compare/v2.1.3...v2.2.0) (2026-10-03)

> ⚠️ **Behaviour change — added 2026-10-05 (#1168).** Up to 2.1.3, `skeleton.json`'s header `x` / `y` / `width` / `height` held the rig's **stage** (the authored canvas, for example `0, 0, 832, 1216`). From this release they hold the **setup-pose bounding box**, as the Spine format defines them. Every build's bytes moved, and a consumer that scaled or placed a figure by reading those four fields as the stage gets a different size and offset — with no error from rigc or from a runtime. **Migration:** read the stage from the rig spec, or from `skeleton.model.json`'s `stage` beside the build; the Spine files themselves no longer state it (#1168 tracks giving them a place for it). This entry is listed under *Bug Fixes* because the header's earlier content contradicted the format; for a reader of the header as the stage it is a breaking change and should have said so here.
>
> Since #1168 a rig can carry its stage in the Spine files as well: `skeleton.stageBox` in the rig spec makes `build` write a bounding-box attachment whose four vertices are the stage's corners, which every runtime returns by slot and name (docs/AUTHORING.md §3.1, *For a consumer of the Spine files*), and `ingest --stage-box <slot>` reads it back.


### Features

* **tools:** `pack_anchor --trace-regions <tolerance>` packs every region-kind region by the contour rigc's tracer states for its art, converted in memory, at tolerance 0 and at the contour mesher — the stage-2 realised figure, measured before any attachment is converted ([#1118](https://github.com/firejune/rigc/issues/1118)) ([60f52a8](https://github.com/firejune/rigc/commit/60f52a88d50f1f48ca05eec64f34cfaffc439b41)), closes [#1115](https://github.com/firejune/rigc/issues/1115)


### Bug Fixes

* **cli:** the entry without spine-core prints the build's figures line with the full entry's keys, order and values — pages, regions, bones, slots, animations and the version read off the emitted pair, the attachment kinds, rig and profile off the model document — where it printed the constraint counts alone ([#1119](https://github.com/firejune/rigc/issues/1119)) ([8a2ed96](https://github.com/firejune/rigc/commit/8a2ed96c7688cb6eac8e6e1a3dd00c515be597c0)), closes [#1114](https://github.com/firejune/rigc/issues/1114) [#1097](https://github.com/firejune/rigc/issues/1097)
* **emit:** the Spine header carries the setup-pose bounding box, computed by rigc's core and held to spine-core's getBounds at tolerance 0, and the stage stays the model document's ([#1117](https://github.com/firejune/rigc/issues/1117)) ([49bd779](https://github.com/firejune/rigc/commit/49bd77981aff37bb0c7003815a289cd0f02689d8)), closes [#907](https://github.com/firejune/rigc/issues/907)

## [2.1.3](https://github.com/firejune/rigc/compare/v2.1.2...v2.1.3) (2026-10-03)


### Bug Fixes

* **tools:** the editor round trip reads the build's atlas and an `--exported` file before the editor starts, and refuses a missing atlas, an atlas that is a directory and an `--exported` file that is not one JSON object by name there — where it used to refuse the first only after the editor ran, and throw the other two as stacks at steps 3 and 4 ([#1112](https://github.com/firejune/rigc/issues/1112)) ([02a3813](https://github.com/firejune/rigc/commit/02a38139cb88685cc7d93a70b0f9dd5d3be31267)), closes [#1107](https://github.com/firejune/rigc/issues/1107)

## [2.1.2](https://github.com/firejune/rigc/compare/v2.1.1...v2.1.2) (2026-10-03)


### Bug Fixes

* **atlas:** a `polygon` pack is the least total page area of three whole packs — `rect`'s, the owned-box anchor's, and one that may also put a cell's own corner where that anchor would leave the page — so a large region whose mesh draws a small part of it no longer forces the `rect` page, and no polygon pack is larger than `rect`'s on any set, a spill's pages included ([#1111](https://github.com/firejune/rigc/issues/1111)) ([3e889a2](https://github.com/firejune/rigc/commit/3e889a2a920e64e7058c45a0c9a4b321047fd6d4))
* **cli:** the entry without spine-core, refusing `validate` on a rigc build, says the build already ran its gate before it wrote — an export's refusal is unchanged ([#1109](https://github.com/firejune/rigc/issues/1109)) ([c87ef94](https://github.com/firejune/rigc/commit/c87ef94b8e65d5db89fda8afc40b103e865afa0e)), closes [#1097](https://github.com/firejune/rigc/issues/1097)
* **tools:** the editor round trip refuses a build whose `skeleton.json` is not one JSON object by its path and what it found there — not JSON, empty, a directory, `[]`, `null` — before the editor starts, where it used to throw a stack or start the editor on a file that is not a skeleton ([#1108](https://github.com/firejune/rigc/issues/1108)) ([ef2fbdb](https://github.com/firejune/rigc/commit/ef2fbdbe36afeb19f54ce7b11c31fcfa233f836a)), closes [#1090](https://github.com/firejune/rigc/issues/1090)

## [2.1.1](https://github.com/firejune/rigc/compare/v2.1.0...v2.1.1) (2026-10-02)


### Bug Fixes

* **atlas:** a polygon page search stops a footprint pass at its first miss and prunes its free list by the edge a piece was cut along — a production-shaped page packs in 0.17 s where it took 304 s, the same pages to the byte ([#1105](https://github.com/firejune/rigc/issues/1105)) ([58942b9](https://github.com/firejune/rigc/commit/58942b9f71d6e4fb1b59e91286e7ec4aac2b2a10)), closes [#1102](https://github.com/firejune/rigc/issues/1102)

## [2.1.0](https://github.com/firejune/rigc/compare/v2.0.3...v2.1.0) (2026-10-02)


### Features

* **atlas:** `--pack-shape polygon` packs a mesh region by its emitted hull, so a neighbour may sit inside its rectangle where the hull is not — never a larger page than `rect`, every sampled texel its own, and the pack line ends in the shape ([#1101](https://github.com/firejune/rigc/issues/1101)) ([fb689f8](https://github.com/firejune/rigc/commit/fb689f8c655545764e79e0f949914ceea001444c))
* **gate:** A49_PACKED_FOOTPRINTS_DO_NOT_OVERLAP replaces A06's tiling clause — two regions on one page are refused where their rectangles overlap and what they draw does too (a mesh's hull, every other region's rectangle), so a --pack-shape polygon page whose rectangles overlap outside the hulls gates green under spine-html ([#1103](https://github.com/firejune/rigc/issues/1103)) ([a8d465c](https://github.com/firejune/rigc/commit/a8d465cd9fc072cd980f55602b1b9652de027ca6)), closes [#1099](https://github.com/firejune/rigc/issues/1099)


### Instrument

* **tools:** `tools/hull_ceiling.ts` measures what polygon packing could save over a corpus — over the 19 public recipes the hulls cover 0.981 of the rectangle area when only meshes are hull-packed, 0.735 when region attachments are converted to traced contours, and 0.714 is the opaque-texel floor ([#1098](https://github.com/firejune/rigc/issues/1098)) ([2c42bd3](https://github.com/firejune/rigc/commit/2c42bd3eef19cda48344a9f9304aac1b65bac850))

## [2.0.3](https://github.com/firejune/rigc/compare/v2.0.2...v2.0.3) (2026-10-02)


### Bug Fixes

* **compile:** a generated mesh's `kind` is the one that chose its builder, and `tsconfig.json` is full `strict` — measured at one error on the whole tree, which a dependant's strict tsc found first ([#1096](https://github.com/firejune/rigc/issues/1096)) ([6a51946](https://github.com/firejune/rigc/commit/6a51946b8eb3f02d694cc1183eb732541b61b003))
* **diff:** the value walk reads a transform's offsets and property map, a slider's property and `local`, and every colour's alpha and blue; `diff` compares a timeline's target, a key's names, an attachment's region, clipping end and linked source, a skin's members and the constraints' order ([#1094](https://github.com/firejune/rigc/issues/1094)) ([b3de394](https://github.com/firejune/rigc/commit/b3de394d6666e98e2b8c9ae4f15ce9b973096e73)), closes [#1084](https://github.com/firejune/rigc/issues/1084) [#1085](https://github.com/firejune/rigc/issues/1085)
* **tools:** a failed import or export quotes every line the editor printed except its one `Licensed to: <name> <<e-mail>>` line, which is replaced by a line saying it was withheld — the measured failure prints that line straight before its error ([#1091](https://github.com/firejune/rigc/issues/1091)) ([4f14d85](https://github.com/firejune/rigc/commit/4f14d851d4b5a6d11f7a32763e3893bd73dd2dc1)), closes [#1082](https://github.com/firejune/rigc/issues/1082)

## [2.0.2](https://github.com/firejune/rigc/compare/v2.0.1...v2.0.2) (2026-10-02)


### Bug Fixes

* **diff:** `constraints.refs` compares every name a constraint resolves — a slider's animation and property, and a transform's property map — and its note names each constraint wired differently with both sides' names ([#1088](https://github.com/firejune/rigc/issues/1088)) ([61b5940](https://github.com/firejune/rigc/commit/61b594024661f2a874235d8d56860ad243a08969)), closes [#1078](https://github.com/firejune/rigc/issues/1078)
* **gate:** a page whose IHDR states a dimension of 0, or whose image data does not decode, is named once by A06 in a sentence — every other reader refuses it by the same sentence instead of a grid ratio of 0.0000, a stack, or silence ([#1089](https://github.com/firejune/rigc/issues/1089)) ([6013a06](https://github.com/firejune/rigc/commit/6013a069f529547c25f010a40b9c0e2decc3b506)), closes [#1073](https://github.com/firejune/rigc/issues/1073) [#1074](https://github.com/firejune/rigc/issues/1074)
* **tools:** the round trip records the editor's version as its one `Spine <x.y.z>` line of `--version` and prints nothing else from that output — the tail it printed was the licensee's name and e-mail ([#1083](https://github.com/firejune/rigc/issues/1083)) ([ae12dd8](https://github.com/firejune/rigc/commit/ae12dd83defb365a613d7f95720e5c776b8b2e50)), closes [#1077](https://github.com/firejune/rigc/issues/1077)


### Instrument

* **cli:** every sentence the entry without spine-core prints naming `cli.ts` names the install route too, and the seam's absent-side refusal ends on it ([#1087](https://github.com/firejune/rigc/issues/1087)) ([6f536b3](https://github.com/firejune/rigc/commit/6f536b3947619431bae183be77c5330a8438cc47)), closes [#1079](https://github.com/firejune/rigc/issues/1079)

## [2.0.1](https://github.com/firejune/rigc/compare/v2.0.0...v2.0.1) (2026-10-02)


### Bug Fixes

* **cli:** a sentence that sends its reader to the entry linking spine-core names both routes there — installed, the same `rigc` once the runtime is beside the package; from a clone, `bun cli.ts` ([#1081](https://github.com/firejune/rigc/issues/1081)) ([627ff8c](https://github.com/firejune/rigc/commit/627ff8ce384ae3460954752a23f3322ed798f37c)), closes [#1072](https://github.com/firejune/rigc/issues/1072)
* **compile:** a slider whose animation an editor import would move off its index is refused — the file lists array-index names first, and the editor re-sorts and keeps a slider by index ([#1080](https://github.com/firejune/rigc/issues/1080)) ([d6a3231](https://github.com/firejune/rigc/commit/d6a32319b2a9195884ed8c9470e5f6513fa68efc)), closes [#1040](https://github.com/firejune/rigc/issues/1040)
* **gate:** a page on disk that cannot be read as PNG is named once, by A06 — A19 SKIPs pointing at it instead of adding a second FAIL about the same file ([#1075](https://github.com/firejune/rigc/issues/1075)) ([a746e2d](https://github.com/firejune/rigc/commit/a746e2de37a851adef42886aa7b37cd186560950)), closes [#1064](https://github.com/firejune/rigc/issues/1064)

## [2.0.0](https://github.com/firejune/rigc/compare/v1.9.4...v2.0.0) (2026-10-02)


### ⚠ BREAKING CHANGES

* **package:** an install of this package no longer carries `@esotericsoftware/spine-core`. The installed `rigc` runs the entry that links nothing of the runtime: `render`, `check`, `explain`, `pose`, `chainfit`, `ingest`, `diff` and `skills` as before, and — once #1060 lands — `build`, gated by rigc's own validator rather than the spine-core round trip, which runs in this repository's CI over the corpus. `validate`, `bench`, `bonedist`, `preview` and `vote` need the runtime installed beside the package. A clone is unchanged.

### Features

* **cli:** one statement of a build on every command, and cli_core.ts build writes what cli.ts build writes, gated without spine-core ([#1069](https://github.com/firejune/rigc/issues/1069)) ([5f08bd8](https://github.com/firejune/rigc/commit/5f08bd8c550528f28e6a4f509d67bbd037b99a0e)), closes [#1060](https://github.com/firejune/rigc/issues/1060) [#1046](https://github.com/firejune/rigc/issues/1046)
* **package:** spine-core becomes a devDependency — an install runs cli_core.ts, the launcher chooses the entry by whether the runtime resolves, and the shipped closure is held over `files` ([#1066](https://github.com/firejune/rigc/issues/1066)) ([a709310](https://github.com/firejune/rigc/commit/a709310d2ed8d5d03835e9d6ae56c8661d03d527))


### Bug Fixes

* **docs:** the documents say what the package links — spine-core is a development dependency, the published rigc links no Spine runtime, and the gate it runs is named ([#1070](https://github.com/firejune/rigc/issues/1070)) ([16bf9fa](https://github.com/firejune/rigc/commit/16bf9fae11662924a4eece9ef555652111631c1d))

## [1.9.4](https://github.com/firejune/rigc/compare/v1.9.3...v1.9.4) (2026-10-02)


### Bug Fixes

* **gate:** a page file not on disk is named once, by A17 — A06 and A19 SKIP naming the pages they did not read instead of printing PASS over them ([#1067](https://github.com/firejune/rigc/issues/1067)) ([66f9ee6](https://github.com/firejune/rigc/commit/66f9ee6465c858a65c1ee6d6d2241021da9e2c0d)), closes [#1055](https://github.com/firejune/rigc/issues/1055)

## [1.9.3](https://github.com/firejune/rigc/compare/v1.9.2...v1.9.3) (2026-10-02)


### Bug Fixes

* **core:** a document posed with no skin set is posed as the runtime poses it — skins and no default one, or a default skin naming skin-required members, are drawn by the core rather than refused ([#1056](https://github.com/firejune/rigc/issues/1056)) ([544c7ec](https://github.com/firejune/rigc/commit/544c7ecca5baf2f52cf1355ce6b55ea83bb4a6d6)), closes [#1051](https://github.com/firejune/rigc/issues/1051)
* **core:** a slider applies the physics timelines of its animation — render and check drew a rigc build wrong where a slider keys wind or gravity on a constraint that updates after it ([#1058](https://github.com/firejune/rigc/issues/1058)) ([5a04755](https://github.com/firejune/rigc/commit/5a0475561114b587b0bd8e8e546e5a7941b0b4cc)), closes [#1049](https://github.com/firejune/rigc/issues/1049)
* **gate:** the bones an animation keys are read in the order the file keys them — an integer-like bone name is listed first, and the order of bone timelines is measured not to reach a pose across bones and to be the file's on one bone ([#1065](https://github.com/firejune/rigc/issues/1065)) ([6e1b32a](https://github.com/firejune/rigc/commit/6e1b32aef251068955416cee06868727008c952f)), closes [#1039](https://github.com/firejune/rigc/issues/1039)


### Instrument

* **cli:** an entry that links nothing of spine-core — render.ts keeps only what names the runtime, the Spine side registers into a seam, and the core commands run with the package absent ([#1059](https://github.com/firejune/rigc/issues/1059)) ([24e83cb](https://github.com/firejune/rigc/commit/24e83cb4fc439993c09bdf8a44449307079e3396))
* **gate:** the model side reads its rig info and durations off the document, lists its rows in validate()'s order, states the meshes once, asks every fact family on one walk, and keeps the runtime's timeline names out of src/core ([#1062](https://github.com/firejune/rigc/issues/1062)) ([46267cd](https://github.com/firejune/rigc/commit/46267cd857128262bd104983aea2b0dbb5440828))

## [1.9.2](https://github.com/firejune/rigc/compare/v1.9.1...v1.9.2) (2026-10-01)


### Bug Fixes

* **cli:** bonedist and bench --bones refuse a pair they cannot pose by name, a build moved away from its pages is refused naming the page, and a skeleton that is not JSON is refused naming the file ([#1047](https://github.com/firejune/rigc/issues/1047)) ([cafc03c](https://github.com/firejune/rigc/commit/cafc03cf6d6509c93fcfcb9623eae98dd8388b67)), closes [#1042](https://github.com/firejune/rigc/issues/1042)


### Instrument

* **gate:** A10 written once against the stepped poses, supplied by spine-core and by the core's own looping walk — which keeps a non-finite value in place and fires a physics reset across the wrap ([#1053](https://github.com/firejune/rigc/issues/1053)) ([2447536](https://github.com/firejune/rigc/commit/2447536608e7f815178ee91b7b54cdcc18f8f640))
* **gate:** A40 and A34 written once against facts and supplied by either side — what a timeline does when applied additively is a computation the core now makes, held cell by cell to the runtime's probe ([#1050](https://github.com/firejune/rigc/issues/1050)) ([cbcfc96](https://github.com/firejune/rigc/commit/cbcfc9665ea845813a83a59cf169ded54cc6cf0b))

## [1.9.1](https://github.com/firejune/rigc/compare/v1.9.0...v1.9.1) (2026-10-01)


### Bug Fixes

* **model:** every reader takes the file's order from one place — stated on a /3 document, derived on a /2 with integer-like names first — and the groups an animation keys by name are walked in the file's key order ([#1038](https://github.com/firejune/rigc/issues/1038)) ([4422ab6](https://github.com/firejune/rigc/commit/4422ab666c97f091a58dba45d2358ce12a5ad619)), closes [#1034](https://github.com/firejune/rigc/issues/1034)
* **render:** a directory whose files are not one build is refused by name — another build's skeleton.json or atlas no longer dies in the runtime with a stack trace ([#1041](https://github.com/firejune/rigc/issues/1041)) ([f609f9e](https://github.com/firejune/rigc/commit/f609f9e8ce161b28884c0d60b7074c77d49e0359)), closes [#1033](https://github.com/firejune/rigc/issues/1033)


### Instrument

* **gate:** A09, A39, A43 and A46 written once against facts, supplied by spine-core and by the model with the core — each posed value asked of both suppliers at every time the bodies pose at ([#1045](https://github.com/firejune/rigc/issues/1045)) ([b47a113](https://github.com/firejune/rigc/commit/b47a113980af5e7180c2b82bf36ffdbe7818b7b1))
* **gate:** A12, A24, A25, A26, A29, A30 and A32's audio clause written once against facts and supplied by either side — the clauses that read only the Spine encoding stay with the round trip ([#1044](https://github.com/firejune/rigc/issues/1044)) ([178a645](https://github.com/firejune/rigc/commit/178a6451b929fe1fba5033eaa200fedfc2906d3f))

## [1.9.0](https://github.com/firejune/rigc/compare/v1.8.0...v1.9.0) (2026-10-01)


### Features

* **model:** the model document states the stage, the file's orders and each page's pma and scale (rigc-compiled/3), and compileModel yields the model without calling the Spine emitter ([#1037](https://github.com/firejune/rigc/issues/1037)) ([03b6d2a](https://github.com/firejune/rigc/commit/03b6d2ac31457b9d7dd1ca568c90b4797f5e4927)), closes [#1026](https://github.com/firejune/rigc/issues/1026)


### Instrument

* **gate:** A04, A20, A21, A23, A28, A33, A36, A37, A41, A42, A44, A47 and A48 written once against facts, supplied by spine-core and by the model with the core — the encoding's clauses stay with the round trip ([#1036](https://github.com/firejune/rigc/issues/1036)) ([fc524d4](https://github.com/firejune/rigc/commit/fc524d4181620b23cb7d219efd7cf755b43ea5bf))
* **gate:** A06, A08, A13, A14, A15, A19, A22, A27 and A38 written once against facts, supplied by spine-core and by the model with what its caller gives, held to the same lines ([#1032](https://github.com/firejune/rigc/issues/1032)) ([58ddb8a](https://github.com/firejune/rigc/commit/58ddb8ad21e07643e53b7eec4015cc75ec47c981))

## [1.8.0](https://github.com/firejune/rigc/compare/v1.7.0...v1.8.0) (2026-10-01)


### Features

* **explain:** a rigc build is explained without executing spine-core — the deform survey reads its structure from the model document, and --poser says which reader ([#1027](https://github.com/firejune/rigc/issues/1027)) ([53bfdb9](https://github.com/firejune/rigc/commit/53bfdb9a917ecbd2e42a16eebcecff9285361e78)), closes [#1019](https://github.com/firejune/rigc/issues/1019)


### Bug Fixes

* **compile:** meshes and regions are bound with the runtime's arithmetic — a bound point poses where it was authored, to the float32 floor ([#1031](https://github.com/firejune/rigc/issues/1031)) ([caee5ab](https://github.com/firejune/rigc/commit/caee5ab5e755ffcd7c1b1de2e0641ba6b0a3d4d8)), closes [#1021](https://github.com/firejune/rigc/issues/1021)
* **render:** a rigc build is rendered and checked with its skeleton.atlas gone — page placement and page names are read from the model document ([#1029](https://github.com/firejune/rigc/issues/1029)) ([b2b83ed](https://github.com/firejune/rigc/commit/b2b83edd97d20db28511e98193b6e2c0c9c2ae17)), closes [#1020](https://github.com/firejune/rigc/issues/1020)


### Instrument

* **gate:** A03, A11, A17 and A45 written once against facts, supplied by spine-core and by the model with the core, held to the same lines ([#1030](https://github.com/firejune/rigc/issues/1030)) ([95ff3e8](https://github.com/firejune/rigc/commit/95ff3e87a5f8346883d52f82e69ac7406b141d3e))

## [1.7.0](https://github.com/firejune/rigc/compare/v1.6.2...v1.7.0) (2026-10-01)


### Features

* **model:** the model document carries each region's place on its page — the core draws a build without reading the atlas ([#1022](https://github.com/firejune/rigc/issues/1022)) ([a6db791](https://github.com/firejune/rigc/commit/a6db79170cc0cb3dabf86ba96e8dc1e2ec65fe7f))


### Bug Fixes

* **compile:** the routines that said they transcribed a runtime routine call the core's measured form — every emitted byte unchanged ([#1023](https://github.com/firejune/rigc/issues/1023)) ([94c8a35](https://github.com/firejune/rigc/commit/94c8a35a8cc5fb5865da6e00d1d337d45c8e9124)), closes [#1015](https://github.com/firejune/rigc/issues/1015)
* **guide:** what spine-core does for a rigc command, as run — a build is posed by the core, an export and the round trip by spine-core ([#1017](https://github.com/firejune/rigc/issues/1017)) ([73037ba](https://github.com/firejune/rigc/commit/73037ba55bc36a5d85633b966093574e7611ac7d)), closes [#1013](https://github.com/firejune/rigc/issues/1013)
* **render:** a rigc build is rendered and checked without executing spine-core — the runtime is used for an export, --poser spine and the round trip ([#1024](https://github.com/firejune/rigc/issues/1024)) ([8cbec66](https://github.com/firejune/rigc/commit/8cbec66ed64d105eda68269c43a5ad486b910ef6))

## [1.6.2](https://github.com/firejune/rigc/compare/v1.6.1...v1.6.2) (2026-09-30)


### Bug Fixes

* **render:** the framing box is over the slots that pose — a drawn slot on a bone the skin leaves unposed no longer pulls the frame to the origin ([#1010](https://github.com/firejune/rigc/issues/1010)) ([96ce427](https://github.com/firejune/rigc/commit/96ce427590761d2c812ffc4ecc12c50ecb3cbd53)), closes [#1000](https://github.com/firejune/rigc/issues/1000)


### Instrument

* **selftest:** RG02 compares every seed over the reference length — a seed drawn fewer than 4,096 times no longer reads as a disagreement ([#1009](https://github.com/firejune/rigc/issues/1009)) ([d435eed](https://github.com/firejune/rigc/commit/d435eed10295ecfbddb3b904a8a3fb9e56bcaddc)), closes [#998](https://github.com/firejune/rigc/issues/998)
* **selftest:** the core suite names an absent corpus as a HOLE, as every corpus suite does — a run with no examples/ exits as CONTRIBUTING says ([#1007](https://github.com/firejune/rigc/issues/1007)) ([c1991b5](https://github.com/firejune/rigc/commit/c1991b5a80f323133500fc36eac8dfad657dbf49)), closes [#1004](https://github.com/firejune/rigc/issues/1004)

## [1.6.1](https://github.com/firejune/rigc/compare/v1.6.0...v1.6.1) (2026-09-30)


### Bug Fixes

* **release:** the publish gate runs the selftest over the example corpus, as CI does — the core suite's corpus controls are red without it ([#1005](https://github.com/firejune/rigc/issues/1005)) ([5423dff](https://github.com/firejune/rigc/commit/5423dff810a52a0ae6dabf6db05ea229871e029d)), closes [#1003](https://github.com/firejune/rigc/issues/1003)

## [1.6.0](https://github.com/firejune/rigc/compare/v1.5.3...v1.6.0) (2026-09-30)


### Features

* **check:** check poses the candidate through rigc's core when the input carries a model document — the poser named in the report; verdicts and reports byte-identical to the spine-core check on every gallery row ([#987](https://github.com/firejune/rigc/issues/987)) ([5c4c145](https://github.com/firejune/rigc/commit/5c4c145903697583d17803e34bc1556845e21314))
* **check:** the deform survey poses through rigc's own core when the input carries a model document — the DeformSurvey identical on every corpus, the source named; validate's spine-core call unchanged ([#978](https://github.com/firejune/rigc/issues/978)) ([4661371](https://github.com/firejune/rigc/commit/46613710f8a23050dc491c2c86ddef9f5eb2c918))
* **compile:** CompileResult carries the compiled model — its first record, bones, built as ModelBone and emitted as SpineBone by the Spine emitter, byte-identical on every recipe ([#918](https://github.com/firejune/rigc/issues/918)) ([1717561](https://github.com/firejune/rigc/commit/17175611450977a01c4392bdb73ec0eb2db5177f)), closes [#915](https://github.com/firejune/rigc/issues/915)
* **compile:** every region record and sequence frame carries its atlas rectangle — trim and original size from the build's one atlas source — so the compiled model poses without the atlas; the Spine bytes unchanged ([#939](https://github.com/firejune/rigc/issues/939)) ([5c245eb](https://github.com/firejune/rigc/commit/5c245eb1704359502aea163c86601717def46563)), closes [#935](https://github.com/firejune/rigc/issues/935)
* **compile:** the animations as model records — the Spine animations object assembled by the emitter with its group order, omissions, the editor's name order and refusal, the every-global physics name and the ik flags on keys, byte-identical on every recipe ([#924](https://github.com/firejune/rigc/issues/924)) ([9092b03](https://github.com/firejune/rigc/commit/9092b0343f8e8b53fa6a0837c4ba767872f66a41)), closes [#921](https://github.com/firejune/rigc/issues/921)
* **compile:** the compiled model written beside the Spine files as rigc-compiled/1, A18 extended to it, emitSkeleton as the emitter's one entry, and compile.ts held free of every Spine shape by a control — the Spine bytes unchanged on every recipe ([#927](https://github.com/firejune/rigc/issues/927)) ([e6c85e6](https://github.com/firejune/rigc/commit/e6c85e650dc93202db460371fab697bda268fe8b))
* **compile:** the remaining records — slots, region and linked-mesh attachments, skins, constraints and events as model records, the transition union gone, every remaining spelling, order and omission the Spine emitter's, byte-identical on every recipe ([#923](https://github.com/firejune/rigc/issues/923)) ([db3d850](https://github.com/firejune/rigc/commit/db3d850351bc8722979d2cbf12d1a79c428ee5ad)), closes [#919](https://github.com/firejune/rigc/issues/919)
* **compile:** the weighted run by name — mesh, path, bounding-box and clipping attachments as model records whose bindings name their bone, encoded to indexes by the Spine emitter, byte-identical on every recipe ([#920](https://github.com/firejune/rigc/issues/920)) ([f27d2f3](https://github.com/firejune/rigc/commit/f27d2f359bf907657d1342753e3dde21cd03f4e1)), closes [#917](https://github.com/firejune/rigc/issues/917)
* **core:** atlas page and page UVs from rigc's own atlas reader, measured against the runtime's uv arrays at tolerance 0 on every corpus — the draw's last input the core lacked ([#974](https://github.com/firejune/rigc/issues/974)) ([5e0643a](https://github.com/firejune/rigc/commit/5e0643a2fb53b758c5672fcc70a06cc583d79802))
* **core:** concave and inverse clips drawn through the core — the rasteriser samples each clipped triangle at its source triangle's affine UV, so the render is decomposition-invariant and pixel-identical to spine-core on every probe ([#982](https://github.com/firejune/rigc/issues/982)) ([7f14687](https://github.com/firejune/rigc/commit/7f1468790d82c13869de1fd57e12de25fd64f846)), closes [#964](https://github.com/firejune/rigc/issues/964)
* **core:** construct 2 — the slots at the setup pose under skin all, the attachment shown by the rule measured against spine-core, colour, dark colour and region path, identical on every recipe ([#934](https://github.com/firejune/rigc/issues/934)) ([193967d](https://github.com/firejune/rigc/commit/193967d39ebaa0a53bc04894e19cc64e226ba7cb)), closes [#928](https://github.com/firejune/rigc/issues/928)
* **core:** construct 3 — every drawn attachment's world vertices at the setup pose, regions from the record and the carried trim, meshes from the bindings by name, identical to spine-core on every unconstrained recipe ([#945](https://github.com/firejune/rigc/issues/945)) ([a8e72da](https://github.com/firejune/rigc/commit/a8e72dae1fb626bac05c612cc8886ebee5acf71d)), closes [#931](https://github.com/firejune/rigc/issues/931)
* **core:** construct 4 — bone and slot timelines at a sample time, the key search, the curve as the runtime evaluates it and every bone and slot timeline kind measured against spine-core, identical on every unconstrained recipe ([#943](https://github.com/firejune/rigc/issues/943)) ([47bc2dc](https://github.com/firejune/rigc/commit/47bc2dc4e2f2b413ae710eaabd4a22441c0aaf63)), closes [#936](https://github.com/firejune/rigc/issues/936)
* **core:** construct 4, remainder — deform, sequence, draw-order and event timelines at a sample time, measured against spine-core; the laterTimelines HOLE replaced by per-kind census and the last public SKIP judged ([#962](https://github.com/firejune/rigc/issues/962)) ([4b898fb](https://github.com/firejune/rigc/commit/4b898fb07d4d31f38eef2a65b03537a894c79651))
* **core:** construct 5, first cut — the update order, ik and transform constraints at the setup pose and at a sample time, measured against spine-core; the rows carrying only those kinds admitted ([#951](https://github.com/firejune/rigc/issues/951)) ([5eafd8a](https://github.com/firejune/rigc/commit/5eafd8af66dac698914791bba51ef999d3f36178))
* **core:** construct 5, fourth cut — the stepped physics phase: reset and update at a fixed dt, every parameter and flag and the physics timelines measured against spine-core; the rows declaring physics admitted under the step ([#963](https://github.com/firejune/rigc/issues/963)) ([959800f](https://github.com/firejune/rigc/commit/959800fb6c91e3607fae5b8357ef3e9e2e04567b))
* **core:** construct 5, second cut — the path constraint at the setup pose and at a sample time, every mode measured against spine-core; the rows carrying path admitted ([#954](https://github.com/firejune/rigc/issues/954)) ([11e6b36](https://github.com/firejune/rigc/commit/11e6b36760d6973f43218ae477495e4ca6435944))
* **core:** construct 5, third cut — physics under Physics.none and the slider constraint at the setup pose and at a sample time, measured against spine-core; every constrained row but the path rig admitted on the blocks it can pose ([#953](https://github.com/firejune/rigc/issues/953)) ([557c101](https://github.com/firejune/rigc/commit/557c101315f032988d24f0d98e7e37713858790d))
* **core:** construct 6 — clipping applied to the draw, the triangles after a strictly convex clip as the runtime's clipper produces them, measured against spine-core; concave and inverse clips left out by name ([#971](https://github.com/firejune/rigc/issues/971)) ([c520543](https://github.com/firejune/rigc/commit/c520543e872050e71da1f3520c836d1160114493))
* **core:** rigc's own core reads rigc-compiled/1 and poses every bone's setup pose under the five inherit modes with an evaluator of its own, measured against spine-core — dumped as pose-oracle/1 and identical on every recipe without a constraint; the harness every construct is admitted through ([#929](https://github.com/firejune/rigc/issues/929)) ([64de839](https://github.com/firejune/rigc/commit/64de839ca32867d1ff122157f163fca8cd775029)), closes [#925](https://github.com/firejune/rigc/issues/925)
* **core:** the equivalence gate poses per skin — --skin &lt;name&gt; on both dumpers, every skin of a row declaring several judged, the merged view kept for rosters; the ambiguous-placeholder SKIP retired ([#973](https://github.com/firejune/rigc/issues/973)) ([7c5a216](https://github.com/firejune/rigc/commit/7c5a216ac906dacbc4e683b6225c9360a4150343))
* **core:** the raw entry — full-double pose at the caller's times and walk, uvs/triangles/colour retained, and pose_oracle --raw at tolerance 0 on every corpus; the last-bit gaps fixed or named ([#976](https://github.com/firejune/rigc/issues/976)) ([4f20b1e](https://github.com/firejune/rigc/commit/4f20b1e17e2fd7a25e391dea8859545e30e13450))
* **model:** the model document carries referenceScale, which wind and gravity act over — read by the core's physics step instead of the parser's 100 ([#977](https://github.com/firejune/rigc/issues/977)) ([ecfdf81](https://github.com/firejune/rigc/commit/ecfdf811df6ad440c19610e8802919bfe1ec4662))
* **render:** render poses through rigc's own core when the input carries a model document — every frame, geometry, sheet and framing box identical to the spine-core render on every corpus; the poser named in the output ([#980](https://github.com/firejune/rigc/issues/980)) ([6f696df](https://github.com/firejune/rigc/commit/6f696df0686c9cd14ab4e1b6a80c1e41d1317101))
* **render:** tools/render_hashes.ts holds every render byte over the corpus, and the posing seam in render.ts puts spine-core behind one interface — byte-identical, measured ([#972](https://github.com/firejune/rigc/issues/972)) ([c278b1d](https://github.com/firejune/rigc/commit/c278b1d6d7b287497ed05670bf6138f5b9e76323))


### Bug Fixes

* **core:** a constraint on a bone the posed skin leaves unposed reads and writes as the runtime does — signed zeros included, no NaN; a value that depends on the runtime's previous pass is classified by measurement and refused by name where it reaches a posed bone ([#983](https://github.com/firejune/rigc/issues/983)) ([0733b11](https://github.com/firejune/rigc/commit/0733b1127116b913a070c23c9e7e411b4f2c72f4)), closes [#979](https://github.com/firejune/rigc/issues/979)
* **core:** a slider poses again every bone its animation keys, even before a timeline's first key — the three CQ06 rigs the old generator never drew read exact ([#992](https://github.com/firejune/rigc/issues/992)) ([6bdab63](https://github.com/firejune/rigc/commit/6bdab639391aeffa0d49ac419b1920acd23a427d)), closes [#989](https://github.com/firejune/rigc/issues/989)
* **core:** a slider timeline's time and mix reach the slider through the setup blend — the looped dial slider with a keyed mix reads exact under --raw ([#995](https://github.com/firejune/rigc/issues/995)) ([90dba83](https://github.com/firejune/rigc/commit/90dba831f22e9217c047a04fa4a08eaa4ad0ec3d)), closes [#991](https://github.com/firejune/rigc/issues/991)
* **core:** a slider's additive deform at mix 1 over no current deform is the target — and every population of the core suite now reads through --raw (CR10–CR16) ([#1001](https://github.com/firejune/rigc/issues/1001)) ([5734329](https://github.com/firejune/rigc/commit/5734329ad13e41f98aa31fe109febbcff22d9428)), closes [#993](https://github.com/firejune/rigc/issues/993)
* **core:** localFromWorld, the additive world-space shearY, the transform timeline's mix and the transform-collapse case read bit-exact — the raw gate's four HOLEs closed ([#986](https://github.com/firejune/rigc/issues/986)) ([3ad371b](https://github.com/firejune/rigc/commit/3ad371b5b8e1dc2084a3609a6c59da22da8cff52)), closes [#966](https://github.com/firejune/rigc/issues/966) [#959](https://github.com/firejune/rigc/issues/959) [#380](https://github.com/firejune/rigc/issues/380)
* **core:** the deform timeline's Bézier percent is read as the runtime reads it — exact to the bit on every probe; the last 1-ulp gap the core-backed render had on production rigs ([#981](https://github.com/firejune/rigc/issues/981)) ([ede68e0](https://github.com/firejune/rigc/commit/ede68e057c3b806ab53171243f8edfaddc3da368))
* **core:** the path timeline's position, spacing and mixes reach the pose through the setup blend ([#988](https://github.com/firejune/rigc/issues/988)) ([44e2e15](https://github.com/firejune/rigc/commit/44e2e151d3720df073d7dcff452810b375d4e3e5)), closes [#984](https://github.com/firejune/rigc/issues/984)
* **deform:** turnCeiling picks the minimum-angle triangle on the r6 grid with an index tie-break — a pow ulp no longer moves the document ([#990](https://github.com/firejune/rigc/issues/990)) ([566f6e7](https://github.com/firejune/rigc/commit/566f6e78058c6538722a5ce9eb364a8c7425bbf0)), closes [#949](https://github.com/firejune/rigc/issues/949)
* **model:** the depth ceiling report is on the r6 grid like every measured figure, and every number the document spells is held to the f32 or r6 grid — the one machine-dependent value the Linux artifact confirmed ([#942](https://github.com/firejune/rigc/issues/942)) ([#950](https://github.com/firejune/rigc/issues/950)) ([31ffcaf](https://github.com/firejune/rigc/commit/31ffcaff1ff028911d93ef1c1ae057a75e367690))
* **oracle:** the stepped schedule crosses a physics reset key once, as a player does — both dumpers and the raw walk ([#985](https://github.com/firejune/rigc/issues/985)) ([c481eec](https://github.com/firejune/rigc/commit/c481eec7539adf53c7d735b858a980d3299b825a)), closes [#960](https://github.com/firejune/rigc/issues/960)
* **render:** a pose whose every drawable sits on an inactive bone is refused by name — no 0×0 frame is written ([#1002](https://github.com/firejune/rigc/issues/1002)) ([536e212](https://github.com/firejune/rigc/commit/536e2121313a2494530a0aeb63bcf1d25464a49e)), closes [#997](https://github.com/firejune/rigc/issues/997)
* **render:** the guide's --poser row lists the fallback reasons the render prints, held to them by RC09; a model document the core cannot read is named once ([#999](https://github.com/firejune/rigc/issues/999)) ([108c9ad](https://github.com/firejune/rigc/commit/108c9ad4e206ae44f5ef0c33624c70d61e4b7c00)), closes [#996](https://github.com/firejune/rigc/issues/996)
* **rig:** a slot's blend is refused by name when the runtime would read no mode — only the first letter's case is free, as for the constraint enums ([#970](https://github.com/firejune/rigc/issues/970)) ([1bb6584](https://github.com/firejune/rigc/commit/1bb65842f5bfd0a61419099490311464ce2c41d2))


### Instrument

* **selftest:** --only &lt;suite&gt; runs a squad's own suite and exits 2 naming every suite it skipped — a partial run that cannot read as green ([#944](https://github.com/firejune/rigc/issues/944)) ([a811aa5](https://github.com/firejune/rigc/commit/a811aa5993ecee48486046dcad9b0a6a469f755c)), closes [#937](https://github.com/firejune/rigc/issues/937) [#380](https://github.com/firejune/rigc/issues/380)
* **selftest:** the random populations draw from a generator whose period exceeds every population; MG07 retired with the measurement ([#994](https://github.com/firejune/rigc/issues/994)) ([efd00c3](https://github.com/firejune/rigc/commit/efd00c3f56f46e9b5231a2a4d3dfca33e478e85f)), closes [#952](https://github.com/firejune/rigc/issues/952) [#940](https://github.com/firejune/rigc/issues/940)
* **tools:** a tracked base hash document for the gallery rows — the five base-gate controls hold byte identity on every run, and a stale base is red with the one command that refreshes it ([#941](https://github.com/firejune/rigc/issues/941)) ([0d1b899](https://github.com/firejune/rigc/commit/0d1b89956145e8746155061c559048b1cebe9bae))
* **tools:** emit_hashes — every build in every corpus hashed across commits, the byte-identity instrument step 1 of [#380](https://github.com/firejune/rigc/issues/380) is gated by ([#916](https://github.com/firejune/rigc/issues/916)) ([c05311b](https://github.com/firejune/rigc/commit/c05311b9550a687def8dde2cac26bfd9ff6c8917)), closes [#914](https://github.com/firejune/rigc/issues/914)
* **tools:** pose_oracle — the exam's pose oracle in the tree, with world vertices, draw order, clipping, events and stepped physics, in a JSON a second dumper can produce ([#911](https://github.com/firejune/rigc/issues/911)) ([d3ad1f8](https://github.com/firejune/rigc/commit/d3ad1f872e24c173ce85de95f36da16c8284ee6e))
* **tools:** pose-oracle carries the slot's blend mode — the core judged on it on every recipe ([#947](https://github.com/firejune/rigc/issues/947)) ([3d135a6](https://github.com/firejune/rigc/commit/3d135a66ba0bf45d7334d8a9f5f07f48bf4d21f7)), closes [#933](https://github.com/firejune/rigc/issues/933)

## [1.5.3](https://github.com/firejune/rigc/compare/v1.5.2...v1.5.3) (2026-09-28)


### Bug Fixes

* **compile:** every enum key of the spec has an owner — boneIndexing, from.rotation, a generator kind and the manifest's mesh.kind outside their sets are refused naming the value and the set, where 5 or "foo" built green or crashed ([#906](https://github.com/firejune/rigc/issues/906)) ([eb5fdd8](https://github.com/firejune/rigc/commit/eb5fdd8a72c91cd86f33fe66dbb7c846aaeb62db)), closes [#900](https://github.com/firejune/rigc/issues/900)
* **validate:** A10 reads the setup pose of a skeleton with no animation and skips only the stepping half — a static rig posed to NaN is refused where it gated green ([#905](https://github.com/firejune/rigc/issues/905)) ([86e615f](https://github.com/firejune/rigc/commit/86e615fff111273bd28af37fd8930e6e7fd3d6a6)), closes [#902](https://github.com/firejune/rigc/issues/902)


### Documentation

* **motion:** §6.4 keys the flag's extreme 27 % after the arm's, as §3.7's table says, and the chain is regenerated; §7 says what a picture measures ([#903](https://github.com/firejune/rigc/issues/903)) ([82d0fab](https://github.com/firejune/rigc/commit/82d0fab37381d76179c2cc62edff7b6497aef9c3)), closes [#897](https://github.com/firejune/rigc/issues/897)

## [1.5.2](https://github.com/firejune/rigc/compare/v1.5.1...v1.5.2) (2026-09-28)


### Bug Fixes

* **compile:** a spec value of the wrong type is refused naming the field, the type found and the type required — "x": "5" no longer builds as 5, and every key the scan admits has a type ([#901](https://github.com/firejune/rigc/issues/901)) ([babe62e](https://github.com/firejune/rigc/commit/babe62e9a6780750a9f766a3468c03e16e1b8779))


### Instrument

* **pose:** the trace records each coarse seed's rotation row — a half-turn within 2.4 px of the truth on 2 of 238 found trials and none of the 6 misses, so the one-rotation field stays and both levers measured are rejected ([#896](https://github.com/firejune/rigc/issues/896)) ([52faeba](https://github.com/firejune/rigc/commit/52faebae6346483ef9477ee53607b8a499fe21e5))


### Documentation

* **motion:** §6 derives the flag hinge in the arm bone's own frame — flag.x 24.66 → 47.93, frame 0 matches poseA within 0.4 px — and the chain, the digests and the argument are regenerated on the current search ([#899](https://github.com/firejune/rigc/issues/899)) ([4431011](https://github.com/firejune/rigc/commit/4431011de58b3c2ef5532d580a7cb16c7bf5990e)), closes [#885](https://github.com/firejune/rigc/issues/885)

## [1.5.1](https://github.com/firejune/rigc/compare/v1.5.0...v1.5.1) (2026-09-28)


### Bug Fixes

* **compile:** a number the skeleton cannot carry is refused naming the field and the value — a bone at x: 1e309 (or 1e308) no longer builds green as "x": null ([#891](https://github.com/firejune/rigc/issues/891)) ([3df097b](https://github.com/firejune/rigc/commit/3df097b088baa493755cc68f77a5c771784e416e))
* **pose:** the stopped polish also tries a quarter rung up — the narrowed search on MOTION §6's stationary post returns to the old placement (0.0649 → 0.0593, 0.1 px from it), the floor grid finds 237 → 238, misses 8 → 6 ([#893](https://github.com/firejune/rigc/issues/893)) ([e3e50e9](https://github.com/firejune/rigc/commit/e3e50e9aa3c213e2765c1be9d34f60ed585ecf1a)), closes [#886](https://github.com/firejune/rigc/issues/886)
* **validate:** A10 reads the whole world transform — a NaN in a, b, c or d is refused naming the bone, the frame and the term, where a finite position let it through ([#888](https://github.com/firejune/rigc/issues/888)) ([66ad971](https://github.com/firejune/rigc/commit/66ad97170415a33fda0cddb65449ea49bf9571fb))


### Instrument

* **docs:** the docs-quote suite counts a transcript no anchor rule reaches, anchors a report header, runs a tagged setup fence in an overlay, and matches a token-leading `…/` — the five pose blocks reproduce ([#895](https://github.com/firejune/rigc/issues/895)) ([ea34c44](https://github.com/firejune/rigc/commit/ea34c44ac8ac381869557b1e633e73bbc5da7f8c))

## [1.5.0](https://github.com/firejune/rigc/compare/v1.4.0...v1.5.0) (2026-09-28)


### Features

* **atlas:** build --pack --page-edges free searches every width, with two exact bounds — twelve region sets measured, up to 10.22 % smaller pages at 53 ms for all twelve ([#879](https://github.com/firejune/rigc/issues/879)) ([012a751](https://github.com/firejune/rigc/commit/012a7510c621c691eab422c7cec4b195c05d8ac8))


### Bug Fixes

* **pose:** the polish escapes a scale–position valley by re-fitting half a rung up and the refinement carries 15 — the four trials [#876](https://github.com/firejune/rigc/issues/876) lost return at their truth, the floor grid finds 227 → 237, misses 14 → 8 ([#884](https://github.com/firejune/rigc/issues/884)) ([7a9aa4b](https://github.com/firejune/rigc/commit/7a9aa4bb793cc0e1386227b75ffda7f8e7f4eed6))
* **render:** a pose that is not finite is refused by the bone or vertex that overflowed and its value — "posed no drawable attachment" stays for a skeleton that draws nothing ([#883](https://github.com/firejune/rigc/issues/883)) ([120d87c](https://github.com/firejune/rigc/commit/120d87c420bc97439262c9b24ddc8da594c5bf49)), closes [#873](https://github.com/firejune/rigc/issues/873)

## [1.4.0](https://github.com/firejune/rigc/compare/v1.3.0...v1.4.0) (2026-09-28)


### Features

* **render:** --geometry writes every frame's skinned vertices and bone world transforms beside the frames — the instrument spine-parts' stretch and head-frame judgements need ([#874](https://github.com/firejune/rigc/issues/874)) ([570fdf3](https://github.com/firejune/rigc/commit/570fdf330c41c1a38152ec56a235aa33c07e2c0e)), closes [#864](https://github.com/firejune/rigc/issues/864)


### Bug Fixes

* **pose:** the coarse grid steps at an eighth of the part, not a quarter — 42 more trials found on the floor grid (185 → 227 of 420), the 48 px fist places at its truth, search misses 65 → 14 ([#876](https://github.com/firejune/rigc/issues/876)) ([85bcaed](https://github.com/firejune/rigc/commit/85bcaed56618d8a34a79b6a7c6a2d91cc07e2303))

## [1.3.0](https://github.com/firejune/rigc/compare/v1.2.3...v1.3.0) (2026-09-27)


### Features

* **atlas:** build --pack can size the page freely — two painting rigs measured 37–47 % smaller at the PK05 bound; rotation measured and held back ([#870](https://github.com/firejune/rigc/issues/870)) ([8bc2da6](https://github.com/firejune/rigc/commit/8bc2da6c7afc50aefdc4a12ae87beaeba271e41c))
* **compile:** a "segments" mesh generator — lattice over the part's alpha, weights from distance to named bone segments, one authoring decision ([#868](https://github.com/firejune/rigc/issues/868)) ([922becc](https://github.com/firejune/rigc/commit/922beccfd2913979e74e56eff04819d62c8e8de5))
* **package:** an exports map names the surface a dependant may import — plate, font5x7, transform, cli — and keeps deep paths for one release ([#863](https://github.com/firejune/rigc/issues/863)) ([ced7cc5](https://github.com/firejune/rigc/commit/ced7cc52050b4dfadc80d0eb0fc785b1f293351a))
* **validate:** A15 reads invariants.idleDrivesMeshes — a painting rig declares that its idle deforms meshes and A15 reports the cost instead of 42 refusals ([#867](https://github.com/firejune/rigc/issues/867)) ([3b99bcb](https://github.com/firejune/rigc/commit/3b99bcb9662c36028fd4e532fb2780343665ed65))


### Bug Fixes

* **pose:** a refusal names the part's size, texture and candidate spread against a measured floor ([#869](https://github.com/firejune/rigc/issues/869)) ([7fd796c](https://github.com/firejune/rigc/commit/7fd796cd843aae9a50aef77521f0cadd4c258a1d))
* **smoke:** the release confirmation waits for the tarball, not the packument — metadata without bytes is "not served", exit 3 ([#861](https://github.com/firejune/rigc/issues/861)) ([fcabe4d](https://github.com/firejune/rigc/commit/fcabe4d3fb0ea7de6c4183feda4ba86b4e90bd41)), closes [#833](https://github.com/firejune/rigc/issues/833)

## [1.2.3](https://github.com/firejune/rigc/compare/v1.2.2...v1.2.3) (2026-09-27)


### Documentation

* **readme:** lead with the words users search for — AI-authored Spine 2D rigging and animation, verified before it is written ([#853](https://github.com/firejune/rigc/issues/853)) ([d257c86](https://github.com/firejune/rigc/commit/d257c868fc0446501c58ddddd379b66d41f3001d))

## [1.2.2](https://github.com/firejune/rigc/compare/v1.2.1...v1.2.2) (2026-09-26)


### Documentation

* **cases:** a case study — converting a Live2D model to Spine with the tree alone, and verifying the conversion ([#852](https://github.com/firejune/rigc/issues/852)) ([4079398](https://github.com/firejune/rigc/commit/4079398b7d07427565ed0c2e96169d81f09cc2a8))
* **skills:** the loop reads check from the top and treats a figure as a start, and the foreign-player paragraph says where a drawable's part goes ([#850](https://github.com/firejune/rigc/issues/850)) ([ee24851](https://github.com/firejune/rigc/commit/ee24851efbb9300bddf1e0179b82b706dddaa7fd))

## [1.2.1](https://github.com/firejune/rigc/compare/v1.2.0...v1.2.1) (2026-09-25)


### Bug Fixes

* **check:** a sidecar-less frame set that is not opaque is refused by name, the no-frames.json note names both origins, and an unmatched directory names the animations and --as ([#845](https://github.com/firejune/rigc/issues/845)) ([5a66b03](https://github.com/firejune/rigc/commit/5a66b03563bdd1c79c6bd1b3efd81772b88e96ce))
* **render:** the rasteriser clips as the runtime does, so render and check no longer draw pixels a clipping attachment removes ([#847](https://github.com/firejune/rigc/issues/847)) ([282880b](https://github.com/firejune/rigc/commit/282880bf7c6cce64f4405e2599f51a85c8a73870))

## [1.2.0](https://github.com/firejune/rigc/compare/v1.1.0...v1.2.0) (2026-09-25)


### Features

* **check:** `--out` writes the picture each listed frame's figures came from — reference, candidate, difference and overlay at native size ([#840](https://github.com/firejune/rigc/issues/840)) ([e2abb95](https://github.com/firejune/rigc/commit/e2abb95264fd08d62a42ad486f2c065752d912ee))
* **preview:** the header carries the line `validate <dir>` prints, a page takes a pane per candidate, and a green build ends by naming it ([#843](https://github.com/firejune/rigc/issues/843)) ([be2e251](https://github.com/firejune/rigc/commit/be2e2512a90fac6fec7870ef14abab3c4f0ba9b4))
* **render:** `--slot` and `--hide` draw a subset of the slots on the whole rig's grid, recorded in frames.json and refused by `check` as a reference ([#838](https://github.com/firejune/rigc/issues/838)) ([f84eae4](https://github.com/firejune/rigc/commit/f84eae4f3f8955a7d0c44ab2b2f77074ffd70dd3))


### Documentation

* **skills:** the entry skill says what to look for after `render`, where reference frames come from for a foreign player, and that a unit ends on `preview` ([#841](https://github.com/firejune/rigc/issues/841)) ([c8cb0bc](https://github.com/firejune/rigc/commit/c8cb0bc085e4d7e7eca5daf7bcadd006c815f887))

## [1.1.0](https://github.com/firejune/rigc/compare/v1.0.2...v1.1.0) (2026-09-24)


### Features

* **cli:** `rigc skills install` puts the shipped skills where Codex, Gemini CLI and Antigravity look, and every guide reference survives a per-folder install ([#832](https://github.com/firejune/rigc/issues/832)) ([4fdf650](https://github.com/firejune/rigc/commit/4fdf650da2d638f29527ef57c1e509aa327905b3))


### Instrument

* **selftest:** `CUR110` and the tree-text scans read what git tracks, not what sits in the directory ([#829](https://github.com/firejune/rigc/issues/829)) ([27b7de0](https://github.com/firejune/rigc/commit/27b7de0230542ad9f47ebb8bbad8e956e35e4af3))

## [1.0.2](https://github.com/firejune/rigc/compare/v1.0.1...v1.0.2) (2026-09-24)


### Bug Fixes

* **compile:** split SPEC_COVERAGE into the format reference and a dated survey, and stop the point refusal citing parts that moved ([#826](https://github.com/firejune/rigc/issues/826)) ([6d4185a](https://github.com/firejune/rigc/commit/6d4185a3255955faf1eabd7e3a9170f4e733f8db))
* **validate:** A02 names the generations that spelled `transform` — 4.0 and 4.1, not 4.2 ([#819](https://github.com/firejune/rigc/issues/819)) ([889684c](https://github.com/firejune/rigc/commit/889684c71fb6acdc62d077559506a396c8d3c225))
* **validate:** A07 names a trailing blank line as that, not as a page block with no region ([#820](https://github.com/firejune/rigc/issues/820)) ([109c1f6](https://github.com/firejune/rigc/commit/109c1f664bb50cf7cff470edd71ea363edd09252))


### Documentation

* **authoring:** §0–§2 and §5–§12 speak in the present tense, without the tracker, the controls or the runs behind them ([#822](https://github.com/firejune/rigc/issues/822)) ([0e18c4d](https://github.com/firejune/rigc/commit/0e18c4d04840085ee733bfb6f5392553e9a2f1cf))
* **authoring:** §3 and §4 state the present rule — the repository's history, the maker's voice and the unresolvable references cut ([#821](https://github.com/firejune/rigc/issues/821)) ([9570415](https://github.com/firejune/rigc/commit/95704152d7b5cfee2a176aa272efa7254aff3d73))
* **face:** rigging, motion and face guides state the tool's present, not its history ([#825](https://github.com/firejune/rigc/issues/825)) ([e4e8090](https://github.com/firejune/rigc/commit/e4e80909c9fa6f92198cf93d97e48c05cbf6e18c))
* **ingest:** the ingest page speaks in the present, and SPEC_COVERAGE loses what a user cannot resolve ([#824](https://github.com/firejune/rigc/issues/824)) ([e6c5dfb](https://github.com/firejune/rigc/commit/e6c5dfb926c7c44f655f8ac6a0d4142cd682ee03))
* **readme:** README, GENERATIONS and PROMPTING state the tool's present, not the repository's past ([#817](https://github.com/firejune/rigc/issues/817)) ([1d91ebc](https://github.com/firejune/rigc/commit/1d91ebc29940edb89a9b9bd269ce7faf9bbfaaf6))

## [1.0.1](https://github.com/firejune/rigc/compare/v1.0.0...v1.0.1) (2026-09-23)


### Documentation

* **generations:** the Spine-generation policy as one page, and a README paragraph that was a diary entry removed ([#813](https://github.com/firejune/rigc/issues/813)) ([c1e3185](https://github.com/firejune/rigc/commit/c1e318535511cabe282c5e92e786dbae0c1d8673))

## [1.0.0](https://github.com/firejune/rigc/compare/v0.36.1...v1.0.0) (2026-09-23)


### Documentation

* **roadmap:** 1.0 — what the number was claimed on, and what it now costs ([#811](https://github.com/firejune/rigc/issues/811)) ([922e111](https://github.com/firejune/rigc/commit/922e11130f796adfa9867ef41bb4e863283003a8))

## [0.36.1](https://github.com/firejune/rigc/compare/v0.36.0...v0.36.1) (2026-09-23)


### Bug Fixes

* **compile:** `--atlas-in` re-emits a pack in rigc's own blank-line shape, and `A07` names a leading blank line as that rather than as "consecutive blank lines" ([#809](https://github.com/firejune/rigc/issues/809)) ([bc74395](https://github.com/firejune/rigc/commit/bc7439566b00f81186996cf6f7979f66f1e10ced))
* **compile:** a `default` skin is emitted exactly when the spec has one, so a rebuild of an export with no default skin declares none either ([#801](https://github.com/firejune/rigc/issues/801)) ([#805](https://github.com/firejune/rigc/issues/805)) ([9c85d84](https://github.com/firejune/rigc/commit/9c85d841aa03ac2fffef978c329cee14e8f3dde5))
* **compile:** a stated path `lengths` is carried as stated, and an omitted one is measured through the runtime's own bone matrices at the parser's `vertexCount / 3` entries ([#808](https://github.com/firejune/rigc/issues/808)) ([f01c6d6](https://github.com/firejune/rigc/commit/f01c6d6a5ada6bbfad96115231291bf95e78431e))


### Instrument

* **timelines:** each physics bound states its basis, arithmetic or behavioural, and a control holds every one against the runtime ([#807](https://github.com/firejune/rigc/issues/807)) ([dedb4c7](https://github.com/firejune/rigc/commit/dedb4c7f309ffdbac06b12a913b33f06718a115e))

## [0.36.0](https://github.com/firejune/rigc/compare/v0.35.1...v0.36.0) (2026-09-23)


### Features

* **compile:** an attachment states its own `name` in the rig spec, written verbatim and never composed, so a rebuild answers to the names its export does ([#802](https://github.com/firejune/rigc/issues/802)) ([6d0c86a](https://github.com/firejune/rigc/commit/6d0c86a67387277cf362e50de82b09c5b01513b7))


### Bug Fixes

* **compile:** a sequence whose frames differ in size builds at the size it states, because the runtime draws every frame into the attachment's one size ([#797](https://github.com/firejune/rigc/issues/797)) ([ef698f5](https://github.com/firejune/rigc/commit/ef698f5bb23c450986c6f59673668e99e7727a66))
* **timelines:** physics `damping` is bounded on the closed `[0, 1]`, so a setup or keyed 1 (4.2's own default) and a 0 build, and only the values past either end are refused ([#800](https://github.com/firejune/rigc/issues/800)) ([11bc29f](https://github.com/firejune/rigc/commit/11bc29f08bd991df6e68770e3b8a39983250c2ba))

## [0.35.1](https://github.com/firejune/rigc/compare/v0.35.0...v0.35.1) (2026-09-23)


### Bug Fixes

* **compile:** a mesh writes its `path` and `color` right after `type`, and a skin's slot keys are compared with U+3000 and the full-width digits folded, so the two production shapes the public exports never carry come out in the editor's order ([#792](https://github.com/firejune/rigc/issues/792)) ([bb2dd64](https://github.com/firejune/rigc/commit/bb2dd648d9bb428fbd3a15be8389597ec19cf4b3))

## [0.35.0](https://github.com/firejune/rigc/compare/v0.34.0...v0.35.0) (2026-09-23)


### Bug Fixes

* **compile:** a contour's margin and tolerance are the drawing's pixels on a `scale:` page, applied as the stated scale's worth of texels, so a finer page traces the declared outline and its refusals say what was applied ([#789](https://github.com/firejune/rigc/issues/789)) ([ab1c31b](https://github.com/firejune/rigc/commit/ab1c31b50cd25f85831b4e596254ec5bfe63636a))
* **compile:** every emitted object's keys come out in the order the editor writes them, from one table read off the twelve editor exports ([#785](https://github.com/firejune/rigc/issues/785)) ([d48c505](https://github.com/firejune/rigc/commit/d48c505afc1e3f5e99f45a3c46c9100b33837347))
* **compile:** every key an editor export leaves to the 4.3 parser is left out of the file, so a rebuild is its export apart from hash and spine ([#790](https://github.com/firejune/rigc/issues/790)) ([afdf428](https://github.com/firejune/rigc/commit/afdf428fae7fbbaaea2caf190361400a5c54a096))
* **validate:** `A19` decides a loose part's transparency by its texels, so a fully opaque RGBA overlay is refused loose as it is packed ([#788](https://github.com/firejune/rigc/issues/788)) ([c9ab386](https://github.com/firejune/rigc/commit/c9ab386a903da633149ed00b79c69d96dcdf9b53))
* **validate:** a muted ik or transform the rig spec declares consumer-driven SKIPs by name at A47/A48, and ingest writes that declaration for the shape an export cannot explain ([#787](https://github.com/firejune/rigc/issues/787)) ([6a159e3](https://github.com/firejune/rigc/commit/6a159e3bd83c499be1a3b8abb0c5314c8e1108bc))

## [0.34.0](https://github.com/firejune/rigc/compare/v0.33.1...v0.34.0) (2026-09-23)


### Bug Fixes

* **chainfit:** the hinge ladder divides its window, so the step `search` prints, each part's `window` and each chain note are the step the run walked ([#780](https://github.com/firejune/rigc/issues/780)) ([ba4be02](https://github.com/firejune/rigc/commit/ba4be02c5d33864295dccd72d4c1fd3e01c4fa0d))
* **compile:** a mesh fit's overshoot is stated in the drawing's pixels on a `scale:` page, and a depth sheet or soft mask made at the art's size is read there by the ratio the atlas states ([#778](https://github.com/firejune/rigc/issues/778)) ([c668c66](https://github.com/firejune/rigc/commit/c668c66aacd65770e0055be0decd0188083ad94f))
* **compile:** every emitted number is its float32's shortest name, so an editor export's rebuild spells every number as the export does ([#782](https://github.com/firejune/rigc/issues/782)) ([b00228a](https://github.com/firejune/rigc/commit/b00228ae0a62020b22fd0172ffd1fc01b15bfe3f))
* **pose:** an accepted placement that stopped on a wall of the search window names the wall beside the value it holds, and `walls` records it for every verdict ([#781](https://github.com/firejune/rigc/issues/781)) ([c58e498](https://github.com/firejune/rigc/commit/c58e49892a7d58ba9a1f0dec563088260a6c5907))
* **validate:** `A19` exempts the base plate the rig names before it measures one against the stage, so a stageless manifest rig's pack gates green and a stageless rig-spec build says what would decide its plate ([#775](https://github.com/firejune/rigc/issues/775)) ([9572726](https://github.com/firejune/rigc/commit/9572726ff9964776db0bbea14a4a0c35acc77778))


### Miscellaneous Chores

* **release:** ship the float32 number formatting as 0.34.0, not a patch ([#783](https://github.com/firejune/rigc/issues/783)) ([dcb8a9b](https://github.com/firejune/rigc/commit/dcb8a9be9618f5a371ce1a4ab5a6bacfc364b42d))

## [0.33.1](https://github.com/firejune/rigc/compare/v0.33.0...v0.33.1) (2026-09-23)


### Bug Fixes

* **validate:** `A45`, `A43` and `A46` pose a key at the time spine-core stores it rather than one float step before it, so the selftest's own `ingest_probe` is green and `IG72` holds it there ([#771](https://github.com/firejune/rigc/issues/771)) ([#772](https://github.com/firejune/rigc/issues/772)) ([d62d8e2](https://github.com/firejune/rigc/commit/d62d8e24bfc0dacc30fbe7e8840ed4002f66e2e2))
* **validate:** `A47`/`A48` ask the muted-at-rest question of an ik and a transform constraint, live by the runtime's own `!== 0` and, for a transform, on the mixes of the properties it drives ([#774](https://github.com/firejune/rigc/issues/774)) ([0e12588](https://github.com/firejune/rigc/commit/0e125881ecbde490cfaa1cf95d999047e8094b92))

## [0.33.0](https://github.com/firejune/rigc/compare/v0.32.0...v0.33.0) (2026-09-23)


### Features

* **ingest:** a skeleton that declares no stage is carried by `ingest` as declaring none, and every reader of the stage says what it does without one ([#714](https://github.com/firejune/rigc/issues/714)) ([#768](https://github.com/firejune/rigc/issues/768)) ([565a3f8](https://github.com/firejune/rigc/commit/565a3f8d7912e4ead30eae92b993b92ba7a3de66))

## [0.32.0](https://github.com/firejune/rigc/compare/v0.31.0...v0.32.0) (2026-09-23)


### Features

* **compile:** a sequence attachment draws a numbered image series resolved frame by frame by name, a `sequence` track steps it, `A46` poses every key against the file's own statement, and `ingest` carries both instead of blocking ([#729](https://github.com/firejune/rigc/issues/729)) ([#767](https://github.com/firejune/rigc/issues/767)) ([a1dc6fb](https://github.com/firejune/rigc/commit/a1dc6fbc17ad3bbef169efd9b919e51a41ccf43e))


### Bug Fixes

* **ingest:** a contested attachment whose source name is not the one rigc composes is reported under `ATTACHMENT_NAME` with both strings, read off `composeSkinAttachmentName` rather than a second copy of the separator ([#746](https://github.com/firejune/rigc/issues/746)) ([#763](https://github.com/firejune/rigc/issues/763)) ([40dfa29](https://github.com/firejune/rigc/commit/40dfa2954d4c31e7eb009b3421bedde8bbd51994))
* **validate:** `A36`/`A37` read the `mix` values a timeline poses, through the one reading `A23` now shares, and `A23`'s setup sentence says a negative `strength` is pushed away while `damping`'s refusal names its `fps` dependence ([#752](https://github.com/firejune/rigc/issues/752), [#748](https://github.com/firejune/rigc/issues/748)) ([#766](https://github.com/firejune/rigc/issues/766)) ([641456c](https://github.com/firejune/rigc/commit/641456c84312ea6a5437c09b630aa63515a22a1a))

## [0.31.0](https://github.com/firejune/rigc/compare/v0.30.0...v0.31.0) (2026-09-23)


### Features

* **compile:** a bone's `inherit` mode is keyable — the motion spec gains a stepped `inherit` track, `ingest` carries it, and `A10` names a key the runtime resolves to no mode ([#733](https://github.com/firejune/rigc/issues/733)) ([#760](https://github.com/firejune/rigc/issues/760)) ([63b75ef](https://github.com/firejune/rigc/commit/63b75efcf3cb6776eb52cce6f68d990f6c44f435))


### Bug Fixes

* **cli:** `explain` and `build` withhold the figures they would take off a page that is not its declared size, and a contour there is refused with `A06`'s sentence ([#750](https://github.com/firejune/rigc/issues/750)) ([#761](https://github.com/firejune/rigc/issues/761)) ([f5fbf43](https://github.com/firejune/rigc/commit/f5fbf433ca7f66e3b0a510ed2cacab62b5550793))
* **ingest:** the physics timeline that names no constraint is spelled `"physics": "*"`, emitted under the empty name, read by `A34` as every constraint declaring that property global, and carried by `ingest` byte for byte ([#726](https://github.com/firejune/rigc/issues/726)) ([#758](https://github.com/firejune/rigc/issues/758)) ([9a6661e](https://github.com/firejune/rigc/commit/9a6661e887b7750748d9548f2b753a6359c0174b))

## [0.30.0](https://github.com/firejune/rigc/compare/v0.29.0...v0.30.0) (2026-09-23)


### Features

* **compile:** the separable slot colour timelines `rgb`, `alpha` and `rgb2` are spelled, emitted as themselves and read back — and `ingest` carries them instead of blocking ([#730](https://github.com/firejune/rigc/issues/730)) ([#757](https://github.com/firejune/rigc/issues/757)) ([4d6d427](https://github.com/firejune/rigc/commit/4d6d4276335ad854f72654bcef80bc5d80b36b0d))


### Bug Fixes

* **ingest:** a physics constraint that drives no component is omitted with its timelines and skin membership, and named by a coded LOSS, so the rebuild of a file an editor exports is no longer refused whole by `A23` ([#731](https://github.com/firejune/rigc/issues/731)) ([#754](https://github.com/firejune/rigc/issues/754)) ([96d7c2b](https://github.com/firejune/rigc/commit/96d7c2b02d8ac354f0e64a830a295a32d3f562c6))
* **validate:** an atlas page that is not a PNG is refused by name — one signature reader names WebP, JPEG, GIF, KTX, KTX2 or the bytes it found, and says truncated for a PNG that runs out before IEND ([#732](https://github.com/firejune/rigc/issues/732)) ([#756](https://github.com/firejune/rigc/issues/756)) ([c21854b](https://github.com/firejune/rigc/commit/c21854b93337735fffde949f71358354b6c740a6))

## [0.29.0](https://github.com/firejune/rigc/compare/v0.28.0...v0.29.0) (2026-09-19)


### Features

* **compile:** a skin's `bones` and its constraint lists are per-skin sets, so two skins may activate one bone ([#725](https://github.com/firejune/rigc/issues/725)) ([#741](https://github.com/firejune/rigc/issues/741)) ([4c85f87](https://github.com/firejune/rigc/commit/4c85f87db0c317234a7dc07273775ee37b392437))


### Bug Fixes

* **compile:** a physics `strength` key of 0 is a span the next key undoes, so a KEY is held to `>= 0` where a setup pose stays `> 0` ([#727](https://github.com/firejune/rigc/issues/727)) ([#749](https://github.com/firejune/rigc/issues/749)) ([8141634](https://github.com/firejune/rigc/commit/81416340723ff46b35a328a3af41b817ba2965ee))
* **compile:** the editor's name order is read off five stored round trips rather than quantified over a family, so folders, capitals and accents build and only what those files leave open is refused ([#728](https://github.com/firejune/rigc/issues/728)) ([#745](https://github.com/firejune/rigc/issues/745)) ([d111e25](https://github.com/firejune/rigc/commit/d111e256715214c3f9ca3ab28aa61508df04ea93))
* **ingest:** a dropped attachment `name` is the atlas region key, so it is kept as `path` — on a contested placeholder too, where nothing was said at all ([#742](https://github.com/firejune/rigc/issues/742)) ([#747](https://github.com/firejune/rigc/issues/747)) ([8aa3296](https://github.com/firejune/rigc/commit/8aa3296a43a606bed8869b3b5bd5a3c47d28c002))
* **validate:** a physics constraint muted at rest is refused only when no timeline keys its `mix` above 0 ([#743](https://github.com/firejune/rigc/issues/743)) ([#753](https://github.com/firejune/rigc/issues/753)) ([a610488](https://github.com/firejune/rigc/commit/a6104884e194bc9f482eabbf1dd9e81e27d13dcd))


### Instrument

* **validate:** the page-size clause names the ratio it measured and the `scale:` header that states the same art truthfully, and `A19` stops judging texels it cannot locate ([#715](https://github.com/firejune/rigc/issues/715)) ([#751](https://github.com/firejune/rigc/issues/751)) ([99f9156](https://github.com/firejune/rigc/commit/99f91569c4d7e689eafe566d747b1e7f0c5ec254))

## [0.28.0](https://github.com/firejune/rigc/compare/v0.27.0...v0.28.0) (2026-09-19)


### Features

* **diff:** animations get a name-agnostic block and an `--as` bridge, so a candidate that named its own shot can be measured ([#720](https://github.com/firejune/rigc/issues/720)) ([#736](https://github.com/firejune/rigc/issues/736)) ([0593c7f](https://github.com/firejune/rigc/commit/0593c7f1c5f7ab45895769d86a7b00b03dec9691))


### Bug Fixes

* **cli:** a turned atlas region's page rectangle is printed where an author reads it, and §0.2 says which way to turn it ([#718](https://github.com/firejune/rigc/issues/718)) ([#739](https://github.com/firejune/rigc/issues/739)) ([aaaf866](https://github.com/firejune/rigc/commit/aaaf866fbaecf1ac76bdc6e46601782a6a04bd9b))
* **docs:** §3.4 documents the three attachment types that carry geometry and no art, and says which corner a mesh's `uvs` start from ([#717](https://github.com/firejune/rigc/issues/717)) ([#734](https://github.com/firejune/rigc/issues/734)) ([bf609ee](https://github.com/firejune/rigc/commit/bf609ee3d952823a00a93cb9c66b33a2d6e8cfe2))
* **pose:** a refusal that stopped on a wall of the search window names the wall, and the rotation ladder the report prints is the one it walked ([#719](https://github.com/firejune/rigc/issues/719)) ([#740](https://github.com/firejune/rigc/issues/740)) ([6b4ae47](https://github.com/firejune/rigc/commit/6b4ae47ed2b99f869d46fc3601a7b051b30599ea))

## [0.27.0](https://github.com/firejune/rigc/compare/v0.26.0...v0.27.0) (2026-09-19)


### Features

* **ingest:** a file from another Spine generation is named, with what a 4.3 reader loses counted on that file ([#706](https://github.com/firejune/rigc/issues/706)) ([#721](https://github.com/firejune/rigc/issues/721)) ([ce233a0](https://github.com/firejune/rigc/commit/ce233a0a64a96c09b67f3cdf508b4af22a5fd518))


### Instrument

* **validate:** `A19` counts the texels it read, so a rectangle it could not read is a named non-measurement and not a verdict ([#705](https://github.com/firejune/rigc/issues/705)) ([#723](https://github.com/firejune/rigc/issues/723)) ([dad641e](https://github.com/firejune/rigc/commit/dad641e94d409c3d5792640624cea441e2e39cae))
* **validate:** a foreign linked mesh that states its own geometry is refused by name, and `ingest` says what it dropped ([#710](https://github.com/firejune/rigc/issues/710)) ([#724](https://github.com/firejune/rigc/issues/724)) ([294eab8](https://github.com/firejune/rigc/commit/294eab881614999263bc4877cafc647155f4f2e6))

## [0.26.0](https://github.com/firejune/rigc/compare/v0.25.6...v0.26.0) (2026-09-18)


### Features

* **compile:** a deform key may target a `path` attachment, and the constraint follows the curve the key wrote ([#696](https://github.com/firejune/rigc/issues/696)) ([#709](https://github.com/firejune/rigc/issues/709)) ([a19ad53](https://github.com/firejune/rigc/commit/a19ad53f339ec8404fd3c338d7c9010949e3a7c8))
* **compile:** a linked mesh draws another mesh's geometry, resolved by name, and every silence the parser keeps about one is refused ([#691](https://github.com/firejune/rigc/issues/691)) ([#713](https://github.com/firejune/rigc/issues/713)) ([e7a4381](https://github.com/firejune/rigc/commit/e7a4381f385d1afc5a209b5b19604670e6cca17f))
* **compile:** a slot's dark colour moves — `rgba2` is spelled, emitted, read back off the runtime and drawn ([#690](https://github.com/firejune/rigc/issues/690)) ([#712](https://github.com/firejune/rigc/issues/712)) ([41cfb15](https://github.com/firejune/rigc/commit/41cfb15d389c89586e6253a0a3b12266afd72308))


### Bug Fixes

* **compile:** a constraint name is unique per kind, the way Spine resolves one, and a spec rigc's own parser refuses is a coded ingest finding ([#692](https://github.com/firejune/rigc/issues/692)) ([#711](https://github.com/firejune/rigc/issues/711)) ([dc59f55](https://github.com/firejune/rigc/commit/dc59f55ceb068de8b6b878c7031d058c90f05994))


### Instrument

* **validate:** a region's rectangle lies inside the page it names, under every profile ([#694](https://github.com/firejune/rigc/issues/694)) ([#707](https://github.com/firejune/rigc/issues/707)) ([20061b0](https://github.com/firejune/rigc/commit/20061b019e0c3e086c508e22f6f9e87967eb96ef))

## [0.25.6](https://github.com/firejune/rigc/compare/v0.25.5...v0.25.6) (2026-09-18)


### Bug Fixes

* **check:** a slot's drift is correlated only over the pixels that reach the picture, and every figure carries the bound its own match gives it ([#698](https://github.com/firejune/rigc/issues/698)) ([#704](https://github.com/firejune/rigc/issues/704)) ([aa976a6](https://github.com/firejune/rigc/commit/aa976a65c1f0f7eab74068404fe16f477b85778f))
* **cli:** `explain` lists `--atlas-in` in its own help, and a pair it cannot pose is refused by name instead of thrown through ([#697](https://github.com/firejune/rigc/issues/697)) ([#702](https://github.com/firejune/rigc/issues/702)) ([c46b3a0](https://github.com/firejune/rigc/commit/c46b3a09251f71f94562cbe915368629ca8275a0))
* **compile:** `--copy-images` copies the pages the atlas names, so an `--atlas-in` build writes the pack it gated ([#693](https://github.com/firejune/rigc/issues/693)) ([#701](https://github.com/firejune/rigc/issues/701)) ([b55f9b4](https://github.com/firejune/rigc/commit/b55f9b46ff89f8233321a98e0cf65e25827fabc2))
* **compile:** a rig-spec ring binds every control bone it declares, and a bone no vertex binds is named by the gate ([#684](https://github.com/firejune/rigc/issues/684)) ([#699](https://github.com/firejune/rigc/issues/699)) ([6c557ce](https://github.com/firejune/rigc/commit/6c557ce7df9f1ad9d2ac3f9f15eff259b9794c7b))
* **compile:** an attachment key resolves against every skin, and a name no skin holds is refused with the skins searched ([#695](https://github.com/firejune/rigc/issues/695)) ([#703](https://github.com/firejune/rigc/issues/703)) ([c899ed0](https://github.com/firejune/rigc/commit/c899ed080b0fed06bb1cde9f0a0f567deb58c944))

## [0.25.5](https://github.com/firejune/rigc/compare/v0.25.4...v0.25.5) (2026-09-18)


### Bug Fixes

* **check:** the identity run reports a drift bounded by the sub-pixel step, names no frame that cannot exist, and the page says what a figure has to beat ([#678](https://github.com/firejune/rigc/issues/678)) ([#689](https://github.com/firejune/rigc/issues/689)) ([8c87dbb](https://github.com/firejune/rigc/commit/8c87dbbc3b9128b0924e2ca0a6006e1642ca8c19))
* **compile:** a misspelled required key in the rig spec is named as the typo rather than as the array it lost ([#672](https://github.com/firejune/rigc/issues/672)) ([#680](https://github.com/firejune/rigc/issues/680)) ([a61e1e4](https://github.com/firejune/rigc/commit/a61e1e49c38cc9950f56bded6153f962464eb414))
* **compile:** a slot emptied by a manifest state with no art names that state and the path, and its DROP lines reach the console ([#671](https://github.com/firejune/rigc/issues/671)) ([#687](https://github.com/firejune/rigc/issues/687)) ([4a73529](https://github.com/firejune/rigc/commit/4a735296cff859598dbbe681e22bd796d28c6328))
* **docs:** FACE.md states what three closed cards answered, routes to the failure map, and says which of its figures a run re-takes ([#674](https://github.com/firejune/rigc/issues/674)) ([#682](https://github.com/firejune/rigc/issues/682)) ([ba24146](https://github.com/firejune/rigc/commit/ba241462738668a8dbeb659fb35d595c930c1a7f))
* **docs:** the five shipped skills say what the tool does today, and a control reads their bodies ([#673](https://github.com/firejune/rigc/issues/673)) ([#685](https://github.com/firejune/rigc/issues/685)) ([e237d2c](https://github.com/firejune/rigc/commit/e237d2c9fe57f08afe4ddf8078edb2e5cadb8f12))
* **ingest:** every finding code is a documented row, held there by the module's own `note(` calls ([#675](https://github.com/firejune/rigc/issues/675)) ([#683](https://github.com/firejune/rigc/issues/683)) ([e26200a](https://github.com/firejune/rigc/commit/e26200a5607f3201013fc6a9f44780417183500b))


### Instrument

* **selftest:** the authoring guide is compared to the keys the two parsers accept, in both directions ([#676](https://github.com/firejune/rigc/issues/676)) ([#686](https://github.com/firejune/rigc/issues/686)) ([1d446bd](https://github.com/firejune/rigc/commit/1d446bde2d149d5e51cffe39c939462a9e1202af))
* **selftest:** the currency scan reads the doctrine, and an exported symbol stated as a number is the module's ([#677](https://github.com/firejune/rigc/issues/677)) ([#688](https://github.com/firejune/rigc/issues/688)) ([10a0967](https://github.com/firejune/rigc/commit/10a09677658bada21764224cfe73a3ccef717bbb))

## [0.25.4](https://github.com/firejune/rigc/compare/v0.25.3...v0.25.4) (2026-09-18)


### Bug Fixes

* **compile:** a bone track's property is refused with the ten timelines a bone has ([#656](https://github.com/firejune/rigc/issues/656)) ([#662](https://github.com/firejune/rigc/issues/662)) ([109268d](https://github.com/firejune/rigc/commit/109268d51d47fad30c46c44e79b96c74e4550e82))
* **compile:** a group's property is refused before a family is picked, with all three vocabularies a group can have ([#661](https://github.com/firejune/rigc/issues/661)) ([#667](https://github.com/firejune/rigc/issues/667)) ([b45a582](https://github.com/firejune/rigc/commit/b45a582d87c252616196525d587d3bad726372ca))
* **compile:** a world `scale` slider whose range dips below 0 is refused with the mirror it would pose ([#657](https://github.com/firejune/rigc/issues/657)) ([#664](https://github.com/firejune/rigc/issues/664)) ([40523f6](https://github.com/firejune/rigc/commit/40523f629768189c48beb43fd9affde35e725eeb))
* **validate:** A40 poses what a shared timeline's `apply` does with `add`, instead of reading a flag two classes state falsely about themselves ([#655](https://github.com/firejune/rigc/issues/655)) ([#663](https://github.com/firejune/rigc/issues/663)) ([261cf65](https://github.com/firejune/rigc/commit/261cf658b386ad60e30543163d1b5febe7aff623))


### Instrument

* **selftest:** the residual [#644](https://github.com/firejune/rigc/issues/644) left — four world readers, all thirty spellings, and three branches of the slider format ([#652](https://github.com/firejune/rigc/issues/652)) ([#659](https://github.com/firejune/rigc/issues/659)) ([3d62d30](https://github.com/firejune/rigc/commit/3d62d30f0acc1d692099ec52b19903ab9212fbb2))
* **validate:** a dial that drives any constraint the `constraints` array has already run is refused by name ([#665](https://github.com/firejune/rigc/issues/665)) ([#668](https://github.com/firejune/rigc/issues/668)) ([64e49a2](https://github.com/firejune/rigc/commit/64e49a2a6f44f99ff49504561c2f9989cdcadaba))
* **validate:** a slider that drives a slider the `constraints` array has already run is refused by name ([#658](https://github.com/firejune/rigc/issues/658)) ([#666](https://github.com/firejune/rigc/issues/666)) ([98d1fbe](https://github.com/firejune/rigc/commit/98d1fbe95be9b38baa024af44440a620d7350f57))

## [0.25.3](https://github.com/firejune/rigc/compare/v0.25.2...v0.25.3) (2026-09-17)


### Bug Fixes

* **compile:** a slot track's property is refused by name, before any key is shaped ([#650](https://github.com/firejune/rigc/issues/650)) ([#654](https://github.com/firejune/rigc/issues/654)) ([9bc1fd4](https://github.com/firejune/rigc/commit/9bc1fd47dd0fae95638387ef8350a132163fc168))


### Instrument

* **selftest:** the five branches of the slider format no cell of the grid enters, each posed against its own closed form ([#644](https://github.com/firejune/rigc/issues/644)) ([#651](https://github.com/firejune/rigc/issues/651)) ([826388d](https://github.com/firejune/rigc/commit/826388d76f6a5796d8d1aaefd1da3e74be112591))

## [0.25.2](https://github.com/firejune/rigc/compare/v0.25.1...v0.25.2) (2026-09-17)


### Documentation

* **authoring:** the `mix` rule the additive table leaves out, in the guide an agent authors from ([#645](https://github.com/firejune/rigc/issues/645)) ([f29ea17](https://github.com/firejune/rigc/commit/f29ea17b790a178f9be99f3bf74dec4acf352d9c))

## [0.25.1](https://github.com/firejune/rigc/compare/v0.25.0...v0.25.1) (2026-09-17)


### Bug Fixes

* **ingest:** an omitted stage origin is written and named, and a `--stage` beside a declared one is refused rather than ignored ([#622](https://github.com/firejune/rigc/issues/622), [#626](https://github.com/firejune/rigc/issues/626)) ([#631](https://github.com/firejune/rigc/issues/631)) ([2ad0489](https://github.com/firejune/rigc/commit/2ad0489f21c6349ee02c3527c9355f75ab07dd6c))


### Instrument

* **selftest:** a doc script's `vertices` run is measured under every renumbering the compiler accepts, so a script that stays green while doing something else is faulted ([#479](https://github.com/firejune/rigc/issues/479)) ([#635](https://github.com/firejune/rigc/issues/635)) ([0cd3eff](https://github.com/firejune/rigc/commit/0cd3effc882faafd35f356b6f95556d12d5ab8de))

## [0.25.0](https://github.com/firejune/rigc/compare/v0.24.0...v0.25.0) (2026-09-17)


### Features

* **diff:** the corpus round trip compares the values inside the structure, with the format's defaults read off the parser ([#615](https://github.com/firejune/rigc/issues/615)) ([#628](https://github.com/firejune/rigc/issues/628)) ([898b251](https://github.com/firejune/rigc/commit/898b251716e09eebafb932fc6dc3358dc8d51dff))


### Bug Fixes

* **cli:** `--stage` is for a skeleton that declares none, not for editor exports as a class, and the help text is held to the corpus that refuted it ([#616](https://github.com/firejune/rigc/issues/616)) ([#627](https://github.com/firejune/rigc/issues/627)) ([d2306d1](https://github.com/firejune/rigc/commit/d2306d1970aab7593656c3efb9fbc17abcb73e58))
* **diff:** an omitted `x`/`y` inside a declared stage is the `0` it means, so a rigc build and its own editor export stop reading the same box as half moved ([#620](https://github.com/firejune/rigc/issues/620)) ([#623](https://github.com/firejune/rigc/issues/623)) ([6018caa](https://github.com/firejune/rigc/commit/6018caaf887234dd7ba12c4f9561c3aca681deaf))
* **tools:** step 5 quotes both renderers, and a rig neither side can draw is a named SKIP rather than a bare exit=1 ([#621](https://github.com/firejune/rigc/issues/621)) ([#630](https://github.com/firejune/rigc/issues/630)) ([5d0e869](https://github.com/firejune/rigc/commit/5d0e86977054ee0bf798be63d479dc09fc64c8f4))


### Instrument

* **selftest:** a control code names one control and a prefix has one numbering authority, gated by TY17-TY19 over the run's own case lines, after the 38 collisions behind [#584](https://github.com/firejune/rigc/issues/584) were measured and repaired ([#584](https://github.com/firejune/rigc/issues/584)) ([#625](https://github.com/firejune/rigc/issues/625)) ([2e13150](https://github.com/firejune/rigc/commit/2e1315084b8a4b130126f8fffec1f949b8685c49))
* **selftest:** the header stops counting the suites that read the example corpus, and a control derives that list instead - finding an eighth suite that read it silently ([#617](https://github.com/firejune/rigc/issues/617)) ([#629](https://github.com/firejune/rigc/issues/629)) ([c12efa7](https://github.com/firejune/rigc/commit/c12efa7f990b6a77481ebab7bf90ebe347e619de))

## [0.24.0](https://github.com/firejune/rigc/compare/v0.23.0...v0.24.0) (2026-09-17)


### Features

* **compile:** the motion spec can key a physics constraint's own tuning, so the corpus export that keys five of those timelines transcribes ([#593](https://github.com/firejune/rigc/issues/593)) ([#611](https://github.com/firejune/rigc/issues/611)) ([11aec8d](https://github.com/firejune/rigc/commit/11aec8db864e07a2534b0ad3f224d7c3fb131560))
* **ingest:** --images &lt;dir&gt; writes the rig spec's images path so a loose decompiled spec rebuilds with no flag on build ([#595](https://github.com/firejune/rigc/issues/595)) ([#606](https://github.com/firejune/rigc/issues/606)) ([99558ca](https://github.com/firejune/rigc/commit/99558cab5d3cf3a568936812580af2d125fb5d17))


### Bug Fixes

* **atlas:** no pages is the empty file, and every rule whose subject is a page skips rather than passing over an empty array ([#608](https://github.com/firejune/rigc/issues/608)) ([#613](https://github.com/firejune/rigc/issues/613)) ([9bde8a8](https://github.com/firejune/rigc/commit/9bde8a80726de30811ae36375f64dfc1320db22c))
* **deformmeasure:** pose every deform key in the skin its timeline is keyed on, so a mesh in a named skin is measured instead of reported as undrawn ([#583](https://github.com/firejune/rigc/issues/583)) ([#603](https://github.com/firejune/rigc/issues/603)) ([d7b68e8](https://github.com/firejune/rigc/commit/d7b68e82a662397ec7d3f00cac1a9741bb7f06f0))
* **tools:** the round-trip summary reads every block of diff's report, not the sections alone; ROADMAP's confirmation condition admits the outcome where it was not taken ([#597](https://github.com/firejune/rigc/issues/597), [#582](https://github.com/firejune/rigc/issues/582)) ([#604](https://github.com/firejune/rigc/issues/604)) ([ffd0b4f](https://github.com/firejune/rigc/commit/ffd0b4f05bfb93bd640a661caea8a82239e40cd9))
* **validate:** a keyed physics value is held to the criterion the setup pose is, at compile for a spec and by A23 for a file rigc did not write ([#610](https://github.com/firejune/rigc/issues/610)) ([#619](https://github.com/firejune/rigc/issues/619)) ([8e9248c](https://github.com/firejune/rigc/commit/8e9248cb402df03ab8d9a7d90e84d7830c645128))
* **validate:** a loop that ran zero times reports SKIP, and the criterion deciding that is written down once ([#580](https://github.com/firejune/rigc/issues/580)) ([#612](https://github.com/firejune/rigc/issues/612)) ([92f5e83](https://github.com/firejune/rigc/commit/92f5e8388dafae2c2c2dac747807c02d508f94e3))
* **validate:** A08 performs the attachment-to-region join on the raw skeleton JSON, so a path naming no region is refused by the assertion whose subject it is ([#589](https://github.com/firejune/rigc/issues/589)) ([#607](https://github.com/firejune/rigc/issues/607)) ([571e115](https://github.com/firejune/rigc/commit/571e115b5e528eaf59610e030c3b8accb611d739))
* **validate:** the page rectangle of a turned region is one reader's, and it transposes at 270 as well as at 90 ([#579](https://github.com/firejune/rigc/issues/579)) ([#601](https://github.com/firejune/rigc/issues/601)) ([89aa89e](https://github.com/firejune/rigc/commit/89aa89e9ad05aaf45735272ce35fbc7e1ec57732))


### Instrument

* **docs:** the gallery READMEs quote the run's own closing lines instead of hand-kept assertion counts, and the overrides comment states its criterion ([#609](https://github.com/firejune/rigc/issues/609), [#605](https://github.com/firejune/rigc/issues/605)) ([#614](https://github.com/firejune/rigc/issues/614)) ([e38daac](https://github.com/firejune/rigc/commit/e38daac1ff1a4c0abcbb1a5b17c9e6cb3e93eae8))
* **ingest:** the IG suite gates all twelve editor exports through ingest, rebuild and diff, so the corpus round trip is a measurement the tree holds rather than one a pull request body remembered ([#594](https://github.com/firejune/rigc/issues/594)) ([#618](https://github.com/firejune/rigc/issues/618)) ([0abd7eb](https://github.com/firejune/rigc/commit/0abd7eb5afb9a5cd993b8a906b1ef2af75954433))

## [0.23.0](https://github.com/firejune/rigc/compare/v0.22.2...v0.23.0) (2026-09-16)


### Features

* **atlas:** lift a rotated region by transcribing the runtime's own mapping, so a measurement over an imported pack stops raising a refusal ([#570](https://github.com/firejune/rigc/issues/570)) ([#587](https://github.com/firejune/rigc/issues/587)) ([d97641e](https://github.com/firejune/rigc/commit/d97641e0fc98d290a753069335654f050d6d1857))
* **compile:** a rig spec can state that its skeleton declares no stage, and diff measures the stage for the first time ([#578](https://github.com/firejune/rigc/issues/578)) ([#599](https://github.com/firejune/rigc/issues/599)) ([ef431e6](https://github.com/firejune/rigc/commit/ef431e68ed955b13fdc7d04766b62174cc04003d))
* **ingest:** decompile a Spine 4.3 skeleton into the two specs that rebuild it, gated by build(ingest(x)) = x ([#569](https://github.com/firejune/rigc/issues/569)) ([#600](https://github.com/firejune/rigc/issues/600)) ([2309130](https://github.com/firejune/rigc/commit/2309130b7b4094f862d17cb4a9bff9fa60d1faa6))
* **render:** render and check pose under a named skin, and the editor round trip measures every skin the build declares ([#571](https://github.com/firejune/rigc/issues/571)) ([#590](https://github.com/firejune/rigc/issues/590)) ([3dcda0c](https://github.com/firejune/rigc/commit/3dcda0c55925bcea38f2ad793af8c4fe615c9319))


### Bug Fixes

* **compile:** a deform run is copied at a raw index, so an odd length and an odd start compile and are emitted verbatim ([#576](https://github.com/firejune/rigc/issues/576)) ([#596](https://github.com/firejune/rigc/issues/596)) ([7fe7f1d](https://github.com/firejune/rigc/commit/7fe7f1d598f8e0a328ceaf011909ab90053d7fc8))
* **compile:** emit a slot no skin fills instead of dropping it, and make A26 check the table in both directions ([#575](https://github.com/firejune/rigc/issues/575)) ([#598](https://github.com/firejune/rigc/issues/598)) ([f5674b6](https://github.com/firejune/rigc/commit/f5674b687a4562f0fb20412221cdb474bc2da418))
* **compile:** refuse an attachment by the construct it is, and derive a mesh's path from its image the way a region does ([#577](https://github.com/firejune/rigc/issues/577)) ([#592](https://github.com/firejune/rigc/issues/592)) ([8d90183](https://github.com/firejune/rigc/commit/8d90183af7b40ddd6a6ee2561b8210b3c90af2c9))
* **release:** the confirmation waits as long as the registry says it may take, and its two outcomes stop printing the same red ([#563](https://github.com/firejune/rigc/issues/563)) ([#588](https://github.com/firejune/rigc/issues/588)) ([fef7609](https://github.com/firejune/rigc/commit/fef76097e066183f009977777aaea58713d59692))
* **validate:** every assertion leaves a row, and a guard on absent data reports SKIP rather than the pass check() records for a bare return ([#568](https://github.com/firejune/rigc/issues/568)) ([#585](https://github.com/firejune/rigc/issues/585)) ([683a4a6](https://github.com/firejune/rigc/commit/683a4a6d0e0af466f1c5125bdbd464c0bcbf870a))
* **validate:** retire A08's name-identity clause, which the renderer it was gated under has never performed ([#574](https://github.com/firejune/rigc/issues/574)) ([#591](https://github.com/firejune/rigc/issues/591)) ([7ca4ee2](https://github.com/firejune/rigc/commit/7ca4ee29f4410161c06c1bd584afc5c01d47632d))

## [0.22.2](https://github.com/firejune/rigc/compare/v0.22.1...v0.22.2) (2026-09-16)


### Bug Fixes

* **compile:** refuse a placeholder the default skin shares with a named skin, because the Spine editor has no way to hold it ([#567](https://github.com/firejune/rigc/issues/567)) ([#572](https://github.com/firejune/rigc/issues/572)) ([a7fd896](https://github.com/firejune/rigc/commit/a7fd8961793ad806127b060a969ed1959c758526))

## [0.22.1](https://github.com/firejune/rigc/compare/v0.22.0...v0.22.1) (2026-09-16)


### Bug Fixes

* **compile:** emit a path's lengths as PathConstraint computes them, transcribed from the runtime rather than sampled toward it ([#560](https://github.com/firejune/rigc/issues/560)) ([#566](https://github.com/firejune/rigc/issues/566)) ([7ffc077](https://github.com/firejune/rigc/commit/7ffc077be54bf2f8477b122f9f17183e1a46b8c1))
* **tools:** the round-trip summary counts constraints from the 4.3 array and refuses an unresolvable images path before the editor starts; the ledgers record what round trip 6 measured ([#561](https://github.com/firejune/rigc/issues/561), [#562](https://github.com/firejune/rigc/issues/562)) ([#564](https://github.com/firejune/rigc/issues/564)) ([28814ed](https://github.com/firejune/rigc/commit/28814ed1f417f3a3754f78c24b78cc04a5324acc))

## [0.22.0](https://github.com/firejune/rigc/compare/v0.21.0...v0.22.0) (2026-09-16)


### Features

* **compile:** name a skin's attachment so the editor can hold it, and emit skins in the order it writes them back ([#541](https://github.com/firejune/rigc/issues/541)) ([#552](https://github.com/firejune/rigc/issues/552)) ([6f8a93b](https://github.com/firejune/rigc/commit/6f8a93b0fe82df9e32e3c6afc6f45d5659ffe811))


### Bug Fixes

* **compile:** measure every skin attachment's art, and refuse two files that would be one region ([#555](https://github.com/firejune/rigc/issues/555)) ([#557](https://github.com/firejune/rigc/issues/557)) ([a47e2a3](https://github.com/firejune/rigc/commit/a47e2a3c9c06ca672d087ef06f0b0158693f9ba3))


### Instrument

* install the package into an empty directory and build a rig from it, on every pull request and after every publish ([#556](https://github.com/firejune/rigc/issues/556)) ([#559](https://github.com/firejune/rigc/issues/559)) ([38e60f2](https://github.com/firejune/rigc/commit/38e60f2c69907946f73349305170f21c79786687))

## [0.21.0](https://github.com/firejune/rigc/compare/v0.20.3...v0.21.0) (2026-09-14)


### Features

* **compile:** emit the order the editor was measured to write, and refuse only what is still unmeasured ([#543](https://github.com/firejune/rigc/issues/543)) ([#551](https://github.com/firejune/rigc/issues/551)) ([d7c7230](https://github.com/firejune/rigc/commit/d7c7230b982dffa17ae7deef9f17f916c4267f16))
* **validate:** A41 names the physics component the Spine editor discards ([#540](https://github.com/firejune/rigc/issues/540)) ([#550](https://github.com/firejune/rigc/issues/550)) ([f9d081e](https://github.com/firejune/rigc/commit/f9d081e193362dd9b04682135d8d3d465a05de75))


### Bug Fixes

* **docs:** ten claims the round trips falsified, corrected where they were written ([#544](https://github.com/firejune/rigc/issues/544)) ([#549](https://github.com/firejune/rigc/issues/549)) ([3f6bcd2](https://github.com/firejune/rigc/commit/3f6bcd280371d54e4a5e7dd643ec2980316688a4))
* **spec:** refuse a rig or motion key nothing reads, by name ([#545](https://github.com/firejune/rigc/issues/545)) ([#546](https://github.com/firejune/rigc/issues/546)) ([0e7881a](https://github.com/firejune/rigc/commit/0e7881aca91eeab0240b0741f3c6ef66ea407f3b))

## [0.20.3](https://github.com/firejune/rigc/compare/v0.20.2...v0.20.3) (2026-09-13)


### Bug Fixes

* emit animations in the order the editor writes them back ([#535](https://github.com/firejune/rigc/issues/535)) ([#537](https://github.com/firejune/rigc/issues/537)) ([9a35ee2](https://github.com/firejune/rigc/commit/9a35ee2f915f21e34d88cbdddad1d47c928ed971))
* refuse the animation names the editor could key differently ([#539](https://github.com/firejune/rigc/issues/539)) ([#542](https://github.com/firejune/rigc/issues/542)) ([eec8806](https://github.com/firejune/rigc/commit/eec880614361a6759a39edf32974bc7b84226206))


### Instrument

* the allowlist is closed under relative import, and the sentence that said nothing checked it ([#527](https://github.com/firejune/rigc/issues/527)) ([#530](https://github.com/firejune/rigc/issues/530)) ([24fecdc](https://github.com/firejune/rigc/commit/24fecdc0afd788f8145393bf00529ba91aacdf69))

## [0.20.2](https://github.com/firejune/rigc/compare/v0.20.1...v0.20.2) (2026-09-13)


### Instrument

* two hand-kept enumerations, derived — and the fact one of them describes ([#520](https://github.com/firejune/rigc/issues/520), [#524](https://github.com/firejune/rigc/issues/524)) ([#525](https://github.com/firejune/rigc/issues/525)) ([5e6ef07](https://github.com/firejune/rigc/commit/5e6ef07260c8e3edeba265a077bfbd1e0f2d8461))

## [0.20.1](https://github.com/firejune/rigc/compare/v0.20.0...v0.20.1) (2026-09-11)

⚠️ **Read the generated section below last.** `release-please` builds it from commit
**type**, so `test:`, `docs:` and `ci:` commits never appear in it. In this release that
is **23 of 24 commits**, and it is all of the work. What follows is the whole cut.

### What this release is about

**The guides an agent authors from stopped saying things the tool contradicts, and the
gates that would have caught them got built.**

`docs/AUTHORING.md` is a first-class deliverable rather than documentation — it and the
validator's messages together are the only interface an agent that cannot see the rig
actually has. It ships in the package. So do `docs/FACE.md`, `docs/INGEST.md` and four
more. This cut changed about 270 lines across three of them, and every change is a
correction rather than an addition.

### What an installer gets that is different

- **Five figures the tool contradicts, and two it never printed at all** (#468). One of
  the two was `26 PASS, 13 SKIP` — rigc prints no tally line, so that was authored
  arithmetic inside a fence, indistinguishable on the page from output. Another was
  `14 excluded`, which could not be checked against any line the tool emits. For those
  the repair was deletion: when nothing holds a number, removing it *is* the fix.
- **A worked script that demonstrated something other than what its prose claimed**
  (#471, #472). `docs/FACE.md` §9.2 read a deform by list position, assuming `i % 5` was
  the column — and a commit had **renumbered the vertex list**, not the triangulation, so
  the script stayed green for a week while showing a different pair. Repaired to read the
  rig by coordinate, it reproduces the documented pair **byte-exactly**, and §9.3 —
  which the same script feeds and which nobody had run — now gives the table's own
  `0.20 / 0.38` instead of `0.33 / 0.61`.
- **A transcript nobody could rerun, now saying what it is** (#441), and **two blocks a
  reader could not otherwise check, now stating the command that produces them** (#485).
- **Three counts in the measure register that do not close** (#490), each retired for a
  different reason: one measurable but unreachable by any criterion (nine were tried),
  one not re-measurable at all because the re-read was never written to disk, and one
  derivable off the table printed directly above it. ⚠️ The third was wrong twice — the
  count *and* the characterisation. Five rigs read short, not four, and **none of the
  five is a size disagreement**: the smaller rig's sizes are wholly contained in the
  larger's, so what the shortfall names is a region one rig has and the other has not.
- **A count in a `src/diff.ts` comment** that nothing derived, struck rather than
  refreshed.

### The gap that hid all of it

`docs` is the one hidden commit type that **still changes the package**. Seven guides
ship, so a correction to one of them changes what the registry serves under a type the
release machinery is told to ignore — and 23 commits accumulated with no release opening.
⛔ Un-hiding `docs` is not the repair: most of `docs/` does not ship, so every note to a
working document would open a release pull request and the type would stop meaning
anything. `RELEASING.md` now records what to do instead — **read what changed in the
`files` allowlist, not the commit types** — and a check that reads the same array
`npm pack --dry-run` reads is filed.

### Why you can trust the above: 577 → 593 controls

None of this ships, and it is the reason the shipped half is now checkable.

- **Gates over what the tree says about itself.** A doc-script suite that runs the
  scripts a page states (#477); a docs-transcript suite over what `docs/` quotes the tool
  as printing, with its coverage published beside it — verified, declared, unreachable
  and sealed, each with its reason (#468); a third anchor rule reaching fences that open
  on a section rule, whose first catch is the very block a hand pass had repaired (#489);
  and a control refusing a line-number citation anywhere in the tree, after nine stood in
  one file and **eight were wrong** (#487).
- **Details that stop lying on the run they exist for.** A control whose verdict is a
  conjunction of terms its detail does not read prints a clean sentence under a FAIL.
  Twenty-five sites repaired across four tranches, each measured before conversion and
  seven candidates correctly left alone. The helper that makes the shape hard to write is
  itself gated, because nothing else could see it break: with its guard removed the whole
  file runs **green**.
- **Plants tested by the fault they raise** rather than by the tree being quiet (#491).
  Fourteen red-first clauses asked whether *anything* faulted; a fault standing anywhere
  else satisfied them, so each stopped testing its plant on exactly the run it exists for.
- **A comparison form that cannot be written unmarked** (#506). Two sweeps found the same
  defect by matching on what a clause looks like and both under-counted, so the answer was
  not to find every site but to make the bare form a **type error**.

### The mistake in this cut, and its repair

One landing **silently reverted an earlier one** — three controls and two repairs
disappeared and the run stayed green, because a derived tally reports the smaller number
just as honestly as the larger. It was found three landings later. ⇒ CI now refuses a
change that removes a control without naming it, with the permission travelling in the
same diff so no allow-list exists; replayed over history it refuses the landing that
removed three and accepts the one that removed one and said so.


### Bug Fixes

* ship the guide corrections that landed under a type the release machinery hides ([#515](https://github.com/firejune/rigc/issues/515)) ([ae29869](https://github.com/firejune/rigc/commit/ae29869051b21ff9b02b58524e077cdca16cf019))

## [0.20.0](https://github.com/firejune/rigc/compare/v0.19.0...v0.20.0) (2026-09-10)

⚠️ **Read the two generated sections below last.** `release-please` builds them from
commit **type**, so `test:` and `docs:` commits never appear in them. In this release
that is **nine of fourteen commits**, and it is where most of the work is. What follows
is the whole cut.

### What this release is about

Two things that turn out to be one: **the tool learned to say what it is not measuring,
and the repository stopped making claims about itself that nothing derives.**

**The depth report says what the sheet is *not*** (#448, #449). `sampleMeshDepth` refused
a sheet that did not cover the mesh — but the check sat behind *"does this sheet have a
transparent texel anywhere"*, so a **full-frame opaque render skipped it entirely**, which
is exactly what monocular depth estimation produces. The same defect was a named refusal
in one encoding and a green build in the other; the counts from both sides agree at **56
of 81** on the fixture that proves it. It now **reports rather than refuses** — a
full-frame sheet is a legitimate statement and rigc has no authority to guess an input
away — and what it adds is a measurement: how many of a mesh's vertices sample a texel the
part image does not draw.

**`stepShare` separates a form from a discontinuity.** A form's share halves under lattice
refinement while its ceiling converges; a cliff pins its share and halves its **ceiling**
instead, because there is no slope to converge to. Measured on synthetic sheets: form
0.358 → 0.100 with the angle steady, cliff 0.460 → 0.497 with the angle falling by half
each time. No threshold anywhere — the number is reported so an author can see which kind
of thing the ceiling read.

**A line came back from the dead** (#440). Giving the disputed dial the breadcrumb its
neighbours have exposed that the rollup identity was a literal at three sites, one of them
with a different separator — so `N span(s) between consecutive keys scanned` had printed
on **no rig at all** since #418. That line exists so *"the scan ran and found nothing"*
cannot be read as *"the scan never ran"*, and it had silently become the second.

**The run counts itself** (#439, #451, #453). The selftest's summary used to restate every
suite's size by hand. Wrapping the calls put a number on the drift for the first time:
**18 of 47 floor increments were wrong, the summed floor stood at 435 against a run of
551, and one suite had never been counted at all** — a floor 116 cases below the truth
being the only thing between a vacuous run and a green one. Every figure is read off the
lines each suite prints now, and **no hand-written number is left anywhere the summary
reads from**, which made buildable a check twice rejected as unbuildable: a numeric
constant whose only reader is the summary is refused by name. ⇒ **Adding a control needs
no summary edit**, measured twice on the day it landed by two independent changes.

**Two silences in the toolchain, closed** (#457, #465). A `.gitignore` entry ending in a
slash covers **one of the four things a path can be** — a symlink, a file and an absent
path all slip past — and three paths here had already turned out to be symlinks, showing
as untracked in a public tree. All 31 entries are slashless, and `CUR10` plants each path
in a throwaway repository as a directory, as a symlink and as a file and asks git each
time. Separately, two raw NUL bytes made `cli.ts` binary to the grep an agent has, so a
search over the file that owns the report text matched nothing, silently, with the same
exit code as an absence — it had already produced a wrong conclusion.

**Doctrine** (#445, #446, #447). **rigc compiles an object; the scene belongs to the
consumer.** The code had never crossed that line and the prose had — including a caption
claiming "scene direction" over a film whose own text states the boundary correctly and
measures it at **0 differing pixels across every hand-off**. The honest claim is the
stronger one: the rig guarantees the seams, and the composing is the consumer's.
[ROADMAP.md](https://github.com/firejune/rigc/blob/main/ROADMAP.md) is new.

The selftest carries **577** named controls at this tag.

### In this release but not in the sections below

| | |
| --- | --- |
| [#450](https://github.com/firejune/rigc/pull/450) | `test:` the run counts itself, and the floor is one per suite |
| [#452](https://github.com/firejune/rigc/pull/452) | `test:` the last figures come off the run, and a typed one is refused |
| [#462](https://github.com/firejune/rigc/pull/462) | `test:` a suite stated in halves, and no figure left in a constant |
| [#446](https://github.com/firejune/rigc/pull/446) | `docs:` rigc compiles an object, and the scene belongs to the consumer |
| [#447](https://github.com/firejune/rigc/pull/447) | `docs:` a rough roadmap to 1.0, and the road so far |
| [#454](https://github.com/firejune/rigc/pull/454) | `docs:` one fact spelled once, and the marker the reader can see |
| [#459](https://github.com/firejune/rigc/pull/459) | `docs:` the rig guarantees the seams, and the composing is the consumer's |
| [#460](https://github.com/firejune/rigc/pull/460) | `docs:` the doctrine that governs the product governs the work too |
| [#461](https://github.com/firejune/rigc/pull/461) | `docs:` what settles a thing, rather than who owns it |
| [#469](https://github.com/firejune/rigc/pull/469) | `docs:` two claims the tree contradicts, corrected against a run |


### Features

* **depth:** what the sheet is not, and whether the ceiling read a form ([#455](https://github.com/firejune/rigc/issues/455)) ([dfcd808](https://github.com/firejune/rigc/commit/dfcd80854670c10b29b55c2c4e7abb1e44fcb98a))
* **explain:** the disputed dial names its counter, and the scan line prints again ([#467](https://github.com/firejune/rigc/issues/467)) ([a42e9cf](https://github.com/firejune/rigc/commit/a42e9cfad10c8b67ba1f195883b78b2e9c16c7ac))


### Bug Fixes

* a file that reads as text stays readable by a text tool ([#466](https://github.com/firejune/rigc/issues/466)) ([da45092](https://github.com/firejune/rigc/commit/da450929b2c139b3144706b79d3dd647c84cf699))
* an ignore line hides its path whatever that path turns out to be ([#463](https://github.com/firejune/rigc/issues/463)) ([26dd39d](https://github.com/firejune/rigc/commit/26dd39d6c422bf077db75056833169fc5680332b))

## [0.19.0](https://github.com/firejune/rigc/compare/v0.18.1...v0.19.0) (2026-09-06)


### Features

* **docs:** the producible set of every slider reader, measured one at a time ([#435](https://github.com/firejune/rigc/issues/435)) ([a13be1b](https://github.com/firejune/rigc/commit/a13be1b285f009527c425377a06cf61f513ccdc9)), closes [#420](https://github.com/firejune/rigc/issues/420)
* **validate:** a build sees a dial whose two answers disagree, and what each reaches ([#438](https://github.com/firejune/rigc/issues/438)) ([5340c52](https://github.com/firejune/rigc/commit/5340c526851c3334c6c515696dab876052336f01)), closes [#427](https://github.com/firejune/rigc/issues/427)


### Bug Fixes

* **compile:** the dead width of a range is a width, not the reach to its far end ([#436](https://github.com/firejune/rigc/issues/436)) ([52c9e14](https://github.com/firejune/rigc/commit/52c9e146361b8f789a492adeca3456b252fef2e0)), closes [#434](https://github.com/firejune/rigc/issues/434)
* **compile:** the wrap refusal computes its consequence instead of asserting one ([#430](https://github.com/firejune/rigc/issues/430)) ([60e3774](https://github.com/firejune/rigc/commit/60e37741756d6c1580d4412a33e2e845ae0a85e3))
* **compile:** the wrap refusal reads the bone by modulo, not by one subtraction ([#433](https://github.com/firejune/rigc/issues/433)) ([2204146](https://github.com/firejune/rigc/commit/2204146414903786227d716eb74d7484fd3ffcd9)), closes [#431](https://github.com/firejune/rigc/issues/431)

## [0.18.1](https://github.com/firejune/rigc/compare/v0.18.0...v0.18.1) (2026-09-05)


### Bug Fixes

* **compile:** the slider wrap guard tests both ends, and the line is past 360 ([#424](https://github.com/firejune/rigc/issues/424)) ([cc3a391](https://github.com/firejune/rigc/commit/cc3a39171a3c786b18c70a82645034b62358d348))
* **deformmeasure:** the artifact names the dial's property, the probe drives it, and the two are checked against each other ([#426](https://github.com/firejune/rigc/issues/426)) ([da8971d](https://github.com/firejune/rigc/commit/da8971d4ef0eacf2d8cbf949502ad07a96416001))

## [0.18.0](https://github.com/firejune/rigc/compare/v0.17.0...v0.18.0) (2026-09-05)


### Features

* **deform:** a transform key over a multi-bone attachment, pushed into each bind space ([#413](https://github.com/firejune/rigc/issues/413)) ([7eb0a32](https://github.com/firejune/rigc/commit/7eb0a32af271d3190fd32228e27c7b83f77ae575))
* **depth:** the turn ceiling says whether it is describing the form or the sheet's grain ([#416](https://github.com/firejune/rigc/issues/416)) ([f1d6a67](https://github.com/firejune/rigc/commit/f1d6a677347505ab2e7aa14cb47bdf6eb87d3d48))
* **gallery:** look — a face whose angle is a value, not a time ([#408](https://github.com/firejune/rigc/issues/408)) ([c2a79d6](https://github.com/firejune/rigc/commit/c2a79d683bc1ab03f53a9acdda21e143c0c2101d))
* **motion:** the animator's words, mapped to the constructs that carry them ([#397](https://github.com/firejune/rigc/issues/397)) ([2ae784f](https://github.com/firejune/rigc/commit/2ae784f8e406e24a67ce487fde354ca22e80a48d))
* **tools:** the editor round trip, promoted out of a scratch shell script ([#396](https://github.com/firejune/rigc/issues/396)) ([19266b5](https://github.com/firejune/rigc/commit/19266b54b03a54a5ab96e79aecb29c8c6b793155))
* **validate:** A40 — two sliders on one target, and the yaw axis that dies at 0° ([#405](https://github.com/firejune/rigc/issues/405)) ([a546b20](https://github.com/firejune/rigc/commit/a546b209fc5ce236684fdea4e67d516786b66a78))


### Bug Fixes

* **tools:** the round trip refuses the Spine trial by name, and says what it can still do ([#414](https://github.com/firejune/rigc/issues/414)) ([7467c1e](https://github.com/firejune/rigc/commit/7467c1e31e1a2ed14cea148f924a6802541800be))
* two claims the repository makes about itself, neither of them derived ([#394](https://github.com/firejune/rigc/issues/394)) ([e43aca9](https://github.com/firejune/rigc/commit/e43aca983a7e5623e97efbd7b3ba5d2d38faefc0))
* **validate:** a triangle that draws no pixels cannot draw them backwards ([#404](https://github.com/firejune/rigc/issues/404)) ([554bfbe](https://github.com/firejune/rigc/commit/554bfbe2c29388b0b74bb1e58187d83f6f899a6f))
* **validate:** A39 poses a slider-applied animation at the slider's own mapping ([#418](https://github.com/firejune/rigc/issues/418)) ([ae6be2a](https://github.com/firejune/rigc/commit/ae6be2a9c4526b4a141f73354b0e44335967891f))
* **validate:** A39 scans the span between keys, in closed form ([#409](https://github.com/firejune/rigc/issues/409)) ([7ebebc9](https://github.com/firejune/rigc/commit/7ebebc974f7429c74872436165a3037b06b2a42d))

## [0.17.0](https://github.com/firejune/rigc/compare/v0.16.0...v0.17.0) (2026-09-05)

**A part can state its own depth, and rigc will tell you how far it turns.**

Until now a 2.5D turn read one radius shared by a whole column of vertices — a
cylinder standing in for a surface. A generator can now name a **depth map**, and
`yaw`/`pitch` read a `z` per vertex off it. The lattice that carries those
vertices is **generated** rather than hand-numbered. A **painted mask** says
which region is soft, so a `physics` constraint answers an impact over exactly
that area. And `build` and `explain` now print the **turn ceiling**: the largest
angle this geometry on this sheet takes before a triangle reverses, per axis and
per direction, naming the triangle that goes first.

That last one changes the loop. The angle was previously found by writing a key,
building, reading `A39`'s refusal and guessing again; it is closed form —
`tan t = A₀/A_axis` — and the compiler now says it up front.

### Features

* **deform:** a depth map gives every vertex its own z, and yaw/pitch read it ([#383](https://github.com/firejune/rigc/issues/383)) ([e0371e8](https://github.com/firejune/rigc/commit/e0371e899feb279dd46c8348ddaa74845bdb62d0)), closes [#382](https://github.com/firejune/rigc/issues/382)
* **mesh:** a `grid` generator, so the lattice stops being hand-numbered ([#386](https://github.com/firejune/rigc/issues/386)) ([b0ec75a](https://github.com/firejune/rigc/commit/b0ec75a8e24cbf2f11754874fa498a79846e5574)), closes [#382](https://github.com/firejune/rigc/issues/382)
* **depth:** a painted mask marks a soft region, and a physics constraint on its bone answers an impact over it ([#390](https://github.com/firejune/rigc/issues/390), [#391](https://github.com/firejune/rigc/issues/391)) ([843aad4](https://github.com/firejune/rigc/commit/843aad49fd44d54a0b000851df9301ea4955ac08))
* **depth:** report the turn a sheet supports, before a key is written ([#393](https://github.com/firejune/rigc/issues/393)) ([cc79286](https://github.com/firejune/rigc/commit/cc7928635673795e98c1089f83fa8e35543555a0))
* **docs:** `FACE.md` §2.2 and `AUTHORING.md` §3.4 — the fold angle belongs to the depth map's steepest slope, not to the mesh density ([#392](https://github.com/firejune/rigc/issues/392)) ([e409077](https://github.com/firejune/rigc/commit/e409077))

### The one rule to read before using any of it

**The angle a part can turn through is a property of its depth map, not of how
finely it is meshed** — approximately `1 / max|dz/du|`, the reciprocal of the
sheet's steepest slope. Refining a lattice does not lower the ceiling; it finds
slopes that were always there. A map that reaches its floor with a *vertical*
edge — a dome, a hemisphere, anything traced straight off a rendered normal —
folds at any angle you like once it is meshed finely enough, while a map whose
slope is bounded holds the same angle at every density. Measured over a 1,300×
range of vertex counts: 62° → 14° for the first, a steady 63–64° for the second.

So a ceiling you cannot live with is fixed by editing the **sheet**, not the
mesh. rigc will not flatten a map for you; a depth map is a measurement, and the
compiler never invents a value that is not in the spec.

### What this release does not do

* **None of it has met real art.** Every figure quoted for the depth work was
  measured on generated fixtures — analytic ramps, domes and checkerboard blobs.
* **The angle and the jiggle cannot ride one attachment yet.** A mesh carried by
  a soft-region bone has two influences on some vertices, and a `transform` key
  needs one bind space, so per part it is one or the other
  ([#389](https://github.com/firejune/rigc/issues/389)).
* **A dense mesh is a large file.** 449 bytes per vertex, plus ~1.77 MB per
  deform key at 32,761 vertices. The gate itself stays linear and green to
  64,800 triangles; the artifact is what grows.

### Bug Fixes

* ignore scratch as a path, not only as a directory ([#385](https://github.com/firejune/rigc/issues/385)) ([87bb21f](https://github.com/firejune/rigc/commit/87bb21febd6ce80086d34e97ac0413abc093f771)) — repository housekeeping, no effect on the published package

### Withdrawn inside this release

Two commits in the log add things that **do not exist in 0.17.0**. They were
built and taken back out before release, and are listed here only so a reader of
the commit history is not left looking for them:

* `parallax` as a deform kind ([#388](https://github.com/firejune/rigc/issues/388), removed in [#391](https://github.com/firejune/rigc/issues/391)) — it was a `yaw` with a term dropped, and baking a pointer-driven value into time keys is a category error. Parallax is camera work and belongs to whatever draws the result.
* a soft region chosen by a **depth threshold** ([#390](https://github.com/firejune/rigc/issues/390), replaced in [#391](https://github.com/firejune/rigc/issues/391)) — softness is not prominence. The most prominent thing on a face is the nose, and a nose does not wobble. The region is painted now.

## [0.16.0](https://github.com/firejune/rigc/compare/v0.15.0...v0.16.0) (2026-09-04)


### Features

* **compile:** a curve on a hold segment is emitted stepped, as the editor writes it ([#376](https://github.com/firejune/rigc/issues/376)) ([04d6f27](https://github.com/firejune/rigc/commit/04d6f27e0341cae6fc14da86739b251280e63e37))
* **compile:** derive a mesh's hull and edges from its triangles and its size from the PNG ([#375](https://github.com/firejune/rigc/issues/375)) ([c62a432](https://github.com/firejune/rigc/commit/c62a432ac6ba9bd11ec28c79a6e9b43e6635db90))
* **emit:** write skeleton.images so the editor finds the parts on import ([#378](https://github.com/firejune/rigc/issues/378)) ([dc16bf1](https://github.com/firejune/rigc/commit/dc16bf12c65bd38434ee03bd332310c6512b77cc))
* **skills:** package the authoring guides as an installable agent plugin ([#371](https://github.com/firejune/rigc/issues/371)) ([9030d5d](https://github.com/firejune/rigc/commit/9030d5d30c93b90cf6502d8aef0d012d9b453412))

## [0.15.0](https://github.com/firejune/rigc/compare/v0.14.1...v0.15.0) (2026-09-03)


### Features

* **gallery:** nod, a sixth example where each mesh is built for the model that bends it ([#353](https://github.com/firejune/rigc/issues/353)) ([fc82e5c](https://github.com/firejune/rigc/commit/fc82e5c12ccb4992205520d786b88b66cea3d93a)), closes [#343](https://github.com/firejune/rigc/issues/343)
* **pack:** a pack gates under spine-html, spilled pages shrink, and PK05's last bit is attributed ([#354](https://github.com/firejune/rigc/issues/354)) ([1168b78](https://github.com/firejune/rigc/commit/1168b78c687128275cf0c157df4094fa9495a643)), closes [#266](https://github.com/firejune/rigc/issues/266)


### Bug Fixes

* **compile:** refuse a deform transform whose evaluation is an all-zero run ([#355](https://github.com/firejune/rigc/issues/355)) ([717888a](https://github.com/firejune/rigc/commit/717888ad5240869b3e9456a35d0b1801561eda07)), closes [#350](https://github.com/firejune/rigc/issues/350)
* **gallery:** loop_seam refuses a reading whose last frame is not at the duration ([#346](https://github.com/firejune/rigc/issues/346)) ([928b91f](https://github.com/firejune/rigc/commit/928b91ff8f7ae0a762ce27cae1b5ec7b402ebd64)), closes [#337](https://github.com/firejune/rigc/issues/337)

## [0.14.1](https://github.com/firejune/rigc/compare/v0.14.0...v0.14.1) (2026-09-03)


### Bug Fixes

* **ci:** fetch-examples absorbs connection blips with a bounded retry ([#341](https://github.com/firejune/rigc/issues/341)) ([5ebb47e](https://github.com/firejune/rigc/commit/5ebb47e7528eab1d24180f59397c39e9e3fec7c9)), closes [#335](https://github.com/firejune/rigc/issues/335)
* **cli:** register --all-bones as the boolean flag it is documented as ([#338](https://github.com/firejune/rigc/issues/338)) ([6cde010](https://github.com/firejune/rigc/commit/6cde010d0536af50454143a4113d77de628759c5)), closes [#328](https://github.com/firejune/rigc/issues/328)


### Instrument

* **chainfit:** the inward step — two anchored descendants determine the bone between them ([#331](https://github.com/firejune/rigc/issues/331)) ([e0f61a0](https://github.com/firejune/rigc/commit/e0f61a091fd09d340d53db7b96fe1cc4930f4851)), closes [#326](https://github.com/firejune/rigc/issues/326)

## [0.14.0](https://github.com/firejune/rigc/compare/v0.13.0...v0.14.0) (2026-09-03)


### Features

* **motion:** a deform key can state its transform instead of its table ([#317](https://github.com/firejune/rigc/issues/317)) ([3c13d7e](https://github.com/firejune/rigc/commit/3c13d7eef8ba4909f631453d61a363e6b1b3dd01)), closes [#294](https://github.com/firejune/rigc/issues/294)
* **motion:** a group track can key a value per member, stated or derived ([#320](https://github.com/firejune/rigc/issues/320)) ([1313b20](https://github.com/firejune/rigc/commit/1313b20189ed06f62ff4a8c9b6441e227afbc466)), closes [#295](https://github.com/firejune/rigc/issues/295)


### Bug Fixes

* **compile:** the motion spec is parsed rather than cast ([#321](https://github.com/firejune/rigc/issues/321)) ([3e7238a](https://github.com/firejune/rigc/commit/3e7238a30886633f1a7e328c84d3e3109c6384d2)), closes [#307](https://github.com/firejune/rigc/issues/307)
* **gallery:** flex's leaf no longer folds, and its exemption is gone ([#318](https://github.com/firejune/rigc/issues/318)) ([fed3ba5](https://github.com/firejune/rigc/commit/fed3ba5bb79380a9b392cf07dc8c809b9bed6f71)), closes [#313](https://github.com/firejune/rigc/issues/313)
* **pose:** the objective interpolates premultiplied, with a stated re-baseline ([#322](https://github.com/firejune/rigc/issues/322)) ([6c00c51](https://github.com/firejune/rigc/commit/6c00c51d720ace9707a67685c2767ce79c50af5f)), closes [#306](https://github.com/firejune/rigc/issues/306)


### Instrument

* **explain:** a per-key DEFORM block, so a deform key's ratios are printed rather than derived ([#319](https://github.com/firejune/rigc/issues/319)) ([aa31aae](https://github.com/firejune/rigc/commit/aa31aae60547d1b6fedb4e83bf37587b634e2f23))
* **validate:** A39_DEFORM_KEEPS_TRIANGLE_WINDING — a deform key may not turn a triangle inside out ([#314](https://github.com/firejune/rigc/issues/314)) ([eec1e60](https://github.com/firejune/rigc/commit/eec1e602056e6e6ae82048ab4304018a35d2fa5f)), closes [#296](https://github.com/firejune/rigc/issues/296)

## [0.13.0](https://github.com/firejune/rigc/compare/v0.12.0...v0.13.0) (2026-09-03)


### Features

* **gallery:** portrait — a 2.5D head turn built from authored deform keys ([#297](https://github.com/firejune/rigc/issues/297)) ([6697308](https://github.com/firejune/rigc/commit/669730845fe623bdb1ccb60b052f982be15f8ec2))


### Bug Fixes

* **compile:** refuse a `setup` entry that is not an object, by name ([#303](https://github.com/firejune/rigc/issues/303)) ([cc53b55](https://github.com/firejune/rigc/commit/cc53b55a37df714cd3774cceb37280190c294199)), closes [#293](https://github.com/firejune/rigc/issues/293)
* **pkg:** ship docs/FACE.md in the npm package ([#302](https://github.com/firejune/rigc/issues/302)) ([fc9f13f](https://github.com/firejune/rigc/commit/fc9f13fa25287e7d3740f143416c3e4fcdcb700a))
* **render:** interpolate premultiplied so a region edge draws no dark rim ([#301](https://github.com/firejune/rigc/issues/301)) ([c7dfe81](https://github.com/firejune/rigc/commit/c7dfe8196c8214e86c05242ac22a7953b4b1b41b)), closes [#292](https://github.com/firejune/rigc/issues/292)

## [0.12.0](https://github.com/firejune/rigc/compare/v0.11.0...v0.12.0) (2026-09-03)


### Features

* **cli:** rigc chainfit — occlusion-aware chain fitting ([#290](https://github.com/firejune/rigc/issues/290)) ([d488154](https://github.com/firejune/rigc/commit/d4881548affd969669a65a106bcb13938cdb7712))


### Bug Fixes

* **chainfit:** the relocation fallback keeps the seed instead of resetting the hinge ([#287](https://github.com/firejune/rigc/issues/287)) ([5d00e4f](https://github.com/firejune/rigc/commit/5d00e4f3f9e5268ce5e24cf27721ac877a132939))

## [0.11.0](https://github.com/firejune/rigc/compare/v0.10.0...v0.11.0) (2026-09-02)


### Features

* **gallery:** ride and flex — a path constraint carries a rider, and a contour mesh is the art ([#276](https://github.com/firejune/rigc/issues/276)) ([be484e1](https://github.com/firejune/rigc/commit/be484e1f0ddbdc0b0e0ea2147fc2def9ead51e23))


### Bug Fixes

* four gallery dogfood findings in the compiler and the mesh report ([#280](https://github.com/firejune/rigc/issues/280)) ([101ab83](https://github.com/firejune/rigc/commit/101ab83b572507c7438223dbbd4c43b6571e7112))
* **render:** correct the Quad corner-order comment (bl, ul, ur, br) ([#283](https://github.com/firejune/rigc/issues/283)) ([3afb7d8](https://github.com/firejune/rigc/commit/3afb7d8b98ee254f4bacb34f77550ba0212d8547))

## [0.10.0](https://github.com/firejune/rigc/compare/v0.9.0...v0.10.0) (2026-09-02)


### Features

* **bench:** three reported instruments — mesh edges, key density, stage-3 pose distance ([#269](https://github.com/firejune/rigc/issues/269)) ([02b838e](https://github.com/firejune/rigc/commit/02b838e3efdd2cf9d0bb8eda981edde4118c092f))
* **emitter:** atlas packer and importer — parts onto shared pages, and a pack as an input ([#263](https://github.com/firejune/rigc/issues/263)) ([28bf37f](https://github.com/firejune/rigc/commit/28bf37ff8034d56c46296efcfb562f4c8569638f))


### Bug Fixes

* **emitter:** the two INGEST findings — an imported page's scale:, and A35's deform-run parity ([#272](https://github.com/firejune/rigc/issues/272)) ([a89a450](https://github.com/firejune/rigc/commit/a89a4507048e1d3f347efe352d368a1469e69596))

## [0.9.0](https://github.com/firejune/rigc/compare/v0.8.1...v0.9.0) (2026-09-02)


### Features

* **emitter:** contour mesh generator — trace a part's own alpha and triangulate it ([#251](https://github.com/firejune/rigc/issues/251)) ([3127d13](https://github.com/firejune/rigc/commit/3127d13d9dee8857c8def405fd908eac3f76c5ee)), closes [#6](https://github.com/firejune/rigc/issues/6) [#1](https://github.com/firejune/rigc/issues/1)
* **rig:** path and slider constraints, path attachments, and per-skin member lists ([#253](https://github.com/firejune/rigc/issues/253)) ([cb7376f](https://github.com/firejune/rigc/commit/cb7376fd9e2ac1569f2a775119d02fd4a9a22a06))


### Bug Fixes

* **check:** attribute the texture floor, substitute texture only, and stop the extent test punishing a silhouette ([#254](https://github.com/firejune/rigc/issues/254)) ([ad7aec4](https://github.com/firejune/rigc/commit/ad7aec4248b8c73412e605336ed98a0a8a8c2e86))

## [0.8.1](https://github.com/firejune/rigc/compare/v0.8.0...v0.8.1) (2026-09-02)


### Bug Fixes

* **packaging:** ship the remaining tools/ files (contact, png_probe, measure_contact_depth) ([#249](https://github.com/firejune/rigc/issues/249)) ([cc00c99](https://github.com/firejune/rigc/commit/cc00c996ec633e168f56f0158ae467246fc82d84))

## [0.8.0](https://github.com/firejune/rigc/compare/v0.7.0...v0.8.0) (2026-09-02)


### Features

* **cli:** rigc pose — read each part's rigid placement out of a pose frame ([#243](https://github.com/firejune/rigc/issues/243)) ([1a10489](https://github.com/firejune/rigc/commit/1a104894b42e485dbdcbe35fc4566945ca264a81)), closes [#241](https://github.com/firejune/rigc/issues/241)

## [0.7.0](https://github.com/firejune/rigc/compare/v0.6.0...v0.7.0) (2026-08-29)


### Features

* **cli:** rigc vote — the A/B ballot and its append-only vote ledger ([#232](https://github.com/firejune/rigc/issues/232)) ([126fe8f](https://github.com/firejune/rigc/commit/126fe8ff4fb73c4cd89635693cb0a8889c7417e3))
* **emitter:** key IK, transform and deform timelines from the motion spec ([#233](https://github.com/firejune/rigc/issues/233)) ([da7366e](https://github.com/firejune/rigc/commit/da7366e8f9632e6d4c80ca11b76b23f16e024336)), closes [#87](https://github.com/firejune/rigc/issues/87) [#88](https://github.com/firejune/rigc/issues/88) [#89](https://github.com/firejune/rigc/issues/89)


### Bug Fixes

* **deps:** refresh bun.lock to match package.json typescript range ([#237](https://github.com/firejune/rigc/issues/237)) ([565666c](https://github.com/firejune/rigc/commit/565666cddae00dc5cb25a60e639463bfb7bccf46))

## [0.6.0](https://github.com/firejune/rigc/compare/v0.5.0...v0.6.0) (2026-08-29)


### Features

* **cli:** add --copy-images to make build --out self-contained ([#224](https://github.com/firejune/rigc/issues/224)) ([efeda1a](https://github.com/firejune/rigc/commit/efeda1a04b8240e493d6609c2377480cc0e3b28e)), closes [#217](https://github.com/firejune/rigc/issues/217)
* **cli:** default --profile is now spine ([#231](https://github.com/firejune/rigc/issues/231)) ([b430413](https://github.com/firejune/rigc/commit/b430413e23c5b61f81d299c4ab6f92d831222fda)), closes [#221](https://github.com/firejune/rigc/issues/221)
* **cli:** ergonomics batch, and name the file behind an error ([#227](https://github.com/firejune/rigc/issues/227)) ([d3e8966](https://github.com/firejune/rigc/commit/d3e89662cf09bd634a0666eb5f3c02416d582ef7)), closes [#218](https://github.com/firejune/rigc/issues/218) [#219](https://github.com/firejune/rigc/issues/219)
* **cli:** rigc render and rigc preview — a user-facing way to see the rig ([#230](https://github.com/firejune/rigc/issues/230)) ([79ab6b3](https://github.com/firejune/rigc/commit/79ab6b3f9cb2d18934d480dadb9d363ab123a3f9))


### Bug Fixes

* **cli:** explain the Bun requirement at the point of failure ([#228](https://github.com/firejune/rigc/issues/228)) ([5a194b2](https://github.com/firejune/rigc/commit/5a194b21fc920a7b7147e649f1b62d2b0912567b)), closes [#220](https://github.com/firejune/rigc/issues/220)
* **validate:** A19 accepts PNGs whose transparency lives in tRNS ([#223](https://github.com/firejune/rigc/issues/223)) ([5083c5b](https://github.com/firejune/rigc/commit/5083c5bf9090378e0c28f961736eefbc047715cb)), closes [#215](https://github.com/firejune/rigc/issues/215)

## [0.5.0](https://github.com/firejune/rigc/compare/v0.4.0...v0.5.0) (2026-08-28)


### Features

* **ladder:** the ladder is complete — spineboy clears the graduation exam ([#209](https://github.com/firejune/rigc/issues/209)) ([32b9753](https://github.com/firejune/rigc/commit/32b97534f74c8b1565cf8452e1aa0800151e0d3b))

## [0.4.0](https://github.com/firejune/rigc/compare/v0.3.0...v0.4.0) (2026-08-26)


### Features

* **bench:** rung 1 re-authored — the frame-change clause clears on both rates ([#172](https://github.com/firejune/rigc/issues/172)) ([ae610bf](https://github.com/firejune/rigc/commit/ae610bfdeaf1e18a352c6d183a1ab69df393c2a2))
* **bench:** rung 3 re-authored — the frame-change clause clears on both shots ([#170](https://github.com/firejune/rigc/issues/170)) ([71d81de](https://github.com/firejune/rigc/commit/71d81de812263560a10664724512a95fbae02628))
* **bench:** rung 4 re-authored from brief revision 3 — the sheet clause clears on all three shots ([#175](https://github.com/firejune/rigc/issues/175)) ([c32c824](https://github.com/firejune/rigc/commit/c32c82400566b36c745818a1a5ef9ccf223c3705))
* **bench:** rung 5 re-authored from brief revision 3 — the frame-change clause clears on both shots ([#173](https://github.com/firejune/rigc/issues/173)) ([e3a9d15](https://github.com/firejune/rigc/commit/e3a9d15adc264d191073f1953d7e9a7521af80e3))
* **bench:** rung 7's local-only render exception, and its first brief ([#168](https://github.com/firejune/rigc/issues/168)) ([c70fba7](https://github.com/firejune/rigc/commit/c70fba7177aa23498294c67e408cb3b3d0dde051))


### Bug Fixes

* **bench:** make the stored rung-5 atlas loadable from a clone ([#183](https://github.com/firejune/rigc/issues/183)) ([efb6f3f](https://github.com/firejune/rigc/commit/efb6f3f5d42b4bdf1b7e10b056254ef2db2ba5b4)), closes [#181](https://github.com/firejune/rigc/issues/181)
* **release:** give the check: commit type a changelog section ([#182](https://github.com/firejune/rigc/issues/182)) ([2a865bb](https://github.com/firejune/rigc/commit/2a865bbd90bc4068fe149b630d608f44861b2487)), closes [#163](https://github.com/firejune/rigc/issues/163)


### Instrument

* the three instrument fixes — an MAE-refined framing pass, contact sheets, and blobs that are not parts ([#159](https://github.com/firejune/rigc/issues/159)) ([d850a4e](https://github.com/firejune/rigc/commit/d850a4ed82090fc61f06b464d7c26bff2c542a80))

## [0.3.0](https://github.com/firejune/rigc/compare/v0.2.1...v0.3.0) (2026-08-24)


### Features

* **attachments:** emit bounding box and clipping attachments ([#86](https://github.com/firejune/rigc/issues/86)) ([0437320](https://github.com/firejune/rigc/commit/0437320f6c73d85ed9f0b257bca59defcfb0b033))
* **bench:** author the spineboy ess rung, third attempt ([#136](https://github.com/firejune/rigc/issues/136)) ([53acfe7](https://github.com/firejune/rigc/commit/53acfe725e02faba041f5eb3a1a7f4ed3be74e62))
* **check:** attribute drift and MAE to the candidate's own bone chains ([#130](https://github.com/firejune/rigc/issues/130)) ([7c6e318](https://github.com/firejune/rigc/commit/7c6e318f6b4eaa1cc7f58fbce8307fb90f25187a))
* **check:** report the MAE over the reference's own pixels, and warn on overdraw ([#125](https://github.com/firejune/rigc/issues/125)) ([83fa2cd](https://github.com/firejune/rigc/commit/83fa2cd63ad8426e63e01fd1c314ae62243b567f))
* **events:** declare events in the rig spec and fire them from the motion spec ([#84](https://github.com/firejune/rigc/issues/84)) ([ee11b34](https://github.com/firejune/rigc/commit/ee11b346b8765415ae82c3d47cb1c7c4299e2113))
* **viewer:** play a bench run beside its reference frames ([#129](https://github.com/firejune/rigc/issues/129)) ([a994981](https://github.com/firejune/rigc/commit/a99498121d5a65ae43e8a6ea17094ddf99aee785))


### Bug Fixes

* **bench:** stop copying the rung's gate string into bench.json ([#144](https://github.com/firejune/rigc/issues/144)) ([89f2bc6](https://github.com/firejune/rigc/commit/89f2bc6b77332b6997036f5db67d11bedeccf8ba)), closes [#137](https://github.com/firejune/rigc/issues/137)
* **check:** decide the framing per frame set, not once over the whole root ([#108](https://github.com/firejune/rigc/issues/108)) ([9e1da21](https://github.com/firejune/rigc/commit/9e1da210ce367fc3f2a9469e5a6212d199622db6)), closes [#100](https://github.com/firejune/rigc/issues/100)
* **compile:** round key times down onto the emit grid, never to nearest ([#107](https://github.com/firejune/rigc/issues/107)) ([7caf24e](https://github.com/firejune/rigc/commit/7caf24e57e41ca37ac4be4c0450c495b1117a447)), closes [#99](https://github.com/firejune/rigc/issues/99)

## [0.2.1](https://github.com/firejune/rigc/compare/v0.2.0...v0.2.1) (2026-08-23)


### Bug Fixes

* **package:** publish as spine-rigc — npm refuses rigc as too similar to rc ([#71](https://github.com/firejune/rigc/issues/71)) ([f80fcef](https://github.com/firejune/rigc/commit/f80fcefe7943724ecdca63b36e14c29251c1c3fa))

## [0.2.0](https://github.com/firejune/rigc/compare/v0.1.0...v0.2.0) (2026-08-23)


### Features

* **bench:** rung 6 briefed — frames, brief, verification pass ([#43](https://github.com/firejune/rigc/issues/43)) ([cbd1469](https://github.com/firejune/rigc/commit/cbd1469c4c7a1aad714a2167a089ec56dcfe00ea))
* **bench:** rung 6 transcribed — expressiveness proof ([#48](https://github.com/firejune/rigc/issues/48)) ([7c4e35f](https://github.com/firejune/rigc/commit/7c4e35f5f0ab147f8ff3230aaae980a0fc47fd75))
* **check:** report per-frame change fidelity ([#65](https://github.com/firejune/rigc/issues/65)) ([8ecb1c7](https://github.com/firejune/rigc/commit/8ecb1c7aa29c4126d6d1c3047e19def200d3ba9e)), closes [#53](https://github.com/firejune/rigc/issues/53)
* **diff:** name-agnostic section figures for bones and slots ([#60](https://github.com/firejune/rigc/issues/60)) ([05ca3fa](https://github.com/firejune/rigc/commit/05ca3faaee396158f3774d9abf12625226e1770a))
* **render:** rasterise mesh attachments through spine-core world vertices ([#42](https://github.com/firejune/rigc/issues/42)) ([96fe043](https://github.com/firejune/rigc/commit/96fe043259114500f5163040744d93170220c6bf)), closes [#27](https://github.com/firejune/rigc/issues/27)
* **rig:** carry a bone's editor icon through to the skeleton ([#66](https://github.com/firejune/rigc/issues/66)) ([754d3ab](https://github.com/firejune/rigc/commit/754d3ab6fc32e74a91045cb81923984f2e904a0b)), closes [#47](https://github.com/firejune/rigc/issues/47)


### Bug Fixes

* **check:** frame the candidate by its drawn pixels, not by quad corners ([#39](https://github.com/firejune/rigc/issues/39)) ([87ce9bf](https://github.com/firejune/rigc/commit/87ce9bf64d659a5c00cfef0808a762ebddeafd98)), closes [#34](https://github.com/firejune/rigc/issues/34)
* **check:** use the frames' own box when the candidate is measured into it ([#64](https://github.com/firejune/rigc/issues/64)) ([26e8fc6](https://github.com/firejune/rigc/commit/26e8fc6412731ef68eb9755270f16adf2c3b0bb0)), closes [#52](https://github.com/firejune/rigc/issues/52)
* **compile:** refuse a key time past the animation's declared duration ([#61](https://github.com/firejune/rigc/issues/61)) ([7f67928](https://github.com/firejune/rigc/commit/7f67928e5a39ec92037b64aeb6f799a2faecf8ff)), closes [#54](https://github.com/firejune/rigc/issues/54)
* **rig:** authored mesh vertices bind bones by name; generator-topology assertions skip authored meshes ([#50](https://github.com/firejune/rigc/issues/50)) ([da2072d](https://github.com/firejune/rigc/commit/da2072da197618530253d378d6b178032e55b0ec))
