// Windows Flag Fixer - restores country flag emojis in the Spotify desktop client on Windows.
(async function WindowsFlagFixer() {
  "use strict";

  const ID = "windows-flag-fixer";
  const FLAG_FONT = "Twemoji Country Flags";
  const FLAG_URL =
    "https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1/dist/TwemojiCountryFlags.woff2";
  // Regional indicators (flags) + black flag + tag characters (England/Scotland/Wales)
  const FLAG_RANGE = "U+1F1E6-1F1FF, U+1F3F4, U+E0062-E007F";

  // Emoji code points only. Deliberately excludes ASCII 0-9, # and * so numbers keep the normal font.
  const EMOJI_RANGE =
    "U+00A9, U+00AE, U+203C, U+2049, U+20E3, U+2122, U+2139, U+2194-21AA, U+231A-23FF, U+24C2, " +
    "U+25AA-25FE, U+2600-27BF, U+2934-2935, U+2B05-2B55, U+3030, U+303D, U+3297, U+3299, " +
    "U+FE0F, U+200D, U+1F000-1FAFF, U+E0020-E007F";

  const KEY_STYLE = `${ID}:style`;
  const KEY_CUSTOM = `${ID}:custom-url`;
  const KEY_FORCE = `${ID}:force`;

  const STYLES = {
    twemoji: {
      label: "Twemoji flags + Windows emoji (default)",
      family: null,
    },
    noto: {
      label: "Noto Color Emoji (Google)",
      family: "Noto Color Emoji",
      css: "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap",
    },
    custom: {
      label: "Custom font URL (Apple, full Twemoji, ...)",
      family: "Windows Flag Fixer Custom Emoji",
    },
  };

  // Spotify CSS variables that hold the app font stack
  const FONT_VARS = ["--encore-body-font-stack", "--font-family", "--encore-title-font-stack"];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(check, timeout = 60000, step = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (check()) return true;
      } catch (e) {
        /* not ready yet */
      }
      await sleep(step);
    }
    return false;
  }

  const ready = await waitFor(
    () =>
      window.Spicetify &&
      Spicetify.Platform &&
      Spicetify.LocalStorage &&
      Spicetify.Menu &&
      document.head &&
      document.body
  );
  if (!ready) {
    console.warn(`[${ID}] Spicetify did not finish loading, giving up.`);
    return;
  }

  // ---------- storage ----------
  const store = {
    get(key, fallback) {
      try {
        const v = Spicetify.LocalStorage.get(key);
        return v === null || v === undefined ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        Spicetify.LocalStorage.set(key, String(value));
      } catch (e) {
        console.warn(`[${ID}] could not save setting`, e);
      }
    },
  };

  let currentStyle = store.get(KEY_STYLE, "twemoji");
  if (!STYLES[currentStyle]) currentStyle = "twemoji";
  let customUrl = store.get(KEY_CUSTOM, "");
  let force = store.get(KEY_FORCE, "false") === "true";

  // ---------- DOM helpers ----------
  function getOrCreate(tag, id, attrs = {}) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    }
    return el;
  }

  // Capture the original font stacks ONCE, before we override anything,
  // so the user's theme fonts stay intact as the fallback.
  let base = null;
  function captureBase() {
    if (base) return;
    const rootStyle = getComputedStyle(document.documentElement);
    base = { vars: {}, body: getComputedStyle(document.body).fontFamily || "sans-serif" };
    FONT_VARS.forEach((name) => {
      const v = rootStyle.getPropertyValue(name).trim();
      if (v) base.vars[name] = v;
    });
  }

  function buildStack(style) {
    const fonts = [];
    if (style.family) fonts.push(`"${style.family}"`);
    fonts.push(`"${FLAG_FONT}"`);
    return fonts.join(", ");
  }

  function safeUrl(url) {
    return String(url).trim().replace(/["'()\\\s]/g, (c) => encodeURIComponent(c));
  }

  // Finds the theme's own "font-family: ... !important" rules (e.g. Liquify's
  // "body, body :not(svg):not(svg *)") so we can re-declare them with the flag font in front.
  function collectThemeFontRules() {
    const out = [];
    const seen = new Set();
    const ours = document.getElementById(`${ID}-style`);
    for (const sheet of document.styleSheets) {
      if (ours && sheet.ownerNode === ours) continue;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        continue; // cross-origin sheet
      }
      for (const r of rules) {
        if (!r.style || !r.selectorText) continue;
        const val = r.style.getPropertyValue("font-family");
        if (!val || r.style.getPropertyPriority("font-family") !== "important") continue;
        if (val.includes(FLAG_FONT)) continue;
        const key = r.selectorText + "|" + val;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ sel: r.selectorText, val });
      }
    }
    return out;
  }

  function apply() {
    captureBase();
    const style = STYLES[currentStyle];
    const stack = buildStack(style);

    // 1) Flag font (always loaded, only used for flag characters thanks to unicode-range)
    let css = `@font-face{font-family:"${FLAG_FONT}";src:url("${FLAG_URL}") format("woff2");unicode-range:${FLAG_RANGE};font-display:swap;}\n`;

    // 2) Optional full emoji font
    const linkId = `${ID}-emoji-css`;
    const oldLink = document.getElementById(linkId);
    if (style.css) {
      const link = getOrCreate("link", linkId, { rel: "stylesheet" });
      if (link.getAttribute("href") !== style.css) link.setAttribute("href", style.css);
    } else if (oldLink) {
      oldLink.remove();
    }

    if (currentStyle === "custom" && customUrl) {
      css += `@font-face{font-family:"${style.family}";src:url("${safeUrl(customUrl)}");unicode-range:${EMOJI_RANGE};font-display:swap;}\n`;
    }

    // 3) Prepend our fonts to Spotify's own stacks (keeps theme fonts as fallback)
    const usable = currentStyle !== "custom" || customUrl;
    const effectiveStack = usable ? stack : `"${FLAG_FONT}"`;
    let rootVars = "";
    Object.entries(base.vars).forEach(([name, value]) => {
      rootVars += `${name}:${effectiveStack}, ${value} !important;`;
    });
    css += `:root,body,#main,.Root,[class*="encore-"]{${rootVars}}\n`;
    css += `body,#main,.Root{font-family:${effectiveStack}, ${base.body};}\n`;

    // 4) Optional "force everywhere" mode
    if (force) {
      css += `*,*::before,*::after{font-family:${effectiveStack}, var(--font-family, sans-serif) !important;}\n`;
    }

    // 5) Beat the theme's own !important font rules by repeating their selector (we are last in <head>)
    collectThemeFontRules().forEach(({ sel, val }) => {
      css += `${sel}{font-family:${effectiveStack}, ${val} !important;}\n`;
    });

    getOrCreate("style", `${ID}-style`).textContent = css;
  }

  apply();

  // Keep our <style> as the LAST element in <head>, so themes that load later can't override it
  let keepTimer;
  function keepLast() {
    const el = document.getElementById(`${ID}-style`);
    if (el && document.head.lastElementChild !== el) document.head.appendChild(el);
  }
  new MutationObserver((mutations) => {
    const ours = document.getElementById(`${ID}-style`);
    const external = mutations.some((m) => !(ours && (m.target === ours || ours.contains(m.target))));
    if (!external) return;
    clearTimeout(keepTimer);
    keepTimer = setTimeout(() => {
      apply();
      keepLast();
    }, 300);
  }).observe(document.head, { childList: true, subtree: true, characterData: true });
  keepLast();

  // Some themes inject their fonts a moment after start-up; re-apply once to be safe
  setTimeout(() => {
    base = null;
    const styleEl = document.getElementById(`${ID}-style`);
    if (styleEl) styleEl.textContent = "";
    apply();
  }, 4000);

  // ---------- menu ----------
  const items = {};
  let forceItem;

  function refreshMenu() {
    Object.keys(items).forEach((k) => items[k].setState(k === currentStyle));
    if (forceItem) forceItem.setState(force);
  }

  function selectStyle(key) {
    if (key === "custom" && !customUrl) {
      openCustomDialog();
      return;
    }
    currentStyle = key;
    store.set(KEY_STYLE, key);
    apply();
    refreshMenu();
  }

  function openCustomDialog() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:12px;";

    const text = document.createElement("div");
    text.textContent =
      "Direct URL to an emoji font file (.woff2, .woff, .ttf). Only use fonts you are licensed to use.";
    const input = document.createElement("input");
    input.type = "text";
    input.value = customUrl;
    input.placeholder = "https://example.com/MyEmojiFont.woff2";
    input.style.cssText =
      "width:100%;padding:8px;border-radius:4px;border:1px solid #727272;background:#121212;color:#fff;";
    const btn = document.createElement("button");
    btn.textContent = "Save and apply";
    btn.style.cssText =
      "align-self:flex-start;padding:8px 16px;border-radius:500px;border:0;cursor:pointer;background:#1ed760;color:#000;font-weight:700;";
    btn.onclick = () => {
      customUrl = input.value.trim();
      store.set(KEY_CUSTOM, customUrl);
      currentStyle = customUrl ? "custom" : "twemoji";
      store.set(KEY_STYLE, currentStyle);
      apply();
      refreshMenu();
      Spicetify.PopupModal.hide();
    };

    wrap.append(text, input, btn);
    Spicetify.PopupModal.display({ title: "Custom emoji font", content: wrap });
  }

  // Menu.Item builds its UI with Spicetify.ReactJSX, which can load later than Menu itself
  const reactReady = await waitFor(
    () => Spicetify.React && Spicetify.ReactJSX && Spicetify.ReactJSX.jsx,
    30000
  );
  if (!reactReady) {
    console.warn(`[${ID}] Spicetify React helpers never loaded, skipping menu (flags still work).`);
  }

  try {
    if (!reactReady) throw new Error("React helpers unavailable");
    const menuItems = Object.entries(STYLES).map(([key, def]) => {
      items[key] = new Spicetify.Menu.Item(def.label, key === currentStyle, () => selectStyle(key));
      return items[key];
    });
    forceItem = new Spicetify.Menu.Item("Force font everywhere (may override theme)", force, () => {
      force = !force;
      store.set(KEY_FORCE, force);
      apply();
      refreshMenu();
    });
    menuItems.push(forceItem);

    if (Spicetify.Menu.SubMenu) {
      new Spicetify.Menu.SubMenu("Windows Flag Fixer", menuItems).register();
    } else {
      menuItems.forEach((i) => i.register());
    }
  } catch (e) {
    console.warn(`[${ID}] menu could not be created, flags will still work.`, e);
  }

  console.log(`[${ID}] loaded (style: ${currentStyle})`);
})();
