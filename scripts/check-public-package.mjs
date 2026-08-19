let input = "";
for await (const chunk of process.stdin) input += chunk;

const report = JSON.parse(input);
const files = report[0]?.files?.map(({ path }) => path) || [];
const forbidden = [
  /(^|\/)\.DS_Store$/,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)\.hallmark\//,
  /(^|\/)\.playwright-cli\//,
  /(^|\/)\.vercel\//,
  /(^|\/)exports\//,
  /(^|\/)output\//,
  /review-intelligence\.manifest\.json$/
];
const required = [
  "LICENSE",
  "NOTICE",
  "README.md",
  "SECURITY.md",
  "api/mcp.js",
  "plugins/review-intelligence/.codex-plugin/plugin.json",
  "web/index.html"
];

const leaked = files.filter((file) => forbidden.some((pattern) => pattern.test(file)));
const missing = required.filter((file) => !files.includes(file));

if (leaked.length || missing.length) {
  if (leaked.length) console.error(`Forbidden package files: ${leaked.join(", ")}`);
  if (missing.length) console.error(`Missing package files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Public package boundary verified (${files.length} files).`);
