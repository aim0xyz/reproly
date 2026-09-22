# Patchmason promo video

The 21-second 1080p promo uses the product's real UI captures, logo, and a generated electronic pulse bed. It does not need downloaded media or third-party assets.

Render on macOS with ImageMagick and FFmpeg installed:

```sh
bash promo/make-promo.sh
```

Outputs:

- `dist/Patchmason-promo-1080p.mp4`
- `dist/Patchmason-promo-poster.png`

The render is intentionally copy-led and works without voice-over. All title cards remain legible when muted.
