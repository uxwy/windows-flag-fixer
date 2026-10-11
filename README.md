# Windows Flag Fixer

Windows has no flag emojis, so Spotify shows flags as letters like **NL** or **US**.
This Spicetify extension loads a small flag font so they show up as real flags again.

## Features

- Fixes country and subdivision flags in the Windows Spotify client
- Works with themes (it re-applies itself when a theme loads or changes its fonts)
- Pick a style from the profile menu: Twemoji flags (default), Noto Color Emoji, or your own font URL
- Remembers your choice

## Install

Install it from the Spicetify Marketplace, or manually:

1. Copy `extension.js` to `%appdata%\spicetify\Extensions\` and rename it `windows-flag-fixer.js`
2. Run:
   ```
   spicetify config extensions windows-flag-fixer.js
   spicetify apply
   ```

## Use

Click your profile picture, then **Windows Flag Fixer**, and choose a style.

## Notes

- The default flag font (Twemoji Country Flags) is loaded from jsDelivr, so an internet connection is needed.
- The custom font option takes a direct URL to a font you are licensed to use. No third-party emoji font is bundled.
- The Noto Color Emoji option may change how digits look, because Google's font includes digit glyphs.
