#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function parseArgs() {
	const args = process.argv.slice(2);
	const options = { src: "", outDir: "public", background: null };
	for (let i = 0; i < args.length; i++) {
		const a = args[i];
		if (a === "--src" && args[i + 1]) options.src = args[++i];
		else if (a === "--out" && args[i + 1]) options.outDir = args[++i];
		else if (a === "--bg" && args[i + 1]) options.background = args[++i];
	}
	if (!options.src) {
		console.error("Usage: node scripts/generate-icons.mjs --src public/logo512.png [--out public] [--bg #ffffff]");
		process.exit(1);
	}
	return options;
}

function hexToRgba(hex) {
	if (!hex) return null;
	const m = hex.replace("#", "");
	const bigint = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
	return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255, alpha: 1 };
}

async function generate() {
	const { src, outDir, background } = parseArgs();
	const srcAbs = path.isAbsolute(src) ? src : path.resolve(projectRoot, src);
	const outAbs = path.isAbsolute(outDir) ? outDir : path.resolve(projectRoot, outDir);

	if (!fs.existsSync(srcAbs)) {
		console.error(`Source introuvable: ${srcAbs}`);
		process.exit(1);
	}
	if (!fs.existsSync(outAbs)) fs.mkdirSync(outAbs, { recursive: true });

	const bg = hexToRgba(background);
	const resizeOpts = (size) => ({
		width: size, height: size, fit: "contain",
		background: bg ?? { r: 255, g: 255, b: 255, alpha: 1 }
	});

	const targets = [
		{ name: "logo16.png", size: 16 },
		{ name: "logo32.png", size: 32 },
		{ name: "logo48.png", size: 48 },
		{ name: "logo64.png", size: 64 },
		{ name: "logo96.png", size: 96 },
		{ name: "logo128.png", size: 128 },
		{ name: "logo192.png", size: 192 },
		{ name: "logo256.png", size: 256 },
		{ name: "logo384.png", size: 384 },
		{ name: "logo512.png", size: 512 },
		{ name: "apple-touch-icon.png", size: 180 }
	];

	console.log(`Génération d'icônes depuis: ${srcAbs}`);
	const tasks = targets.map(async (t) => {
		const outFile = path.join(outAbs, t.name);
		await sharp(srcAbs).resize(resizeOpts(t.size)).png({ compressionLevel: 9, quality: 90 }).toFile(outFile);
		return outFile;
	});

	await Promise.all(tasks);
	fs.copyFileSync(path.join(outAbs, "logo192.png"), path.join(outAbs, "apple-touch-icon-3d.png"));
	console.log("Icônes générées dans:", outAbs);
}

generate().catch((err) => { console.error(err); process.exit(1); });


