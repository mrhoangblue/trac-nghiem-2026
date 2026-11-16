// Rà file .tex đề online bằng đúng bộ hiển thị của website.
//   npm run check:latex -- "đường/dẫn/de-1.tex" ["de-2.tex" …]
// Thoát mã 0 khi mọi câu hiển thị đúng như nguồn; mã 1 khi còn chỗ phải sửa.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = process.argv.slice(2).map((file) => resolve(process.env.INIT_CWD ?? process.cwd(), file));
if (files.length === 0) {
  console.error('Cách dùng: npm run check:latex -- "đề-1.tex" ["đề-2.tex" …]');
  process.exit(2);
}
const missing = files.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error(`Không tìm thấy file:\n${missing.join("\n")}`);
  process.exit(2);
}

const run = spawnSync(process.execPath, [resolve(root, "node_modules/vitest/vitest.mjs"), "run", "tests/latexFileCheck.test.ts", "--reporter=verbose"], {
  cwd: root,
  env: { ...process.env, EXAM_TEX: JSON.stringify(files) },
  encoding: "utf8",
});
const lines = `${run.stdout}\n${run.stderr}`.split("\n").filter((line) => line.startsWith("│")).map((line) => line.slice(2));
console.log(lines.join("\n") || run.stdout || run.stderr);
console.log(run.status === 0 ? "\nKẾT QUẢ: ĐẠT" : "\nKẾT QUẢ: CHƯA ĐẠT — sửa các chỗ trên rồi chạy lại.");
process.exit(run.status === 0 ? 0 : 1);
