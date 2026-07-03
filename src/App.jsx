import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "./App.css";

const SIZES = [16, 32, 48, 64, 96, 128, 192, 256, 384, 512];
const MASKABLE_SIZES = new Set([192, 512]);
const PRESET_COLORS = [
  "#000000",
  "#0b0b0b",
  "#111111",
  "#1f2937",
  "#ffffff",
  "#f5f5f5",
  "#3b82f6",
];

const DEFAULT_SETTINGS = {
  bg: "#ffffff",
  transparent: true,
  sizesStr: SIZES.join(","),
  iosWhiteOnly: false,
  maskableSafeBg: true,
  autoCrop: true,
  zoomPercent: 100,
};

// Détecte la zone réellement visible du logo (hors marges transparentes ou
// unies) afin que le contenu remplisse mieux le cadre, surtout aux petites
// tailles (favicon 16/32px) où un logo "perdu" dans ses marges devient
// illisible.
function getVisibleBoundingBox(img, alphaThreshold = 10, colorTolerance = 24) {
  const off = document.createElement("canvas");
  off.width = img.width;
  off.height = img.height;
  const ctx = off.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }

  const bgR = data[0];
  const bgG = data[1];
  const bgB = data[2];

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      let isContent;
      if (hasAlpha) {
        isContent = data[idx + 3] > alphaThreshold;
      } else {
        const dr = Math.abs(data[idx] - bgR);
        const dg = Math.abs(data[idx + 1] - bgG);
        const db = Math.abs(data[idx + 2] - bgB);
        isContent = dr > colorTolerance || dg > colorTolerance || db > colorTolerance;
      }
      if (isContent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height };
  }
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function canvasFromImage(img, size, background = "#ffffff", options = {}) {
  const { cropRect = null, zoomPercent = 100 } = options;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (background && background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }

  const sx = cropRect ? cropRect.x : 0;
  const sy = cropRect ? cropRect.y : 0;
  const sw = cropRect ? cropRect.width : img.width;
  const sh = cropRect ? cropRect.height : img.height;

  // contain fit (+ zoom optionnel, qui peut légèrement rogner les bords)
  const ratio = Math.min(size / sw, size / sh) * ((zoomPercent || 100) / 100);
  const w = Math.round(sw * ratio);
  const h = Math.round(sh * ratio);
  const x = Math.round((size - w) / 2);
  const y = Math.round((size - h) / 2);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  return canvas;
}

async function imageBitmapFromFile(file) {
  const arrayBuf = await file.arrayBuffer();
  const blob = new Blob([arrayBuf]);
  return await createImageBitmap(blob);
}

function computeCropRect(img, enabled) {
  if (!enabled) return null;
  try {
    return getVisibleBoundingBox(img);
  } catch {
    return null;
  }
}

// Construit un fichier .ico (format ICONDIR) contenant plusieurs images PNG
// embarquées, méthode supportée nativement depuis Windows Vista.
function buildIco(pngEntries) {
  const count = pngEntries.length;
  const headerSize = 6 + 16 * count;
  let offset = headerSize;

  const header = new Uint8Array(headerSize);
  const dv = new DataView(header.buffer);
  dv.setUint16(0, 0, true); // reserved
  dv.setUint16(2, 1, true); // type: 1 = icon
  dv.setUint16(4, count, true);

  let entryOffset = 6;
  for (const { width, height, buffer } of pngEntries) {
    dv.setUint8(entryOffset, width >= 256 ? 0 : width);
    dv.setUint8(entryOffset + 1, height >= 256 ? 0 : height);
    dv.setUint8(entryOffset + 2, 0); // palette
    dv.setUint8(entryOffset + 3, 0); // reserved
    dv.setUint16(entryOffset + 4, 1, true); // planes
    dv.setUint16(entryOffset + 6, 32, true); // bits per pixel
    dv.setUint32(entryOffset + 8, buffer.byteLength, true);
    dv.setUint32(entryOffset + 12, offset, true);
    entryOffset += 16;
    offset += buffer.byteLength;
  }

  const result = new Uint8Array(offset);
  result.set(header, 0);
  let pos = headerSize;
  for (const { buffer } of pngEntries) {
    result.set(new Uint8Array(buffer), pos);
    pos += buffer.byteLength;
  }
  return result;
}

const FAVICON_SIZES = [16, 32, 48];

async function buildFaviconIco(img, background, options = {}) {
  const entries = [];
  for (const size of FAVICON_SIZES) {
    const c = canvasFromImage(img, size, background, options);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const buffer = await blob.arrayBuffer();
    entries.push({ width: size, height: size, buffer });
  }
  return buildIco(entries);
}

// Favicon vectoriel: encapsule un PNG haute résolution dans un conteneur SVG.
// Les navigateurs modernes le préfèrent au .ico et l'affichent net à toute taille.
function buildSvgFavicon(img, background, options = {}, size = 512) {
  const canvas = canvasFromImage(img, size, background, options);
  const dataUrl = canvas.toDataURL("image/png");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><image width="${size}" height="${size}" href="${dataUrl}"/></svg>`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CopyButton({ text, label = "Copier" }) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);
  return (
    <button onClick={onClick} type="button">
      {copied ? "Copié !" : label}
    </button>
  );
}

function App() {
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [thumbs, setThumbs] = useState([]); // [{ file, url }]
  const [bg, setBg] = useState(DEFAULT_SETTINGS.bg);
  const [transparent, setTransparent] = useState(DEFAULT_SETTINGS.transparent);
  const [iosWhiteOnly, setIosWhiteOnly] = useState(
    DEFAULT_SETTINGS.iosWhiteOnly
  );
  const [maskableSafeBg, setMaskableSafeBg] = useState(
    DEFAULT_SETTINGS.maskableSafeBg
  );
  const [autoCrop, setAutoCrop] = useState(DEFAULT_SETTINGS.autoCrop);
  const [zoomPercent, setZoomPercent] = useState(
    DEFAULT_SETTINGS.zoomPercent
  );
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [sizesStr, setSizesStr] = useState(DEFAULT_SETTINGS.sizesStr);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const inputRef = useRef(null);
  const dropRef = useRef(null);

  const themeColor = transparent ? "#3b82f6" : bg;
  const backgroundColor = transparent ? "#ffffff" : bg;

  const manifestSnippet = useMemo(() => {
    return `{
	  "name": "IconGen PWA",
	  "short_name": "IconGen",
	  "theme_color": "${themeColor}",
	  "background_color": "${backgroundColor}",
	  "display": "standalone",
	  "start_url": "/",
	  "icons": [
	    { "src": "/logo192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
	    { "src": "/logo512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
	  ]
	}`;
  }, [themeColor, backgroundColor]);

  const headSnippet = useMemo(() => {
    return `<!-- Theme & Icons -->
<meta name="theme-color" content="${themeColor}" />
<link rel="icon" type="image/png" sizes="16x16" href="/logo16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/logo32.png" />
<link rel="icon" type="image/png" sizes="48x48" href="/logo48.png" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-3d.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-3d.png" />`;
  }, [themeColor]);

  const handlePick = useCallback(() => inputRef.current?.click(), []);

  const onFiles = useCallback(
    async (list) => {
      const arr = Array.from(list || []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (arr.length === 0) return;
      setError("");
      try {
        setFiles(arr);
        setFile(arr[0]);
        setThumbs((prev) => {
          prev.forEach((t) => URL.revokeObjectURL(t.url));
          return arr.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
        });
        const img = await imageBitmapFromFile(arr[0]);
        const cropRect = computeCropRect(img, autoCrop);
        const opts = { cropRect, zoomPercent };
        const pv = [64, 192, 512].map((s) =>
          canvasFromImage(img, s, transparent ? null : bg, opts).toDataURL(
            "image/png"
          )
        );
        img.close?.();
        setPreviews(pv);
      } catch (e) {
        setError(
          `Impossible de lire le fichier image sélectionné (${
            e?.message || "format non supporté"
          }).`
        );
      }
    },
    [bg, transparent, autoCrop, zoomPercent]
  );

  const onInputChange = useCallback((e) => onFiles(e.target.files), [onFiles]);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = (e) => {
      prevent(e);
      onFiles(e.dataTransfer.files);
    };
    el.addEventListener("dragover", prevent);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", prevent);
      el.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.files;
      if (items && items.length) onFiles(items);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onFiles]);

  // Révoque les URL des miniatures à la fermeture du composant
  useEffect(() => {
    return () => {
      thumbs.forEach((t) => URL.revokeObjectURL(t.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Met à jour les aperçus quand la couleur de fond ou la transparence change
  useEffect(() => {
    (async () => {
      if (!file) return;
      try {
        const img = await imageBitmapFromFile(file);
        const cropRect = computeCropRect(img, autoCrop);
        const opts = { cropRect, zoomPercent };
        const pv = [64, 192, 512].map((s) =>
          canvasFromImage(img, s, transparent ? null : bg, opts).toDataURL(
            "image/png"
          )
        );
        img.close?.();
        setPreviews(pv);
      } catch (e) {
        setError(
          `Impossible de générer l'aperçu (${e?.message || "erreur inconnue"}).`
        );
      }
    })();
  }, [bg, transparent, file, autoCrop, zoomPercent]);

  // LocalStorage: charger
  useEffect(() => {
    try {
      const raw = localStorage.getItem("icongenSettings");
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.bg === "string") setBg(s.bg);
        if (typeof s.transparent === "boolean") setTransparent(s.transparent);
        if (typeof s.sizesStr === "string") setSizesStr(s.sizesStr);
        if (typeof s.iosWhiteOnly === "boolean")
          setIosWhiteOnly(s.iosWhiteOnly);
        if (typeof s.maskableSafeBg === "boolean")
          setMaskableSafeBg(s.maskableSafeBg);
        if (typeof s.autoCrop === "boolean") setAutoCrop(s.autoCrop);
        if (typeof s.zoomPercent === "number") setZoomPercent(s.zoomPercent);
      }
    } catch {
      // paramètres locaux corrompus ou indisponibles: on ignore et garde les valeurs par défaut
    }
  }, []);

  // LocalStorage: sauvegarder
  useEffect(() => {
    try {
      localStorage.setItem(
        "icongenSettings",
        JSON.stringify({
          bg,
          transparent,
          sizesStr,
          iosWhiteOnly,
          maskableSafeBg,
          autoCrop,
          zoomPercent,
        })
      );
    } catch {
      // stockage indisponible (mode privé, quota atteint...): on ignore silencieusement
    }
  }, [
    bg,
    transparent,
    sizesStr,
    iosWhiteOnly,
    maskableSafeBg,
    autoCrop,
    zoomPercent,
  ]);

  const resetSettings = useCallback(() => {
    setBg(DEFAULT_SETTINGS.bg);
    setTransparent(DEFAULT_SETTINGS.transparent);
    setSizesStr(DEFAULT_SETTINGS.sizesStr);
    setIosWhiteOnly(DEFAULT_SETTINGS.iosWhiteOnly);
    setMaskableSafeBg(DEFAULT_SETTINGS.maskableSafeBg);
    setAutoCrop(DEFAULT_SETTINGS.autoCrop);
    setZoomPercent(DEFAULT_SETTINGS.zoomPercent);
    setError("");
    try {
      localStorage.removeItem("icongenSettings");
    } catch {
      // ignore
    }
  }, []);

  function parseSizes(input) {
    const parsed = String(input || "")
      .split(/[,\s]+/)
      .map((v) => parseInt(v, 10))
      .filter((n) => Number.isFinite(n) && n >= 8 && n <= 2048);
    const unique = Array.from(new Set(parsed));
    return unique.length ? unique : SIZES;
  }

  const generateZip = useCallback(async () => {
    const list = files && files.length ? files : file ? [file] : [];
    if (!list.length) return;
    setBusy(true);
    setError("");
    const sizes = parseSizes(sizesStr);
    // sizes + apple-touch x2 + favicon.ico + favicon.svg
    const total = list.length * (sizes.length + 4);
    let processed = 0;
    setProgress({ current: 0, total });
    try {
      const zip = new JSZip();
      for (const f of list) {
        try {
          const img = await imageBitmapFromFile(f);
          const cropRect = computeCropRect(img, autoCrop);
          const opts = { cropRect, zoomPercent };
          const baseName = (f.name || "image").replace(/\.[^.]+$/, "");
          const dir = list.length > 1 ? zip.folder(baseName) : zip;
          const useBg = transparent ? null : bg;
          for (const size of sizes) {
            const forceOpaqueForMaskable =
              transparent && maskableSafeBg && MASKABLE_SIZES.has(size);
            const sizeBg = forceOpaqueForMaskable ? bg || "#ffffff" : useBg;
            const c = canvasFromImage(img, size, sizeBg, opts);
            const blob = await new Promise((r) =>
              c.toBlob(r, "image/png", 0.92)
            );
            dir.file(`logo${size}.png`, blob);
            processed += 1;
            setProgress({ current: processed, total });
          }
          // iOS
          const iosBg = iosWhiteOnly ? "#ffffff" : useBg;
          const c180 = canvasFromImage(img, 180, iosBg, opts);
          dir.file(
            "apple-touch-icon.png",
            await new Promise((r) => c180.toBlob(r, "image/png", 0.92))
          );
          processed += 1;
          setProgress({ current: processed, total });

          const c192 = canvasFromImage(img, 192, iosBg, opts);
          dir.file(
            "apple-touch-icon-3d.png",
            await new Promise((r) => c192.toBlob(r, "image/png", 0.92))
          );
          processed += 1;
          setProgress({ current: processed, total });

          // favicon.ico multi-résolution (16/32/48) embarquant du PNG
          const icoBytes = await buildFaviconIco(img, useBg, opts);
          dir.file("favicon.ico", icoBytes);
          processed += 1;
          setProgress({ current: processed, total });

          // favicon.svg vectoriel (fallback moderne, préféré par les navigateurs)
          dir.file("favicon.svg", buildSvgFavicon(img, useBg, opts));
          processed += 1;
          setProgress({ current: processed, total });

          dir.file("SNIPPET_manifest.json", manifestSnippet);
          dir.file("SNIPPET_head.html", headSnippet);
          img.close?.();
        } catch (e) {
          throw new Error(
            `Échec du traitement de "${f.name}": ${e?.message || e}`
          );
        }
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(
        content,
        list.length > 1 ? "icons-pwa-batch.zip" : "icons-pwa.zip"
      );
    } catch (e) {
      setError(e?.message || "Une erreur est survenue pendant la génération.");
    } finally {
      setBusy(false);
      setProgress({ current: 0, total: 0 });
    }
  }, [
    files,
    file,
    bg,
    transparent,
    sizesStr,
    manifestSnippet,
    headSnippet,
    iosWhiteOnly,
    maskableSafeBg,
    autoCrop,
    zoomPercent,
  ]);

  return (
    <div ref={dropRef} style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <img
          src="/logo64.png"
          alt="IconGen"
          width={56}
          height={56}
          style={{ borderRadius: 8 }}
        />
        <h1 style={{ margin: 0 }}>IconGen PWA</h1>
      </div>
      <p style={{ color: "#9ca3af", marginTop: 0 }}>
        Charge une image carrée (512×512 recommandé). Fond non transparent
        conseillé pour iOS. Le ZIP inclut <code>favicon.ico</code> et{" "}
        <code>favicon.svg</code> générés automatiquement avec les autres
        icônes. Si le favicon te paraît trop petit/discret, le{" "}
        <strong>recadrage auto</strong> et le curseur <strong>Zoom</strong>{" "}
        ci-dessous permettent de faire remplir davantage le cadre par ton
        logo.
      </p>

      {error && (
        <div
          role="alert"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            background: "#3f1d1d",
            border: "1px solid #7f1d1d",
            color: "#fecaca",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
          }}
        >
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Fermer l'erreur">
            ✕
          </button>
        </div>
      )}

      <div
        onClick={handlePick}
        role="button"
        tabIndex={0}
        aria-label="Zone de dépôt d'image : cliquer ou glisser-déposer un fichier"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handlePick();
          }
        }}
        title="Dépose tes images ici ou clique pour sélectionner"
        style={{
          border: "1px dashed #333",
          borderRadius: 8,
          background: "#0b0b0b",
          padding: 20,
          marginBottom: 16,
          cursor: "pointer",
          textAlign: "center",
          color: "#9ca3af",
        }}
      >
        Dépose tes images ici ou clique pour sélectionner
        <div style={{ fontSize: 12, marginTop: 6 }}>
          Mode lot: actif (plusieurs fichiers acceptés)
        </div>
      </div>

      {thumbs.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: 10,
            overflowX: "auto",
            marginBottom: 16,
            paddingBottom: 4,
          }}
        >
          {thumbs.map((t) => (
            <button
              key={t.url}
              onClick={() => setFile(t.file)}
              title={t.file.name}
              aria-pressed={file === t.file}
              style={{
                flex: "0 0 auto",
                padding: 4,
                borderRadius: 8,
                border:
                  file === t.file ? "2px solid #3b82f6" : "1px solid #333",
                background: "#111",
                cursor: "pointer",
              }}
            >
              <img
                src={t.url}
                alt={t.file.name}
                width={48}
                height={48}
                style={{ borderRadius: 6, objectFit: "contain" }}
              />
            </button>
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <input
          ref={inputRef}
          style={{ display: "none" }}
          type="file"
          accept="image/*"
          multiple
          onChange={onInputChange}
        />
        <button onClick={handlePick} disabled={busy}>
          Choisir une image
        </button>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>Fond</span>
          <input
            type="color"
            value={bg}
            onChange={(e) => setBg(e.target.value)}
            disabled={transparent}
            aria-label="Couleur de fond personnalisée"
          />
        </label>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setBg(c);
                setTransparent(false);
              }}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border: "1px solid #333",
                background: c,
              }}
              title={c}
              aria-label={`Utiliser la couleur de fond ${c}`}
            />
          ))}
        </div>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          <span>Fond transparent</span>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={iosWhiteOnly}
            onChange={(e) => setIosWhiteOnly(e.target.checked)}
          />
          <span>Fond blanc iOS uniquement</span>
        </label>
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          title="Évite les icônes Android maskable transparentes (recommandé): 192/512 recevront un fond opaque même si 'Fond transparent' est coché."
        >
          <input
            type="checkbox"
            checked={maskableSafeBg}
            onChange={(e) => setMaskableSafeBg(e.target.checked)}
            disabled={!transparent}
          />
          <span>Fond opaque pour icônes maskable (192/512)</span>
        </label>
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          title="Retire automatiquement les marges vides/transparentes autour du logo pour qu'il remplisse mieux les petites icônes (favicon)."
        >
          <input
            type="checkbox"
            checked={autoCrop}
            onChange={(e) => setAutoCrop(e.target.checked)}
          />
          <span>Recadrage auto (retire les marges vides)</span>
        </label>
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          title="Zoom supplémentaire sur le logo (peut légèrement rogner les bords). Utile si le favicon reste trop petit après le recadrage auto."
        >
          <span>Zoom ({zoomPercent}%)</span>
          <input
            type="range"
            min={100}
            max={200}
            step={5}
            value={zoomPercent}
            onChange={(e) => setZoomPercent(Number(e.target.value))}
          />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>Tailles</span>
          <input
            type="text"
            value={sizesStr}
            onChange={(e) => setSizesStr(e.target.value)}
            placeholder="16,32,48,64,96,128,192,256,384,512"
            style={{
              width: 240,
              background: "#0b0b0b",
              color: "#e5e7eb",
              border: "1px solid #333",
              borderRadius: 6,
              padding: "6px 8px",
            }}
          />
        </label>
        <button onClick={generateZip} disabled={!file || busy}>
          {busy
            ? `Génération... (${progress.current}/${progress.total})`
            : "Générer ZIP"}
        </button>
        <button onClick={() => setPreviewOpen(true)} disabled={!file}>
          Aperçu iOS/Android
        </button>
        <button onClick={resetSettings} disabled={busy} title="Revenir aux réglages par défaut">
          Réinitialiser
        </button>
      </div>

      {previews.length > 0 && (
        <div
          style={{ display: "flex", gap: 24, marginTop: 24, alignItems: "end" }}
        >
          {previews.map((src, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <img
                src={src}
                alt="preview"
                style={{
                  width: [64, 192, 512][i],
                  height: [64, 192, 512][i],
                  borderRadius: 16,
                  background: "#111",
                  border: "1px solid #333",
                }}
              />
              <div style={{ color: "#9ca3af", marginTop: 8 }}>
                {[64, 192, 512][i]}x{[64, 192, 512][i]}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setPreviewOpen(false)}
        >
          <div
            style={{
              width: "min(1200px, 96vw)",
              height: "min(96vh, 980px)",
              background: "#0b0b0b",
              border: "1px solid #333",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
              display: "flex",
              flexDirection: "column",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 600 }}>Aperçu iOS / Android</div>
              <button onClick={() => setPreviewOpen(false)}>Fermer</button>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 16,
                flex: 1,
                overflow: "auto",
                paddingBottom: 8,
              }}
            >
              <div>
                <div style={{ color: "#9ca3af", marginBottom: 8 }}>
                  Android (maskable)
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {[192, 512].map((s, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div
                        style={{
                          position: "relative",
                          width: s / 2,
                          height: s / 2,
                        }}
                      >
                        <img
                          src={previews[i === 0 ? 1 : 2]}
                          alt="android"
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 24,
                            border: "1px solid #333",
                            background: "#111",
                          }}
                        />
                        {/* Zone de sécurité maskable (~80% central, cf. spécification Android) */}
                        <div
                          style={{
                            position: "absolute",
                            inset: "10%",
                            border: "1px dashed rgba(59,130,246,0.7)",
                            borderRadius: "50%",
                            pointerEvents: "none",
                          }}
                          title="Zone de sécurité maskable (~80%)"
                        />
                      </div>
                      <div style={{ color: "#9ca3af", marginTop: 6 }}>
                        {s} maskable
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ color: "#9ca3af", marginBottom: 8 }}>
                  iOS (apple-touch)
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 16,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {[180, 167, 152].map((s, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <img
                        src={previews[i === 0 ? 0 : 1]}
                        alt="ios"
                        style={{
                          width: s / 2,
                          height: s / 2,
                          borderRadius: 24,
                          border: "1px solid #333",
                          background: "#111",
                        }}
                      />
                      <div style={{ color: "#9ca3af", marginTop: 6 }}>{s}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                borderTop: "1px solid #222",
                paddingTop: 12,
              }}
            >
              <button onClick={generateZip} disabled={!file || busy}>
                {busy ? "Génération..." : "Télécharger ZIP"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <h3>Snippets à copier</h3>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        >
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>Manifest PWA</span>
              <CopyButton text={manifestSnippet} />
            </div>
            <textarea
              readOnly
              value={manifestSnippet}
              style={{
                minHeight: 200,
                background: "#0b0b0b",
                color: "#e5e7eb",
                border: "1px solid #333",
                borderRadius: 8,
                padding: 12,
                width: "100%",
              }}
            />
            <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>
              Utilité: déclare l’application PWA (nom, couleurs, icônes). À
              intégrer dans <code>vite.config.js</code> via
              <code>
                {" "}
                VitePWA({"{"} manifest: {"{...}"} {"}"})
              </code>{" "}
              ou dans
              <code> public/manifest.webmanifest</code> si tu n’utilises pas le
              plugin.
            </p>
          </div>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <span style={{ fontWeight: 600 }}>Balises &lt;head&gt;</span>
              <CopyButton text={headSnippet} />
            </div>
            <textarea
              readOnly
              value={headSnippet}
              style={{
                minHeight: 200,
                background: "#0b0b0b",
                color: "#e5e7eb",
                border: "1px solid #333",
                borderRadius: 8,
                padding: 12,
                width: "100%",
              }}
            />
            <p style={{ color: "#9ca3af", fontSize: 13, marginTop: 8 }}>
              Utilité: favicons d’onglet (16/32/48), favicon vectoriel
              <code> favicon.svg</code>, fallback
              <code> favicon.ico</code> et icônes iOS (
              <code>apple-touch-*</code>) utilisées par Safari iOS. À placer
              dans le &lt;head&gt; de
              <code> index.html</code> si tu intègres les icônes sur un autre
              site.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
