import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import "./App.css";

const SIZES = [16, 32, 48, 64, 96, 128, 192, 256, 384, 512];

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
  const [file, setFile] = useState(null);
  const [bg, setBg] = useState("#ffffff");
  const [transparent, setTransparent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState([]);
  const inputRef = useRef(null);
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

  const onFile = useCallback(
    async (f) => {
      if (!f) return;
      setFile(f);
      // preview base
      const img = await imageBitmapFromFile(f);
      const pv = [64, 192, 512].map((s) =>
        canvasFromImage(img, s, transparent ? null : bg).toDataURL("image/png")
      );
      setPreviews(pv);
    },
    [bg, transparent]
  );

  const onInputChange = useCallback(
    (e) => onFile(e.target.files?.[0]),
    [onFile]
  );

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

  const generateZip = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    try {
      const img = await imageBitmapFromFile(file);
      const zip = new JSZip();
      const useBg = transparent ? null : bg;
      for (const size of SIZES) {
        const c = canvasFromImage(img, size, useBg);
        const blob = await new Promise((r) => c.toBlob(r, "image/png", 0.92));
        zip.file(`logo${size}.png`, blob);
      }
      // iOS
      const c180 = canvasFromImage(img, 180, useBg);
      zip.file(
        "apple-touch-icon.png",
        await new Promise((r) => c180.toBlob(r, "image/png", 0.92))
      );
      // copy for 167/152 (fallback 3d look handled by background)
      const c192 = canvasFromImage(img, 192, useBg);
      zip.file(
        "apple-touch-icon-3d.png",
        await new Promise((r) => c192.toBlob(r, "image/png", 0.92))
      );

      // snippets
      zip.file("SNIPPET_manifest.json", manifestSnippet);
      zip.file("SNIPPET_head.html", headSnippet);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, "icons-pwa.zip");
    } finally {
      setBusy(false);
    }
  }, [file, bg, transparent, manifestSnippet, headSnippet]);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
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
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />
          <span>Fond transparent</span>
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
