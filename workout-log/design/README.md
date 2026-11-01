# Puff: the comp-prep mascot

- `puff-character-sheet.png`: the original sheet (generated with ChatGPT from the prompt
  in the session that created it, transparent background).
- `../public/puff/puff-*.webp`: the six poses cut from that sheet, as 384×384 transparent
  WebP files, centred with the same framing, so they can be swapped one for another:
  `snoozing`, `cruising`, `puffed`, `sparkly` (the four moods), `wiggle` (shown briefly
  after someone logs a workout) and `small` (for the tank, readable at about 40px).
- `puff-sparkly-glow-source.png`: the second ChatGPT image; its right-hand Puff (with
  the glow and stars) replaced the original `sparkly` pose (2026-11-02).
- App icons (`../public/icon-512.png`, `apple-touch-icon.png`, `favicon-48.png`): the
  cruising Puff, re-cut from the character sheet at full resolution; on the Puff tab's
  ocean-blue gradient for the home screen, transparent for the browser tab.
- `team-tab-mock.html`: the clickable mock of the Team tab (Puff's mood, Swim to Amager,
  the tank). Published as an artifact for review. Not wired into the app yet.

To re-cut the sprites from a new sheet, separate each pose by its connected shapes
rather than a straight line: the snoozing pose's "z z" sits between two fish.
