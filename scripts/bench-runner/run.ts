/**
 * 브라우저 말고 Node CPU에서 LFM이 도는지 확인한다.
 *
 *   npm run bench:models:node -- --limit=1
 *   npm run bench:models:node -- --limit=79
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { env, pipeline } from "@huggingface/transformers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (rel: string) =>
  pathToFileURL(path.join(root, "src", rel)).href;

const { FROZEN_NOW, GOLDEN_FIXTURES, resolveDateToken } = await import(
  src("recognition/evalFixtures.ts")
);
const { classifyUtterance } = await import(src("recognition/utteranceRules.ts"));
const { applyLfmSlots } = await import(src("recognition/parse.ts"));
const { parseIntent } = await import(src("recognition/intent.ts"));
const { todayKst } = await import(src("lib/kst.ts"));

env.allowLocalModels = false;

function arg(name: string, fallback: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function parseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "없음" || s === "none") return null;
  return s;
}

function generatedText(output: unknown): string {
  const first = Array.isArray(output) ? output[0] : output;
  const generated =
    first && typeof first === "object" && "generated_text" in first
      ? (first as { generated_text: unknown }).generated_text
      : first;
  if (Array.isArray(generated)) {
    const last = generated.at(-1);
    return typeof last === "object" && last && "content" in last
      ? String((last as { content: unknown }).content)
      : String(last ?? "");
  }
  return String(generated ?? "");
}

function extractMessages(text: string, today: string) {
  return [
    {
      role: "system",
      content:
        "한국어 생활 문장의 의도(조회/완료/예정/미완료/불확실)와 할일·날짜·주기를 JSON만으로 답하세요. 설명 금지.",
    },
    {
      role: "user",
      content: `오늘 날짜는 ${today} (한국 시간)입니다. 문장: "${text}"
intent: query=언제 했는지 물어봄, completed=한 일을 기록, planned=앞으로 할 예정, incomplete=못/안 함, uncertain=애매
action은 명사구만. 조회면 date는 null. 완료인데 날짜 없으면 오늘. 주기 없으면 interval은 null.
{"intent":"query","action":"시트 세탁","date":null,"interval":null}
{"intent":"completed","action":"빨래","date":"YYYY-MM-DD","interval":"2주마다"}`,
    },
  ];
}

function actionHit(got: string | null, fx: { action: string; actionAliases: string[] }) {
  if (!got) return false;
  const g = got.replace(/\s+/g, "");
  const candidates = [fx.action, ...fx.actionAliases].map((a) => a.replace(/\s+/g, ""));
  return candidates.some((c) => g.includes(c) || c.includes(g));
}

async function main() {
  const limit = Number(arg("limit", "1"));
  const fixtures = limit > 0 ? GOLDEN_FIXTURES.slice(0, limit) : GOLDEN_FIXTURES;
  const today = todayKst(FROZEN_NOW);
  const modelId = "onnx-community/LFM2.5-350M-ONNX";

  console.log(`Node LFM 벤치 · 문장 ${fixtures.length} · CPU`);
  console.log(`모델 로드 중… (${modelId})`);
  const tLoad = Date.now();
  const gen = await pipeline("text-generation", modelId, {
    dtype: "q4",
    device: "cpu",
  });
  console.log(`로드 완료 ${Date.now() - tLoad}ms`);

  let modelOk = 0;
  let mergedOk = 0;
  const rows: unknown[] = [];

  for (const [i, fx] of fixtures.entries()) {
    const t0 = Date.now();
    let raw = "";
    let error: string | null = null;
    try {
      const out = await gen(extractMessages(fx.text, today), {
        max_new_tokens: 120,
        temperature: 0,
      });
      raw = generatedText(out);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const json = parseJson(raw);
    const slots = {
      intent: parseIntent(json?.intent ?? json?.type),
      action: readString(json?.action),
      date: readString(json?.date),
      interval: readString(json?.interval),
    };
    const rules = classifyUtterance(fx.text, FROZEN_NOW);
    const merged = applyLfmSlots(fx.text, rules, slots, FROZEN_NOW);
    const expectDate = resolveDateToken(fx.dateToken, FROZEN_NOW);
    const modelHits = {
      intent: slots.intent === fx.utteranceType,
      action: actionHit(slots.action, fx),
      date: (slots.date ?? null) === expectDate,
    };
    const mergedHits = {
      intent: merged.utteranceType === fx.utteranceType,
      action: actionHit(merged.action, fx),
      date: (merged.date ?? null) === expectDate,
    };
    const mAll = modelHits.intent && modelHits.action && modelHits.date;
    const rAll = mergedHits.intent && mergedHits.action && mergedHits.date;
    if (mAll) modelOk += 1;
    if (rAll) mergedOk += 1;
    const mark = (h: { intent: boolean; action: boolean; date: boolean }) =>
      `${h.intent ? "O" : "x"}${h.action ? "O" : "x"}${h.date ? "O" : "x"}`;
    console.log(
      `${i + 1}/${fixtures.length} #${fx.id} 모델${mark(modelHits)} 규칙+모델${mark(mergedHits)} ${Date.now() - t0}ms ${fx.text}`,
    );
    if (raw) console.log(`  raw: ${raw.replace(/\s+/g, " ").slice(0, 120)}`);
    if (error) console.log(`  error: ${error}`);
    rows.push({
      id: fx.id,
      text: fx.text,
      raw,
      error,
      slots,
      merged: {
        utteranceType: merged.utteranceType,
        action: merged.action,
        date: merged.date,
      },
      modelHits,
      mergedHits,
      latencyMs: Date.now() - t0,
    });
  }

  const summary = [
    `n=${fixtures.length}`,
    `모델만 3축 ${modelOk}/${fixtures.length}`,
    `규칙+모델 3축 ${mergedOk}/${fixtures.length}`,
  ].join(" · ");
  console.log(summary);
  mkdirSync(path.join(root, "bench-out"), { recursive: true });
  writeFileSync(
    path.join(root, "bench-out", "lfm-node.json"),
    JSON.stringify({ modelId, device: "cpu", summary, rows }, null, 2),
  );
  writeFileSync(path.join(root, "bench-out", "last-run.txt"), summary + "\n");
  console.log("끝 · bench-out/lfm-node.json");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
