# Room images: history, layout consistency, doors and windows, proxy fix

Technical record of changes to the room-rendering panel on the project page
(`apps/web/app/project/[id]/page.tsx`) and the floor-plan recognition behind it. State as of 2026-11-07. Nothing is committed; this folder
is not a git repository.

## 1. Image history (new)

**Problem.** Chatting with the AI to edit a room's image replaced the picture. The earlier ones
were gone.

**Now.** Each room keeps its earlier versions, up to the 20 most recent. They are shown as
thumbnails under the current image ("历史版本 · N（点击缩略图恢复）"), newest first. The label is the
edit request you typed, or 初始生成 for the first AI render. Clicking a thumbnail makes it the current image,
and the image it replaces goes into the history, so no version is ever lost.

**How it works.**
- `DecorationImage` gets an optional `history` list (`prompt`, `url`, `b64` per version). It is
  saved inside the existing `decorations` project result, so it survives a refresh and no database
  or API change was needed.
- `withHistory(next, prev)` pushes the old current image into the history. It is used when a chat
  edit succeeds, when a room is regenerated, and when a version is restored.
- Regenerating all rooms now keeps each room's old image in its history. If a regeneration fails
  for a room, the old image is kept instead of being replaced by an empty one.
- `persistDecorations(imgs)` is the single save function, replacing two duplicate `fetch` blocks.
- Limits: images are stored as links to Agnes's servers (as before). If Agnes deletes old
  outputs, the thumbnails will break. Copying images into our own storage would fix that (open
  item, see section 4).

## 2. Renders that match the drawing (new)

**Problem.** The room render did not match the plan. The image model was given only the room
name, an area and a style, so it invented the layout. The sizes were also inconsistent: the
prompt calculated area at a fixed 0.0125 m per pixel, while the 3D model calibrates to the
declared floor area.

**Now.**
- `geometryFromStudioRects(rects, totalArea)` (exported from `FloorPlanStudio.tsx`) is the one
  place that turns the drawn rectangles into metres. "Generate 3D" and the room renders both use
  it, so sizes agree.
- `describeRoomLayout(plan, roomIndex)` (new, in `packages/shared/src/plan.ts`, next to the plan
  code) reads the plan geometry and describes the room in words: its size, the doors and windows
  on each wall, where they sit, and which room each door leads to. The camera faces the wall with
  the widest window. Example:

  > Layout taken from the floor plan, follow it exactly: the room is a 5.9 m x 4.1 m rectangle. … Far wall: a 1.5 m wide window toward the right. Left wall: a 1.5 m wide window near the camera. Right wall: a doorway to the 次卧 midway. … Do not add windows or doors that are not listed.

- The text is added to the render prompt, together with "fully furnished and decorated" (without it
  the rooms came out nearly empty). It is saved with each image (`layout`) and sent again on
  every chat edit and restore, so edits keep the layout.
- The same plan geometry drives the 3D model and the vector 2D drawing, so the renders now agree
  with those.

**Checked.** Regenerated project 5's rooms and compared pictures with the plan:
- Living room: window toward the right on the far wall ✓, window near the camera on the left wall
  ✓, doorway on the right showing a bedroom ✓.
- Master bedroom: window toward the left ✓, doorway on the left showing the bathroom ✓, right wall
  solid ✓.
- Before the change, the living room had a floor-to-ceiling glass wall and none of those features.

**Limits.**
- An image model follows text instructions only approximately. In both rooms above it added one
  extra door that is not in the plan. Positions of the main windows and doorways were right, but
  this is not a guarantee.
- **The AI-generated "标准房型图" image could differ from the renders.** At this point recognition
  read only room rectangles, and doors and windows were placed by rules. Section 4 fixes this: recognition
  now reads the doors and windows too.

## 3. Fix: Agnes calls failing behind a proxy (bug fix)

**Symptom.** Chat edits and image generation failed with "生成失败：fetch failed" after about 10
seconds, and a regenerate saved six empty images.

**Cause.** This PC reaches the internet through a local proxy (`HTTPS_PROXY=http://127.0.0.1:7897`).
`curl` uses it. Node's built-in `fetch` ignores it by default, so the server connected directly and
timed out (`UND_ERR_CONNECT_TIMEOUT`). MiMo kept working because `lib/mimo.ts` calls `curl`.

**Fix.** `apps/web/instrumentation.ts` calls Node's `http.setGlobalProxyFromEnv()` when the server
starts (Node 24.5+), so `fetch` honors `HTTP_PROXY` / `HTTPS_PROXY`. It does nothing when no proxy
is set or the Node version lacks the function. The dev server had to be restarted for the hook to
run.

## 4. Recognition now reads doors and windows (new)

**Problem.** Section 2 left a gap. Floor-plan recognition (MiMo) read only the room rectangles. The
doors and windows in the 3D model and in the render layouts were then placed automatically by
rules, so they could differ from the ones drawn in the AI floor-plan image.

**Now.**
- `POST /api/mimo/recognize` also asks MiMo for every door and window as a box on the picture
  (`windows`, `doors`, in the same 0 to 1 picture coordinates as the rooms).
- `assignOpeningsToRooms` (new, `packages/shared/src/plan.ts`) decides which room and which wall
  each box belongs to: the nearest room edge, and a shared wall gives the opening to both rooms.
  Each room gets `openings: [{type, side, pos, size}]`. Asking MiMo for boxes and working out the
  wall in code scored better than asking it for "which side of which room": 86% against 66% in my test.
- `StudioRect` carries the openings (saved with the floor-plan input).
  `geometryFromStudioRects` passes them to `planFromRects`, which places doors and windows at those
  spots (`placeHint`). Rooms with no recognised openings, such as hand-drawn ones, still get the
  old automatic placement. A shared door seen from both rooms is placed once; doors within 1.5 m on
  one wall count as one; a window recognised on an interior wall is ignored with a warning.
- The tool now reports "已识别 N 个房间、M 处门窗".
- **MiMo thinking mode is switched off for this call** (`noThinking` option in `lib/mimo.ts`,
  used only here). Thinking mode took about 27 to 37 seconds, sometimes ran past the 65-second
  limit, and in 2 of 3 runs used up the whole answer length and returned nothing. With it off the
  call takes about 7 seconds, and the quality was the same or better. The answer length limit is 4000 tokens.

**Two geometry bugs found and fixed on the way** (they affect every plan built from rectangles):
1. *Doubled walls.* Recognised rooms never line up exactly, so a shared wall became two parallel walls
   10 to 25 cm apart, each with its own door. `snapEdges` now pulls nearly-shared edges onto one
   line (tolerance 3.5% of the plan's long side, at least 25 cm; a room's own two edges are never
   merged). A test plan went from 12 walls to 8.
2. *East and south windows were never made.* The plan's width and depth were rounded to 0.1 m and
   the walls were then compared with the rounded value, so the east and south walls were not
   recognised as exterior and had no windows or entrance door, in the automatic mode too. Width and
   depth now keep millimetre precision.

**Measured.** A test plan with a known answer (4 rooms, 6 windows, 3 distinct doors, drawn as blue
double lines and door arcs): the whole route finds about 89% of the openings (49 of 55 over 5
runs) with the right type, wall and part of the wall. It also adds noise: about 4 false openings per run
(for example a door between the kitchen and bathroom that is not drawn). Then I recognised this plan
into project 5, generated the room images and compared them with the drawing: in the living room
the window in the middle of the far wall, the window on the left wall and the doorway to the bedroom
(a bed is visible) match; the kitchen's window matches. The AI also drew the doors that are "behind the
camera" on the far wall instead, because a picture cannot show what is behind the camera.

## 5. Reviewing and editing recognised doors and windows (new)

Recognition adds a few false openings and misses some, so the floor-plan tool
(`FloorPlanStudio.tsx`) now lets you check and correct them before generating anything.

- **On the plan:** every recognised opening is drawn over the plan on its wall, windows in blue and
  doors in orange (`openingSegment`). It lines up with the openings in the drawing, so wrong ones are easy to spot.
- **Below the plan:** a "门窗" list with one block per room. Each opening is a row with its type
  (窗/门), wall (上/右/下/左), position along the wall (slider), width in metres, and a delete (✕)
  button. "+ 窗" and "+ 门" add one. Pointing at a row highlights that opening on the plan in pink.
- **Saving:** the openings are part of each room's data, so the existing 保存 button saves them. Then
  "按此图生成 3D" and "生成各房间渲染图" use the corrected openings. Positions are fractions of the wall,
  so moving or resizing a room keeps its openings in place.
- **Rule:** as soon as there is one opening record, the 3D model and renders use only the records
  (a note under the list says so). If you delete every opening, the old automatic placement comes back.

**Checked in the browser on project 5:** the list matched the 20 recognised openings; I deleted the false
kitchen-to-bathroom door from both rooms, saved, and the saved plan had 2 openings in the kitchen
and 1 in the bathroom; the 3D model rebuilt (8 walls, no warnings); adding a window, changing its wall,
position and width with the real controls drew it on the right wall of the bathroom, and deleting it
removed it. **Not tested:** dragging openings directly on the plan (not built: the list controls are used instead), and a phone-width screen.

## 6. Verification and open items

- **Type check** `npx tsc -b` and **production build** `next build` pass. The two config files
  Next rewrites during a build were restored from the backup.
- **Browser:** regenerate all rooms; two chat edits to one room created two history entries with
  correct labels; clicking 初始生成 restored the original and kept both edits in the history; the
  server copy matched; the other rooms were untouched. Chat edit about 13 to 25 seconds, room
  generation about 40 seconds for six rooms.
- **Not tested:** the 20-version limit; the history on a phone-width screen; a project whose rooms
  came from a user-drawn floor plan (checked on an Agent-generated plan).
- **Also checked (section 4):** the geometry with known openings (shared doors placed once,
  interior windows ignored, hand-drawn rooms unchanged), the recognition route 5 times against an
  answer key, "按此图生成 3D" on the recognised plan (8 walls, no warnings), and the images
  generated from it.
- **Not tested:** a plan photographed or drawn by hand (only a clean drawn plan and the earlier
  AI-made one were used); a plan with more than about 8 rooms; the Agnes "标准房型图" image itself
  as the source (the test plan was my own drawing).
- **Open items:**
  1. Copy generated images into our own storage, so history survives Agnes deleting old outputs.
  2. Openings can be corrected only through the list (section 5). Dragging them on the plan itself
     would be quicker.
  3. The AI sometimes adds an unlisted door, and cannot show doors behind the camera. Choosing the
     camera direction to show the most doors, or generating two views per room, could help.
