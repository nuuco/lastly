import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const MODEL_URL =
  "https://huggingface.co/litert-community/Gemma3-1B-IT/resolve/main/gemma3-1b-it-int4-web.task";
const MIN_BYTES = 500 * 1024 * 1024;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "public/models/gemma3-1b-it-int4-web.task");

function loadDotEnv() {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

loadDotEnv();
const token = process.env.HF_TOKEN?.trim();
const force = process.argv.includes("--force");

if (existsSync(dest) && !force) {
  const size = statSync(dest).size;
  if (size >= MIN_BYTES) {
    console.log(`이미 있음 ${dest} (${formatMb(size)}). 다시 받으려면 --force`);
    process.exit(0);
  }
  console.warn(`파일이 너무 작음 (${formatMb(size)}). 다시 받습니다.`);
}

if (!token) {
  console.error(`HF_TOKEN이 없습니다.
1) https://huggingface.co/google/gemma-3-1b-it 에서 라이선스 동의
2) https://huggingface.co/settings/tokens 에서 Read 토큰
3) .env.example을 .env로 복사하고 HF_TOKEN=hf_... 를 넣은 뒤
   npm run download:gemma`);
  process.exit(1);
}

await mkdir(path.dirname(dest), { recursive: true });
console.log("Gemma 웹 모델 받는 중… (약 700MB, Wi-Fi 권장)");

const response = await fetch(MODEL_URL, {
  headers: {
    Authorization: `Bearer ${token}`,
    "User-Agent": "lastly-download",
  },
  redirect: "follow",
});

if (!response.ok || !response.body) {
  const hint =
    response.status === 401 || response.status === 403
      ? "토큰이 없거나, google/gemma-3-1b-it 라이선스에 동의하지 않았습니다."
      : "";
  console.error(`다운로드 실패 HTTP ${response.status} ${response.statusText} ${hint}`.trim());
  process.exit(1);
}

const total = Number(response.headers.get("content-length") ?? 0);
let received = 0;
let lastLog = 0;
const reader = Readable.fromWeb(response.body);
reader.on("data", (chunk) => {
  received += chunk.length;
  const now = Date.now();
  if (now - lastLog < 1500) return;
  lastLog = now;
  const pct = total ? ` ${((received / total) * 100).toFixed(1)}%` : "";
  const of = total ? ` / ${formatMb(total)}` : "";
  console.log(`  ${formatMb(received)}${of}${pct}`);
});

await pipeline(reader, createWriteStream(dest));
const size = statSync(dest).size;
if (size < MIN_BYTES) {
  console.error(`받은 파일이 너무 작습니다 (${formatMb(size)}). 토큰·라이선스를 확인하세요.`);
  process.exit(1);
}
console.log(`완료 ${dest} (${formatMb(size)})`);
