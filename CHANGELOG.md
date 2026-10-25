# Changelog

## 1.1.0 - 2026-10-25
- Added "Change custom font link" to the profile menu. The link can now be edited at any time.
- The link is checked before it is saved: it must be a direct font file (.woff2, .woff, .ttf or .otf), and Spotify has to be able to load it. If not, nothing changes.
- Added a "Remove link" button.
- The running version is now printed in the console.

## 1.0.0 - 2026-10
- First release.
- Restores flag emojis on Windows with a Twemoji flag font.
- Keeps working with themes by re-declaring the theme's own font rules.
- Choose between Twemoji flags, Noto Color Emoji or your own font link.
- Profile menu waits for Spicetify to be ready, so it no longer fails on slow starts.
