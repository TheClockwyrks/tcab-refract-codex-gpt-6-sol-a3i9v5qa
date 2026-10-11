# Refract

Refract is a browser puzzle about drawing paths of light across an optical bench. Connect each pair of outlined emitters while passing through every filled lens of the same shape. Crystals accept beams of any color, and their charge counters show how many crossings remain.

Choose **Campaign** for 24 hand-built boards in four sets, or **Cascade** for an endless sequence that grows harder as you solve boards.

## Run

Install with `npm ci`, then start the development server with `npm run dev`. Build a self-contained static site in `dist/` with `npm run build`; serve that folder with any static file server. Run checks with `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test`.

## Controls

Press and drag from an emitter along adjacent nodes. Release to keep a partial beam; press either end to resume, or drag backward to retract. A move that would break a rule is ignored. Click or touch menus and controls. Arrow keys or WASD move menu highlights, Enter or Space confirms, Escape goes back, **R** clears the board, and **M** toggles sound. Diagonal links are allowed, but two diagonals cannot cross.
