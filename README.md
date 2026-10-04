# Catz: The Big Splash Adventure

Pick a cat, run through town to the water park, brave the soft tube maze and the log flume, and come
home to the cat playhouse to eat, drink, play and fish for apples. Built on
[game-engine](https://github.com/ssinnott/game-engine), vendored into `src/lib/`.

`npm install`, then `npm run dev` and open <http://localhost:8080/>. `npm run build` makes
`dist/index.html`, the whole game in one file that opens from disk or any web host.

## How to play

| | keyboard | gamepad | touch |
|---|---|---|---|
| move | arrows / WASD | d-pad / stick | ← → |
| jump | Space / Z / Up | A | JUMP |
| duck (or crawl) | Down / S | d-pad down | ↓ |
| paw: attack, or use what you are standing at | X / J / E | X | PAW |
| your cat's special move | C / L / Shift | B / Y | ★ |
| drop through a thin platform | Down + Jump | | |
| pause | Esc / P / Enter | Start | II |

Fish treats are points. Bonk bad guys by jumping on them or with your paw (if one bumps you, you drop
some fish -- grab them back). Find the three golden fish in each challenge. **Falling in the water
is the one thing that sends you back:** a big splash, points lost, and you start over from the last
checkpoint bell, dripping.

## The cats

| | | what it does in the game |
|---|---|---|
| **Crush** | big and strong | One punch bonks any bad guy (the bulldog takes two from anyone else). Water jets barely move him. **Ground Pound**: bonks every bad guy nearby and smashes cracked blocks -- there is a hidden fish cave in the town only he can open. |
| **Sprout** | little and smart | Smallest, so she ducks lowest. Carries a book (and bonks with it). **Think Fast**: time slows down for everything but her. |
| **Sly** | black, smooth-moving, quiet, the most wise | Smoothest to control. So quiet that the bulldog and the pigeons never notice him. Meditates when you leave him be. **Shadow Step**: dashes as a shadow; nothing can touch him. |
| **Biscuit** | very agile, great at karate, hungry | Fastest, and double-jumps with a flip. Karate kicks and chops. Always hungry: every fish is worth more, and her tummy rumbles. **Flying Kick**, even in mid-air. |
| **Truffle** | trips a lot, good at jumping | Jumps highest, and floats if you hold jump. Runs flat out for too long and she trips over her untied laces. **Super Spring**: a giant spinning jump. |
| **Pendragon** | a knight, with a big flock of dragons | His dragon flock follows him everywhere and puffs fire at nearby bad guys. **Dragon Shield**: the dragons circle him and water fizzles off. |

(The description said "one of 5 cats" and then listed six -- all six are in.)

## The challenges

- **Town Run** -- from the cat's street to the Splash Park gate. Raccoon bandits with loot sacks
  (bonk one and he drops his fish), rats, a bulldog who charges, swooping pigeons. Jump the fountain
  pond, climb the shop awnings, hop the rooftops over the canal, cross the duck pond on stepping
  stones, bounce up to the treehouse. Finishing it opens the water park.
- **Tube Maze** -- four padded play-place tubes joined into one long zig-zag by drop holes. Pipes
  fire gulps of sewer water along the tubes: **jump the low ones, duck the high ones.** Ceiling pipes
  pour; wait for them. Sewer pits to jump, frogs, rats.
- **Log Flume** -- logs float down a stream that steps down two waterfalls. **Wait for a log, then
  jump down onto it** and ride. Splash geysers bubble and then erupt out of the stream: hop off onto
  a dock, wait for the splash, catch the next log. Ride a log over a waterfall for a big splash.
  Crabs on the docks.

Every challenge has three checkpoint bells, three golden fish and a par time. Stars: one for
finishing, one for a high score, one for all three golden fish.

## The playhouse

Home, and the hub. Walk up to anything and press the paw button: the **food bowl**, the **water
bowl**, the **apple tub** (apple fishing: steer the hook, dip for apples, golden ones are worth the
most -- but reach too far and the cat topples in), the **scratching post** and the **toy mouse** at
the top of the climbable cat tree, the **yarn balls** (bat them into the basket), and the little
cardboard **playhouse** (take a nap, or change cats). Each one is a cut animation.

A cat's FOOD, DRINK and PLAY run down by one each challenge. **A cat with all three full is a happy
cat, and happy cats score double.**

## Lots of cut animations

Every action plays out: arriving at a level (the camera leans in, the cat meows its line), falling
in the water (a splash, sinking under the surface, the iris closing, coming back at the bell
shaking off the water), reaching the goal (a victory dance per cat, confetti), eating, drinking,
scratching, napping, catching apples, toppling into the apple tub. Idle cats groom or do their own
quirk -- Crush flexes, Sprout reads, Sly meditates, Biscuit's tummy rumbles, Truffle wobbles,
Pendragon polishes his sword.

## Checks

`npm run check` runs all of these (CI runs it on every push):

| | |
|---|---|
| `typecheck` | strict TypeScript over the game, the tools and the vendored engine |
| `lib-check` | `src/lib/` is exactly the engine commit it was pulled from (fix the engine upstream, never here) |
| `gametest` | Node tests: level files are well-formed, every cat has every animation, every music channel is a whole number of bars, collision, saving, and a **reachability search** -- the real player code driven through every level for every cat, proving each one can reach the goal and all three golden fish |
| `build` | `dist/index.html` |
| `smoke` | headless Chromium: the game loads, every screen opens, every sound and track renders audibly |
| `playtest` | headless Chromium plays the whole game: pick a cat, the playhouse activities, a round of apple fishing, the map, the Town Run (fall in the pond, respawn, reach the gate), the results, and every cat's special in every challenge. Screenshots land in `.shots/playtest/` |

Smoke and playtest need Playwright and Chromium (`npm i --no-save playwright && npx playwright install chromium`).

## Editing levels

Levels are ASCII art, one character per 24 px tile, in `src/levels/`. The legend is at the top of
`src/world/level.ts` -- `#` ground, `=` a thin platform, `~` water, `f` a fish, `F` a golden fish,
`R` a raccoon, `>` a water pipe, `C` a checkpoint, `E` the goal, and so on. After changing one, run
`node tools/reach.ts town` (or `tubes`, `flume`) to check every cat can still get through.
`?screen=lab&arg=sheet:idle,walk@5,run@8` shows every cat's animations side by side.

## The engine

`src/lib/` is game-engine's `src/`, added with `git subtree --squash`: the rig, the animation
player, the cel shading, the pixel font, the loop, the canvas, the audio synth and sequencer, the
gamepad layer and the scene layer's camera and grids. To update it, publish the split branch from
game-engine and pull it here:

```sh
# in game-engine
git subtree split --prefix=src -b split && git push origin split
# in catz
git subtree pull --prefix=src/lib https://github.com/ssinnott/game-engine split --squash
```

The platformer collision (`src/world/physics.ts`) is written here, in the game: it is the second
data point the engine's scene layer said it was waiting for before abstracting swept-box collision.

## Layout

```
src/main.ts          boot: canvas, loop, input, audio, the first screen
src/config.ts        view size, tile size, physics feel, points, UI colours
src/core/            input (keys, pads, touch), screens + the cat-head iris, save, particles, audio, SFX, music
src/cats/            the six cats: looks, rig part hooks, animations, abilities, Pendragon's dragons
src/world/           levels, collision, the player, bad guys, water hazards, logs, pickups, tiles, backdrops, cut scenes, the stage
src/levels/          the three challenges and the playhouse room
src/screens/         title, select, playhouse, apple fishing, map, a challenge, results, the art lab
src/ui/              HUD, menus, touch buttons
tools/               dev server, build, smoke, playtest, game tests, reachability search, lib-check, screenshots
```
