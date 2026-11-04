/* build-df.js — concatenate src-df/*.js, inline three.js r160, emit the single file.
   usage: node build-df.js [out.html] [--stub=building,process,logistics,assembly,data]
*/
const fs = require("fs");
const path = require("path");

const root = __dirname;
const SRC = path.join(root, "src-df");
const files = [
  "10-util.js", "20-studio.js", "30-building.js", "40-process.js",
  "45-logistics.js", "50-assembly.js", "60-data.js", "70-post.js", "90-boot.js",
];
const builderFor = {
  "30-building.js": "buildBuilding",
  "40-process.js": "buildProcess",
  "45-logistics.js": "buildLogistics",
  "50-assembly.js": "buildAssembly",
  "60-data.js": "buildData",
};
const alias = {
  building: "30-building.js", process: "40-process.js", logistics: "45-logistics.js",
  assembly: "50-assembly.js", data: "60-data.js",
};

const args = process.argv.slice(2);
const outArg = args.find((a) => !a.startsWith("--")) || "digital-factory-3d.html";
const stubArg = args.find((a) => a.startsWith("--stub="));
const stubs = new Set((stubArg ? stubArg.slice(7) : "").split(",").filter(Boolean).map((s) => alias[s] || s));

function stubSource(file) {
  const b = builderFor[file];
  let code = "/* --- " + file + " is stubbed for this build --- */\nwindow." + b + " = function () {};\n";
  if (file === "60-data.js") {
    code += "window.DATA = { ready: false, setDataLayer: function () {}, setLabels: function () {}, focus: function () {}, clearFocus: function () {} };\n";
  }
  return code;
}

const chunks = [];
const report = [];
for (const f of files) {
  const p = path.join(SRC, f);
  if (stubs.has(f) || !fs.existsSync(p)) {
    chunks.push(stubSource(f));
    report.push(f + (fs.existsSync(p) ? " [stub]" : " [missing->stub]"));
  } else {
    chunks.push(fs.readFileSync(p, "utf8"));
    report.push(f + " " + fs.statSync(p).size + "B");
  }
}

let app = chunks.join("\n");
app = app.split("@@BT@@").join(String.fromCharCode(96));

const three = fs.readFileSync(path.join(root, "vendor", "three.classic.js"), "utf8");
const shell = fs.readFileSync(path.join(SRC, "shell.html"), "utf8");
const qs =
  '(function(){var q={};try{var s=location.search.replace(/^[?]/,"");s.split("&").forEach(function(kv){if(!kv)return;var p=kv.split("=");q[p[0]]=p.length>1?p[1]:"1";});}catch(e){}window.__Q__=q;})();';

if (!shell.includes("<!--THREE-->") || !shell.includes("<!--APP-->")) {
  console.error("shell.html is missing <!--THREE--> / <!--APP--> markers");
  process.exit(1);
}

const out = shell
  .replace("<!--THREE-->", "<script>\n" + three + "\n</" + "script>")
  .replace("<!--APP-->", "<script>\n" + qs + "\n" + app + "\n</" + "script>");

const outPath = path.isAbsolute(outArg) ? outArg : path.join(root, outArg);
fs.writeFileSync(outPath, out);
const bundleDir = path.join(root, "qa-df");
if (!fs.existsSync(bundleDir)) fs.mkdirSync(bundleDir, { recursive: true });
fs.writeFileSync(path.join(bundleDir, "app.bundle.js"), "(function(){\n" + app + "\n})();\n");

console.log("built " + outArg + "  html=" + out.length + "B  app=" + app.length + "B");
for (const r of report) console.log("  " + r);
