# Changelog

## 1.2.0 - 2026-11-25
- Added "Local font file..." option to load .woff2, .woff, .ttf, or .otf emoji fonts directly from your computer (works offline).
- Local font files are stored in IndexedDB instead of localStorage, supporting large full-emoji fonts (50 MB–150+ MB) without hitting the 5 MB storage quota.
- Validates local files with the FontFace API before saving and manages blob: URL lifecycles cleanly to prevent memory leaks.
- Added a live flag preview row (Preview: 🇲🇦 🇺🇸 🇯🇵 🇧🇷) at the bottom of the menu so you can verify your active font immediately.
- Simplified the profile submenu from 8 items down to 5: clicking "Custom font URL..." or "Local font file..." now opens a single modal to set, replace, or remove your custom font.

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
