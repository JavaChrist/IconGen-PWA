import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "./App.css";

const SIZES = [16, 32, 48, 64, 96, 128, 192, 256, 384, 512];
const PRESET_COLORS = [
  "#000000",
  "#0b0b0b",
  "#111111",
  "#1f2937",
  "#ffffff",
  "#f5f5f5",
  "#3b82f6",
];

function canvasFromImage(img, size, background = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (background && background !== "transparent") {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }

  // contain fit
  const ratio = Math.min(size / img.width, size / img.height);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const x = Math.round((size - w) / 2);
  const y = Math.round((size - h) / 2);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, x, y, w, h);
  return canvas;
}

async function imageBitmapFromFile(file) {
  const arrayBuf = await file.arrayBuffer();
  const blob = new Blob([arrayBuf]);
  return await createImageBitmap(blob);
}

function App() {
  const [files, setFiles] = useState([]);
  const [file, setFile] = useState(null);
  const [bg, setBg] = useState("#ffffff");
  const [transparent, setTransparent] = useState(true);
  const [iosWhiteOnly, setIosWhiteOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [sizesStr, setSizesStr] = useState(SIZES.join(","));
  const [batchMode, setBatchMode] = useState(true);
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const manifestSnippet = useMemo(() => {
    return `{
	  "name": "IconGen PWA",
	  "short_name": "IconGen",
	  "theme_color": "#3b82f6",
	  "background_color": "#ffffff",
	  "display": "standalone",
	  "start_url": "/",
	  "icons": [
	    { "src": "/logo192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
	    { "src": "/logo512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
	  ]
	}`;
  }, []);

  const headSnippet = useMemo(() => {
    return `<!-- Theme & Icons -->
<meta name="theme-color" content="#3b82f6" />
<link rel="icon" type="image/png" sizes="16x16" href="/logo16.png" />
<link rel="icon" type="image/png" sizes="32x32" href="/logo32.png" />
<link rel="icon" type="image/png" sizes="48x48" href="/logo48.png" />
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="apple-touch-icon" sizes="167x167" href="/apple-touch-icon-3d.png" />
<link rel="apple-touch-icon" sizes="152x152" href="/apple-touch-icon-3d.png" />`;
  }, []);

  const handlePick = useCallback(() => inputRef.current?.click(), []);

  const onFiles = useCallback(
    async (list) => {
      const arr = Array.from(list || []).filter((f) =>
        f.type.startsWith("image/")
      );
      if (arr.length === 0) return;
      setFiles(arr);
      setFile(arr[0]);
      const img = await imageBitmapFromFile(arr[0]);
      const pv = [64, 192, 512].map((s) =>
        canvasFromImage(img, s, transparent ? null : bg).toDataURL("image/png")
      );
      setPreviews(pv);
    },
    [bg, transparent]
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

  // Met à jour les aperçus quand la couleur de fond ou la transparence change
  useEffect(() => {
    (async () => {
      if (!file) return;
      const img = await imageBitmapFromFile(file);
      const pv = [64, 192, 512].map((s) =>
        canvasFromImage(img, s, transparent ? null : bg).toDataURL("image/png")
      );
      setPreviews(pv);
    })();
  }, [bg, transparent, file]);

  // LocalStorage: charger
  useEffect(() => {
    try {
      const raw = localStorage.getItem("icongenSettings");
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.bg === "string") setBg(s.bg);
        if (typeof s.transparent === "boolean") setTransparent(s.transparent);
        if (typeof s.sizesStr === "string") setSizesStr(s.sizesStr);
      }
    } catch {}
  }, []);

  // LocalStorage: sauvegarder
  useEffect(() => {
    try {
      localStorage.setItem(
        "icongenSettings",
        JSON.stringify({ bg, transparent, sizesStr })
      );
    } catch {}
  }, [bg, transparent, sizesStr]);

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
    try {
      const sizes = parseSizes(sizesStr);
      const zip = new JSZip();
      for (const f of list) {
        // eslint-disable-next-line no-await-in-loop
        const img = await imageBitmapFromFile(f);
        const baseName = (f.name || "image").replace(/\.[^.]+$/, "");
        const dir = list.length > 1 ? zip.folder(baseName) : zip;
        const useBg = transparent ? null : bg;
        for (const size of sizes) {
          const c = canvasFromImage(img, size, useBg);
          // eslint-disable-next-line no-await-in-loop
          const blob = await new Promise((r) => c.toBlob(r, "image/png", 0.92));
          dir.file(`logo${size}.png`, blob);
        }
        // iOS
        const iosBg = iosWhiteOnly ? "#ffffff" : useBg;
        const c180 = canvasFromImage(img, 180, iosBg);
        dir.file(
          "apple-touch-icon.png",
          await new Promise((r) => c180.toBlob(r, "image/png", 0.92))
        );
        const c192 = canvasFromImage(img, 192, iosBg);
        dir.file(
          "apple-touch-icon-3d.png",
          await new Promise((r) => c192.toBlob(r, "image/png", 0.92))
        );
        dir.file("SNIPPET_manifest.json", manifestSnippet);
        dir.file("SNIPPET_head.html", headSnippet);
      }
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(
        content,
        list.length > 1 ? "icons-pwa-batch.zip" : "icons-pwa.zip"
      );
    } finally {
      setBusy(false);
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
        conseillé pour iOS.
      </p>
      <div
        onClick={handlePick}
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
          {busy ? "Génération..." : "Générer ZIP"}
        </button>
        <button onClick={() => setPreviewOpen(true)} disabled={!file}>
          Aperçu iOS/Android
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
                      <img
                        src={previews[i === 0 ? 1 : 2]}
                        alt="android"
                        style={{
                          width: s / 2,
                          height: s / 2,
                          borderRadius: 24,
                          border: "1px solid #333",
                          background: "#111",
                        }}
                      />
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
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Manifest PWA</div>
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
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Balises &lt;head&gt;
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
              Utilité: favicons d’onglet (16/32/48), fallback
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
