#!/usr/bin/env node
import fs from "node:fs";
import pngToIco from "png-to-ico";

const pngs = ["public/logo16.png", "public/logo32.png", "public/logo48.png"];
const out = "public/favicon.ico";

(async () => {
	try {
		const buf = await pngToIco(pngs);
		fs.writeFileSync(out, buf);
		console.log("favicon.ico généré:", out);
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
})();


