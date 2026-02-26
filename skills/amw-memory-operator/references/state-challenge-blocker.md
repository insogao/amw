# State: CHALLENGE_BLOCKER

Use this state when blocked by popup, captcha, QR, or risk interstitial.

## Entry Rule

Do not silently switch to manual mode.

1. Explain blocker type and impact briefly.
2. Ask user approval before entering manual mode.
3. Continue manual flow only after explicit "yes".

## Flow

1. Keep normal branch unchanged.
2. Add/maintain one challenge-handling branch only.
3. Save required evidence/artifact:
   1. prefer `copy_image_original`
   2. fallback to selector/clip screenshot
4. If blocker cannot be solved automatically, call `human_handoff` or fail fast with clear reason.
5. Resume normal branch after blocker is resolved.

## Output Rule

If QR is needed, output direct QR image file when possible (not full-page screenshot).
