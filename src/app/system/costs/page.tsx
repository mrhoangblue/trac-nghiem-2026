"use client";

import { useState } from "react";
import { BarChart, Kpi, Panel, StateBox, fmtBytes, fmtCompact, fmtNum, useSystemData } from "@/components/system/ui";
import { Cpu, HardDrive, Image as ImageIcon, Sparkles } from "lucide-react";

interface Costs {
  totals: { aiCalls: number; inputTokens: number; outputTokens: number; storageBytes: number; files: number };
  teachers: Array<{ email: string; aiCalls: number; inputTokens: number; outputTokens: number; storageBytes: number; files: number }>;
  models: Array<{ model: string; calls: number; inputTokens: number; outputTokens: number }>;
  byDay: Array<{ day: string; calls: number; tokens: number }>;
}
const PRICE_KEY = "system-ai-price";

export default function SystemCostsPage() {
  const { data, error, loading, reload } = useSystemData<Costs>("/api/system/costs");
  // Đơn giá do quản trị tự nhập (USD cho 1 triệu token); chỉ lưu trên trình duyệt này.
  const [price, setPrice] = useState(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(PRICE_KEY) ?? "null") as { input?: string; output?: string } | null;
      return { input: stored?.input ?? "", output: stored?.output ?? "" };
    } catch {
      return { input: "", output: "" };
    }
  });
  const updatePrice = (next: { input: string; output: string }) => {
    setPrice(next);
    try { window.localStorage.setItem(PRICE_KEY, JSON.stringify(next)); } catch { /* bỏ qua */ }
  };
  const priceIn = Number(price.input.replace(",", "."));
  const priceOut = Number(price.output.replace(",", "."));
  const hasPrice = Number.isFinite(priceIn) && Number.isFinite(priceOut) && (priceIn > 0 || priceOut > 0);
  const cost = (input: number, output: number) => (input * priceIn + output * priceOut) / 1_000_000;
  const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!data) return <StateBox loading={loading} error={error} onRetry={reload} />;
  const { totals, teachers, models, byDay } = data;
  const maxTokens = Math.max(1, ...teachers.map((row) => row.inputTokens + row.outputTokens));
  const maxStorage = Math.max(1, ...teachers.map((row) => row.storageBytes));

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-extrabold text-gray-900">Chi phí và tài nguyên</h1>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Lượt chấm AI" value={fmtNum(totals.aiCalls)} icon={Sparkles} />
        <Kpi label="Token (vào / ra)" value={`${fmtCompact(totals.inputTokens)} / ${fmtCompact(totals.outputTokens)}`} icon={Cpu} footer={hasPrice ? <span className="text-xs font-semibold text-gray-600">≈ {usd(cost(totals.inputTokens, totals.outputTokens))}</span> : <span className="text-xs text-gray-400">nhập đơn giá để ước tính</span>} />
        <Kpi label="Dung lượng ảnh bài làm" value={fmtBytes(totals.storageBytes)} icon={HardDrive} />
        <Kpi label="Số trang đã nộp" value={fmtNum(totals.files)} icon={ImageIcon} />
      </div>

      <Panel title="Đơn giá AI (USD / 1 triệu token)">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {([["input", "Token vào"], ["output", "Token ra"]] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-gray-600">{label}
              <input inputMode="decimal" value={price[key]} onChange={(event) => updatePrice({ ...price, [key]: event.target.value })} placeholder="0" className="h-11 w-24 rounded-xl border border-gray-200 px-3 text-right tabular-nums outline-none focus:border-indigo-400" />
            </label>
          ))}
          <span className="text-xs text-gray-400">Lưu trên trình duyệt này</span>
        </div>
      </Panel>

      <Panel title="Lượt chấm AI · theo ngày"><BarChart points={byDay.length ? byDay.map((item) => ({ label: item.day, value: item.calls })) : [{ label: "—", value: 0 }]} color="#7c3aed" /></Panel>

      <Panel title="Theo giáo viên (chủ đề)" className="!p-0 overflow-hidden">
        {teachers.length === 0 ? <StateBox empty="Chưa có dữ liệu." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500"><tr><th className="px-4 py-2.5">Giáo viên</th><th className="px-3 py-2.5 text-right">Lượt AI</th><th className="w-52 px-3 py-2.5">Token</th>{hasPrice && <th className="px-3 py-2.5 text-right">Ước tính</th>}<th className="w-52 px-3 py-2.5">Dung lượng</th><th className="px-3 py-2.5 text-right">Trang</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {teachers.map((row) => (
                  <tr key={row.email}>
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-semibold text-gray-900">{row.email}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.aiCalls)}</td>
                    <td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-gray-100"><span className="block h-full rounded-full bg-violet-500" style={{ width: `${((row.inputTokens + row.outputTokens) / maxTokens) * 100}%` }} /></span><span className="w-14 text-right text-xs tabular-nums text-gray-600">{fmtCompact(row.inputTokens + row.outputTokens)}</span></div></td>
                    {hasPrice && <td className="px-3 py-2.5 text-right tabular-nums">{usd(cost(row.inputTokens, row.outputTokens))}</td>}
                    <td className="px-3 py-2.5"><div className="flex items-center gap-2"><span className="h-1.5 flex-1 rounded-full bg-gray-100"><span className="block h-full rounded-full bg-indigo-500" style={{ width: `${(row.storageBytes / maxStorage) * 100}%` }} /></span><span className="w-16 text-right text-xs tabular-nums text-gray-600">{fmtBytes(row.storageBytes)}</span></div></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.files)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {models.length > 0 && (
        <Panel title="Theo mô hình" className="!p-0 overflow-hidden">
          <table className="w-full text-sm"><tbody className="divide-y divide-gray-100">
            {models.map((row) => <tr key={row.model}><td className="px-4 py-2.5 font-semibold text-gray-900">{row.model}</td><td className="px-3 py-2.5 text-right tabular-nums">{fmtNum(row.calls)} lượt</td><td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{fmtCompact(row.inputTokens)} / {fmtCompact(row.outputTokens)}</td>{hasPrice && <td className="px-3 py-2.5 text-right tabular-nums">{usd(cost(row.inputTokens, row.outputTokens))}</td>}</tr>)}
          </tbody></table>
        </Panel>
      )}
    </div>
  );
}
