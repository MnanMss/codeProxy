import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Activity,
  ChartSpline,
  Coins,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageData } from "@/lib/http/types";
import {
  computeKpiMetrics,
  filterUsageByDays,
  formatNumber,
  formatRate,
  iterateUsageRecords,
} from "@/modules/monitor/monitor-utils";
import { AnimatedNumber } from "@/modules/ui/AnimatedNumber";
import { TextInput } from "@/modules/ui/Input";
import { Reveal } from "@/modules/ui/Reveal";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import { useTheme } from "@/modules/ui/ThemeProvider";

type TimeRange = 1 | 7 | 14 | 30;
type HourWindow = 6 | 12 | 24;

const TIME_RANGES: readonly TimeRange[] = [1, 7, 14, 30] as const;
const HOUR_WINDOWS: readonly HourWindow[] = [6, 12, 24] as const;

const createEmptyUsage = (): UsageData => ({ apis: {} });

const CHART_COLORS: string[] = [
  "#60a5fa",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#818cf8",
  "#2dd4bf",
  "#22d3ee",
  "#a3e635",
  "#f472b6",
];

const HOURLY_MODEL_COLORS: string[] = [
  "rgba(110,231,183,0.88)",
  "rgba(196,181,253,0.88)",
  "rgba(252,211,77,0.88)",
  "rgba(249,168,212,0.88)",
  "rgba(94,234,212,0.88)",
  "rgba(148,163,184,0.58)",
];

const CHART_COLOR_CLASSES: readonly string[] = [
  "bg-blue-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
  "bg-indigo-400",
  "bg-teal-400",
  "bg-cyan-400",
  "bg-lime-400",
  "bg-pink-400",
] as const;

const formatCompact = (value: number): string => {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);

  const compact = (divisor: number, suffix: string) => {
    const raw = value / divisor;
    const fixed = raw.toFixed(1);
    const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
    return `${trimmed}${suffix}`;
  };

  if (abs >= 1_000_000_000) return compact(1_000_000_000, "b");
  if (abs >= 1_000_000) return compact(1_000_000, "m");
  if (abs >= 1_000) return compact(1_000, "k");
  return formatNumber(value);
};

const formatLocalDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMonthDay = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
};

const KpiCard = ({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: ReactNode;
  hint: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}) => {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-white/55">
        <Icon size={14} className="text-slate-900 dark:text-white" />
        <span>{title}</span>
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-600 dark:text-white/65">{hint}</p>
    </article>
  );
};

const TimeRangeSelector = ({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (next: TimeRange) => void;
}) => {
  return (
    <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
      {TIME_RANGES.map((range) => {
        const active = value === range;
        const label = range === 1 ? "今天" : `${range} 天`;
        return (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={
              active
                ? "rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                : "rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

const HourWindowSelector = ({
  value,
  onChange,
}: {
  value: HourWindow;
  onChange: (next: HourWindow) => void;
}) => {
  return (
    <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
      {HOUR_WINDOWS.map((range) => {
        const active = value === range;
        return (
          <button
            key={range}
            type="button"
            onClick={() => onChange(range)}
            className={
              active
                ? "rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                : "rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            }
          >
            最近{range}小时
          </button>
        );
      })}
    </div>
  );
};

const Card = ({
  title,
  description,
  actions,
  loading = false,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}) => {
  return (
    <section
      className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
      aria-busy={loading}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {description ? (
            <p className="text-xs text-slate-600 dark:text-white/65">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className="relative mt-4 min-w-0">
        {children}
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/65 backdrop-blur-sm dark:bg-neutral-950/45">
            <div
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/80"
            >
              <span
                className="h-4 w-4 rounded-full border-2 border-slate-300/80 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/85"
                aria-hidden="true"
              />
              <span className="tabular-nums">加载中…</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export function MonitorPage() {
  const {
    state: { mode },
  } = useTheme();
  const isDark = mode === "dark";

  const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
    "输入 Token": true,
    "输出 Token": true,
    请求数: true,
  });

  const [hourlyModelSelected, setHourlyModelSelected] = useState<Record<string, boolean>>({
    总请求: true,
  });

  const [hourlyTokenSelected, setHourlyTokenSelected] = useState<Record<string, boolean>>({
    输入: true,
    输出: true,
    推理: true,
    缓存: true,
    "总 Token": true,
  });

  const [rawUsage, setRawUsage] = useState<UsageData>(createEmptyUsage);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilterInput, setApiFilterInput] = useState("");
  const [apiFilter, setApiFilter] = useState("");
  const [modelHourWindow, setModelHourWindow] = useState<HourWindow>(24);
  const [tokenHourWindow, setTokenHourWindow] = useState<HourWindow>(24);
  const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const usageData = await usageApi.getUsage();
      startTransition(() => {
        setRawUsage(usageData);
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "数据获取失败";
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const filteredUsage = useMemo(() => {
    return filterUsageByDays(rawUsage, timeRange, apiFilter);
  }, [rawUsage, timeRange, apiFilter]);

  const metrics = useMemo(() => computeKpiMetrics(filteredUsage), [filteredUsage]);

  const records = useMemo(() => iterateUsageRecords(filteredUsage), [filteredUsage]);

  const applyFilter = useCallback(() => {
    setApiFilter(apiFilterInput);
  }, [apiFilterInput]);

  const toggleDailyLegend = useCallback((key: string) => {
    if (key !== "输入 Token" && key !== "输出 Token" && key !== "请求数") return;
    setDailyLegendSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const toggleHourlyModelLegend = useCallback((key: string) => {
    setHourlyModelSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const toggleHourlyTokenLegend = useCallback((key: string) => {
    setHourlyTokenSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const hasData = metrics.requestCount > 0;
  const isLoading = isRefreshing || isPending;

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const modelTotals = useMemo(() => {
    const byModel = new Map<string, { requests: number; tokens: number }>();
    records.forEach((record) => {
      const current = byModel.get(record.model) ?? { requests: 0, tokens: 0 };
      byModel.set(record.model, {
        requests: current.requests + 1,
        tokens: current.tokens + (record.tokens?.total_tokens ?? 0),
      });
    });

    return [...byModel.entries()]
      .map(([model, value]) => ({ model, ...value }))
      .sort(
        (left, right) => right.requests - left.requests || left.model.localeCompare(right.model),
      );
  }, [records]);

  const sortedModelsByMetric = useMemo(() => {
    const list = [...modelTotals];
    list.sort((left, right) => {
      const leftValue = modelMetric === "requests" ? left.requests : left.tokens;
      const rightValue = modelMetric === "requests" ? right.requests : right.tokens;
      return rightValue - leftValue || left.model.localeCompare(right.model);
    });
    return list;
  }, [modelMetric, modelTotals]);

  const topModelKeys = useMemo(
    () => sortedModelsByMetric.slice(0, 5).map((item) => item.model),
    [sortedModelsByMetric],
  );

  const modelDistributionData = useMemo(() => {
    const top = sortedModelsByMetric.slice(0, 10);
    const otherValue = sortedModelsByMetric.slice(10).reduce((acc, item) => {
      return acc + (modelMetric === "requests" ? item.requests : item.tokens);
    }, 0);

    const data = top.map((item) => ({
      name: item.model,
      value: modelMetric === "requests" ? item.requests : item.tokens,
    }));

    if (otherValue > 0) {
      data.push({ name: "其他", value: otherValue });
    }
    return data;
  }, [modelMetric, sortedModelsByMetric]);

  const dailySeries = useMemo(() => {
    const byDay = new Map<
      string,
      { requests: number; inputTokens: number; outputTokens: number }
    >();

    records.forEach((record) => {
      const date = new Date(record.timestamp);
      if (!Number.isFinite(date.getTime())) return;
      const key = formatLocalDateKey(date);
      const current = byDay.get(key) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      byDay.set(key, {
        requests: current.requests + 1,
        inputTokens: current.inputTokens + (record.tokens?.input_tokens ?? 0),
        outputTokens: current.outputTokens + (record.tokens?.output_tokens ?? 0),
      });
    });

    const today = new Date();
    const points = Array.from({ length: timeRange }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (timeRange - 1 - index));
      const key = formatLocalDateKey(date);
      const label = formatMonthDay(date);
      const value = byDay.get(key) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      return { label, ...value, totalTokens: value.inputTokens + value.outputTokens };
    });

    return points;
  }, [records, timeRange]);

  const hourlySeries = useMemo(() => {
    const hourWindow = 24;
    const now = Date.now();
    const endHour = Math.floor(now / 3_600_000);
    const startHour = endHour - hourWindow + 1;

    const hourLabels = Array.from({ length: hourWindow }).map((_, index) => {
      const hour = startHour + index;
      const date = new Date(hour * 3_600_000);
      const label = `${String(date.getHours()).padStart(2, "0")}:00`;
      return { hour, label };
    });

    const modelBuckets = new Map<number, Map<string, number>>();
    const tokenBuckets = new Map<
      number,
      { input: number; output: number; reasoning: number; cached: number }
    >();

    records.forEach((record) => {
      const ts = new Date(record.timestamp).getTime();
      if (!Number.isFinite(ts)) return;
      const hour = Math.floor(ts / 3_600_000);
      if (hour < startHour || hour > endHour) return;

      const modelMap = modelBuckets.get(hour) ?? new Map<string, number>();
      modelMap.set(record.model, (modelMap.get(record.model) ?? 0) + 1);
      modelBuckets.set(hour, modelMap);

      const tokens = tokenBuckets.get(hour) ?? { input: 0, output: 0, reasoning: 0, cached: 0 };
      tokenBuckets.set(hour, {
        input: tokens.input + (record.tokens?.input_tokens ?? 0),
        output: tokens.output + (record.tokens?.output_tokens ?? 0),
        reasoning: tokens.reasoning + (record.tokens?.reasoning_tokens ?? 0),
        cached: tokens.cached + (record.tokens?.cached_tokens ?? 0),
      });
    });

    const modelKeys = [...topModelKeys, "其他"];

    const modelPoints = hourLabels.map(({ hour, label }) => {
      const map = modelBuckets.get(hour) ?? new Map<string, number>();
      const stacks = modelKeys.map((key) => {
        if (key === "其他") {
          const sum = [...map.entries()].reduce((acc, [model, value]) => {
            return topModelKeys.includes(model) ? acc : acc + value;
          }, 0);
          return { key, value: sum };
        }
        return { key, value: map.get(key) ?? 0 };
      });
      return { label, stacks };
    });

    const tokenKeys = ["输入", "输出", "推理", "缓存"] as const;

    const tokenPoints = hourLabels.map(({ hour, label }) => {
      const totals = tokenBuckets.get(hour) ?? { input: 0, output: 0, reasoning: 0, cached: 0 };
      const stacks = [
        { key: "输入", value: totals.input },
        { key: "输出", value: totals.output },
        { key: "推理", value: totals.reasoning },
        { key: "缓存", value: totals.cached },
      ];
      return { label, stacks };
    });

    return { modelKeys, modelPoints, tokenKeys: [...tokenKeys], tokenPoints };
  }, [records, topModelKeys]);

  const hourlyModelPalette = useMemo(() => {
    const palette = ["bg-emerald-400", "bg-violet-400", "bg-amber-400", "bg-pink-300", "bg-teal-400"];
    const colorByKey: Record<string, string> = {};
    const classByKey: Record<string, string> = {};

    hourlySeries.modelKeys.forEach((key, index) => {
      if (key === "其他") {
        colorByKey[key] = "rgba(148,163,184,0.58)";
        classByKey[key] = "bg-slate-400";
        return;
      }
      colorByKey[key] = HOURLY_MODEL_COLORS[index % HOURLY_MODEL_COLORS.length];
      classByKey[key] = palette[index % palette.length] ?? "bg-slate-400";
    });

    colorByKey["总请求"] = "#3b82f6";
    classByKey["总请求"] = "bg-blue-500";

    return { colorByKey, classByKey };
  }, [hourlySeries.modelKeys]);

  const hourlyTokenPalette = useMemo(() => {
    return {
      colorByKey: {
        输入: "rgba(110,231,183,0.88)",
        输出: "rgba(196,181,253,0.88)",
        推理: "rgba(252,211,77,0.88)",
        缓存: "rgba(94,234,212,0.88)",
        "总 Token": "#3b82f6",
      } as Record<string, string>,
      classByKey: {
        输入: "bg-emerald-400",
        输出: "bg-violet-400",
        推理: "bg-amber-400",
        缓存: "bg-teal-400",
        "总 Token": "bg-blue-500",
      } as Record<string, string>,
    };
  }, []);

  useEffect(() => {
    setHourlyModelSelected((prev) => {
      const next = { ...prev };
      for (const key of hourlySeries.modelKeys) {
        if (!(key in next)) next[key] = true;
      }
      if (!("总请求" in next)) next["总请求"] = true;
      return next;
    });
  }, [hourlySeries.modelKeys]);

  useEffect(() => {
    setHourlyTokenSelected((prev) => {
      const next = { ...prev };
      for (const key of hourlySeries.tokenKeys) {
        if (!(key in next)) next[key] = true;
      }
      if (!("总 Token" in next)) next["总 Token"] = true;
      return next;
    });
  }, [hourlySeries.tokenKeys]);

  const modelDistributionOption = useMemo(() => {
    return {
      backgroundColor: "transparent",
      color: [...CHART_COLORS, "#94a3b8"],
      tooltip: {
        trigger: "item",
        renderMode: "html",
        appendToBody: true,
        confine: true,
        borderWidth: 0,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        textStyle: { color: "#fff" },
        extraCssText: "z-index: 10000;",
        formatter: (params: { name: string; value: number; percent: number }) => {
          const valueLabel = formatCompact(params.value ?? 0);
          return `${params.name}<br/>${valueLabel}（${(params.percent ?? 0).toFixed(1)}%）`;
        },
      },
      series: [
        {
          name: "模型",
          type: "pie",
          radius: ["52%", "72%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: {
            borderRadius: 3,
            borderWidth: 2,
            borderColor: isDark ? "rgba(10,10,10,0.75)" : "rgba(255,255,255,0.92)",
          },
          emphasis: { scale: true, scaleSize: 6 },
          data: modelDistributionData,
        },
      ],
      animationEasing: "cubicOut" as const,
      animationDuration: 520,
      animationDurationUpdate: 360,
    };
  }, [isDark, modelDistributionData]);

  const dailyLegendAvailability = useMemo(() => {
    const points = dailySeries.filter(
      (item) => item.requests > 0 || item.inputTokens > 0 || item.outputTokens > 0,
    );
    const visiblePoints = points.length > 0 ? points : dailySeries;
    const requestY = visiblePoints.map((item) => item.requests);
    const inputY = visiblePoints.map((item) => item.inputTokens);
    const outputY = visiblePoints.map((item) => item.outputTokens);

    return {
      hasInput: inputY.some((value) => value > 0),
      hasOutput: outputY.some((value) => value > 0),
      hasRequests: requestY.some((value) => value > 0),
    };
  }, [dailySeries]);

  const modelDistributionLegend = useMemo(() => {
    const total = modelDistributionData.reduce(
      (acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0),
      0,
    );

    return modelDistributionData.map((item, index) => {
      const colorClass =
        index < CHART_COLOR_CLASSES.length ? CHART_COLOR_CLASSES[index] : "bg-slate-400";
      const value = Number(item.value ?? 0);
      const percent = total > 0 ? (value / total) * 100 : 0;

      return {
        name: item.name,
        valueLabel: formatCompact(value),
        percentLabel: `${percent.toFixed(1)}%`,
        colorClass,
      };
    });
  }, [modelDistributionData]);

  const dailyTrendOption = useMemo(() => {
    const points = dailySeries.filter(
      (item) => item.requests > 0 || item.inputTokens > 0 || item.outputTokens > 0,
    );
    const visiblePoints = points.length > 0 ? points : dailySeries;

    const x = visiblePoints.map((item) => item.label);
    const requestY = visiblePoints.map((item) => item.requests);
    const inputY = visiblePoints.map((item) => item.inputTokens);
    const outputY = visiblePoints.map((item) => item.outputTokens);
    const tokenTotals = visiblePoints.map((item) => item.inputTokens + item.outputTokens);

    const formatTokenCompact = (value: number) => {
      const abs = Math.abs(value);
      if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
      return String(Math.round(value));
    };

    const visibleCount = visiblePoints.length;
    const barMaxWidth =
      visibleCount <= 1
        ? 56
        : visibleCount <= 3
          ? 44
          : visibleCount <= 7
            ? 36
            : visibleCount <= 14
              ? 28
              : 18;

    const hasInput = inputY.some((value) => value > 0);
    const hasOutput = outputY.some((value) => value > 0);
    const hasRequests = requestY.some((value) => value > 0);

    const showInput = hasInput && (dailyLegendSelected["输入 Token"] ?? true);
    const showOutput = hasOutput && (dailyLegendSelected["输出 Token"] ?? true);
    const showRequests = hasRequests && (dailyLegendSelected["请求数"] ?? true);

    const tokenAxisAnchor =
      showInput || showOutput
        ? visiblePoints.map((item) => {
            const candidates: number[] = [];
            if (showInput) candidates.push(item.inputTokens);
            if (showOutput) candidates.push(item.outputTokens);
            return candidates.length > 0 ? Math.max(...candidates) : 0;
          })
        : tokenTotals;

    const requestAxisAnchor = showRequests ? requestY : requestY.map(() => 0);

    const tokenAxisMaxRaw = tokenAxisAnchor.reduce((acc, value) => Math.max(acc, value), 0);
    const requestAxisMaxRaw = requestAxisAnchor.reduce((acc, value) => Math.max(acc, value), 0);
    const tokenAxisMax = Math.max(1, Math.ceil(tokenAxisMaxRaw * 1.1));
    const requestAxisMax = Math.max(1, Math.ceil(requestAxisMaxRaw * 1.1));

    const series: Array<Record<string, unknown>> = [];
    const inputSeries = showInput
      ? {
          name: "输入 Token",
          type: "bar",
          yAxisIndex: 0,
          barMaxWidth,
          itemStyle: { borderRadius: 0, color: "rgba(196,181,253,0.88)" },
          emphasis: { focus: "series" },
          data: inputY,
        }
      : null;

    const outputSeries = showOutput
      ? {
          name: "输出 Token",
          type: "bar",
          yAxisIndex: 0,
          barMaxWidth,
          itemStyle: { borderRadius: [4, 4, 0, 0], color: "rgba(110,231,183,0.88)" },
          emphasis: { focus: "series" },
          data: outputY,
        }
      : null;

    if (inputSeries && outputSeries) {
      const inputMax = inputY.reduce((acc, value) => Math.max(acc, value), 0);
      const outputMax = outputY.reduce((acc, value) => Math.max(acc, value), 0);
      const inputSum = inputY.reduce((acc, value) => acc + value, 0);
      const outputSum = outputY.reduce((acc, value) => acc + value, 0);
      const inputSmaller = inputMax === outputMax ? inputSum <= outputSum : inputMax <= outputMax;
      const front = inputSmaller ? inputSeries : outputSeries;
      const back = inputSmaller ? outputSeries : inputSeries;
      series.push({ ...back, z: 2 });
      series.push({ ...front, z: 3, barGap: "-100%" });
    } else if (inputSeries) {
      series.push({ ...inputSeries, z: 2 });
    } else if (outputSeries) {
      series.push({ ...outputSeries, z: 2 });
    }

    if (showRequests) {
      series.push({
        name: "请求数",
        type: "line",
        yAxisIndex: 1,
        smooth: true,
        symbol: "circle",
        symbolSize: 7,
        lineStyle: { width: 3, color: "#3b82f6" },
        itemStyle: { color: "#3b82f6" },
        data: requestY,
        z: 10,
      });
    }

    series.push({
      name: "__token_axis__",
      type: "line",
      yAxisIndex: 0,
      data: tokenAxisAnchor,
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      lineStyle: { opacity: 0 },
      itemStyle: { opacity: 0 },
    });

    series.push({
      name: "__request_axis__",
      type: "line",
      yAxisIndex: 1,
      data: requestAxisAnchor,
      showSymbol: false,
      silent: true,
      tooltip: { show: false },
      emphasis: { disabled: true },
      lineStyle: { opacity: 0 },
      itemStyle: { opacity: 0 },
    });

    return {
      backgroundColor: "transparent",
      color: ["rgba(196,181,253,0.88)", "rgba(110,231,183,0.88)", "#3b82f6"],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        renderMode: "html",
        appendToBody: true,
        confine: true,
        borderWidth: 0,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        textStyle: { color: "#fff" },
        extraCssText: "z-index: 10000;",
      },
      legend: {
        show: false,
      },
      grid: { left: 74, right: 74, top: 18, bottom: 78 },
      xAxis: {
        type: "category",
        data: x,
        axisTick: { show: false },
        axisLabel: { margin: 34, hideOverlap: true },
        axisLine: {
          lineStyle: { color: isDark ? "rgba(255,255,255,0.16)" : "rgba(148, 163, 184, 0.55)" },
        },
      },
      yAxis: [
        {
          type: "value",
          name: "Token",
          min: 0,
          max: tokenAxisMax,
          nameLocation: "middle",
          nameRotate: 90,
          nameGap: 58,
          nameTextStyle: { fontWeight: 600 },
          axisLabel: {
            formatter: (value: number) => formatTokenCompact(value),
            margin: 12,
            width: 56,
            overflow: "truncate",
          },
          splitNumber: 4,
          splitLine: {
            lineStyle: { color: isDark ? "rgba(255,255,255,0.08)" : "rgba(148, 163, 184, 0.25)" },
          },
        },
        {
          type: "value",
          name: "请求数",
          min: 0,
          max: requestAxisMax,
          nameLocation: "middle",
          nameRotate: 270,
          nameGap: 58,
          nameTextStyle: { fontWeight: 600 },
          axisLabel: {
            formatter: (value: number) => formatNumber(value),
            margin: 12,
            width: 56,
            overflow: "truncate",
          },
          splitNumber: 4,
          splitLine: { show: false },
        },
      ],
      series,
      animationEasing: "cubicOut" as const,
      animationDuration: 520,
      animationDurationUpdate: 360,
    };
  }, [dailyLegendSelected, dailySeries, isDark, timeRange]);

  const hourlyModelOption = useMemo(() => {
    const points = hourlySeries.modelPoints.slice(-modelHourWindow);
    const x = points.map((point) => point.label);
    const barMaxWidth = modelHourWindow <= 6 ? 44 : modelHourWindow <= 12 ? 32 : 24;

    const selectedKeys = hourlySeries.modelKeys.filter((key) => hourlyModelSelected[key] ?? true);
    const showTotalLine = hourlyModelSelected["总请求"] ?? true;

    const series = selectedKeys.map((key) => {
      const data = points.map((point) => {
        const item = point.stacks.find((stack) => stack.key === key);
        return item?.value ?? 0;
      });
      return {
        name: key,
        type: "bar",
        stack: "requests",
        emphasis: { focus: "series" },
        barMaxWidth,
        itemStyle: { borderRadius: 0, color: hourlyModelPalette.colorByKey[key] ?? "rgba(148,163,184,0.58)" },
        data,
      };
    });

    const totals = points.map((point) =>
      point.stacks.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0),
    );

    const totalLineColor = "#3b82f6";
    const selectedSums = points.map((point) =>
      point.stacks.reduce((acc, item) => {
        if (!selectedKeys.includes(item.key)) return acc;
        return acc + (Number.isFinite(item.value) ? item.value : 0);
      }, 0),
    );

    const yAxisMaxRaw = Math.max(
      selectedSums.reduce((acc, value) => Math.max(acc, value), 0),
      showTotalLine ? totals.reduce((acc, value) => Math.max(acc, value), 0) : 0,
    );
    const yAxisMax = Math.max(1, Math.ceil(yAxisMaxRaw * 1.1));

    return {
      backgroundColor: "transparent",
      color: HOURLY_MODEL_COLORS,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        renderMode: "html",
        appendToBody: true,
        confine: true,
        borderWidth: 0,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        textStyle: { color: "#fff" },
        extraCssText: "z-index: 10000;",
      },
      legend: {
        show: false,
      },
      grid: { left: 74, right: 74, top: 18, bottom: 78 },
      xAxis: {
        type: "category",
        data: x,
        axisTick: { show: false },
        axisLabel: { margin: 34, hideOverlap: true },
        axisLine: {
          lineStyle: { color: isDark ? "rgba(255,255,255,0.16)" : "rgba(148, 163, 184, 0.55)" },
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: yAxisMax,
        splitNumber: 4,
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
          margin: 12,
          width: 56,
          overflow: "truncate",
        },
        splitLine: {
          lineStyle: { color: isDark ? "rgba(255,255,255,0.08)" : "rgba(148, 163, 184, 0.25)" },
        },
      },
      series: [
        ...series,
        ...(showTotalLine
          ? [
              {
                name: "总请求",
                type: "line",
                smooth: true,
                symbol: "circle",
                symbolSize: 6,
                lineStyle: { width: 3, color: totalLineColor },
                itemStyle: { color: totalLineColor },
                emphasis: { focus: "series" },
                data: totals,
                z: 10,
              },
            ]
          : []),
        {
          name: "__axis__",
          type: "line",
          data: showTotalLine ? totals : selectedSums,
          showSymbol: false,
          silent: true,
          tooltip: { show: false },
          emphasis: { disabled: true },
          lineStyle: { opacity: 0 },
          itemStyle: { opacity: 0 },
        },
      ],
      animationEasing: "cubicOut" as const,
      animationDuration: 520,
      animationDurationUpdate: 360,
    };
  }, [
    hourlyModelPalette.colorByKey,
    hourlyModelSelected,
    hourlySeries.modelKeys,
    hourlySeries.modelPoints,
    isDark,
    modelHourWindow,
  ]);

  const hourlyTokenOption = useMemo(() => {
    const points = hourlySeries.tokenPoints.slice(-tokenHourWindow);
    const x = points.map((point) => point.label);
    const barMaxWidth = tokenHourWindow <= 6 ? 44 : tokenHourWindow <= 12 ? 32 : 24;

    const selectedKeys = hourlySeries.tokenKeys.filter((key) => hourlyTokenSelected[key] ?? true);
    const showTotalLine = hourlyTokenSelected["总 Token"] ?? true;

    const series = selectedKeys.map((key) => {
      const data = points.map((point) => {
        const item = point.stacks.find((stack) => stack.key === key);
        return item?.value ?? 0;
      });
      return {
        name: key,
        type: "bar",
        stack: "tokens",
        emphasis: { focus: "series" },
        barMaxWidth,
        itemStyle: { color: hourlyTokenPalette.colorByKey[key] ?? "rgba(148,163,184,0.58)", borderRadius: 0 },
        data,
      };
    });

    const totals = points.map((point) =>
      point.stacks.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0),
    );
    const totalLineColor = "#3b82f6";
    const selectedSums = points.map((point) =>
      point.stacks.reduce((acc, item) => {
        if (!selectedKeys.includes(item.key as (typeof hourlySeries.tokenKeys)[number])) return acc;
        return acc + (Number.isFinite(item.value) ? item.value : 0);
      }, 0),
    );

    const yAxisMaxRaw = Math.max(
      selectedSums.reduce((acc, value) => Math.max(acc, value), 0),
      showTotalLine ? totals.reduce((acc, value) => Math.max(acc, value), 0) : 0,
    );
    const yAxisMax = Math.max(1, Math.ceil(yAxisMaxRaw * 1.1));

    return {
      backgroundColor: "transparent",
      color: [
        hourlyTokenPalette.colorByKey["输入"],
        hourlyTokenPalette.colorByKey["输出"],
        hourlyTokenPalette.colorByKey["推理"],
        hourlyTokenPalette.colorByKey["缓存"],
      ],
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        renderMode: "html",
        appendToBody: true,
        confine: true,
        borderWidth: 0,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        textStyle: { color: "#fff" },
        extraCssText: "z-index: 10000;",
      },
      legend: {
        show: false,
      },
      grid: { left: 74, right: 74, top: 18, bottom: 78 },
      xAxis: {
        type: "category",
        data: x,
        axisTick: { show: false },
        axisLabel: { margin: 34, hideOverlap: true },
        axisLine: {
          lineStyle: { color: isDark ? "rgba(255,255,255,0.16)" : "rgba(148, 163, 184, 0.55)" },
        },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: yAxisMax,
        splitNumber: 4,
        axisLabel: {
          formatter: (value: number) => formatNumber(value),
          margin: 12,
          width: 56,
          overflow: "truncate",
        },
        splitLine: {
          lineStyle: { color: isDark ? "rgba(255,255,255,0.08)" : "rgba(148, 163, 184, 0.25)" },
        },
      },
      series: [
        ...series,
        ...(showTotalLine
          ? [
              {
                name: "总 Token",
                type: "line",
                smooth: true,
                symbol: "circle",
                symbolSize: 6,
                lineStyle: { width: 3, color: totalLineColor },
                itemStyle: { color: totalLineColor },
                emphasis: { focus: "series" },
                data: totals,
                z: 10,
              },
            ]
          : []),
        {
          name: "__axis__",
          type: "line",
          data: showTotalLine ? totals : selectedSums,
          showSymbol: false,
          silent: true,
          tooltip: { show: false },
          emphasis: { disabled: true },
          lineStyle: { opacity: 0 },
          itemStyle: { opacity: 0 },
        },
      ],
      animationEasing: "cubicOut" as const,
      animationDuration: 520,
      animationDurationUpdate: 360,
    };
  }, [
    hourlySeries.tokenKeys,
    hourlySeries.tokenPoints,
    hourlyTokenPalette.colorByKey,
    hourlyTokenSelected,
    isDark,
    tokenHourWindow,
  ]);

  const modelActions = (
    <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
      {[
        { key: "requests", label: "请求" },
        { key: "tokens", label: "Token" },
      ].map((item) => {
        const active = modelMetric === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setModelMetric(item.key as "requests" | "tokens")}
            className={
              active
                ? "rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                : "rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <ChartSpline size={18} className="text-slate-900 dark:text-white" />
              <span>监控中心</span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <Search size={14} className="text-slate-500 dark:text-white/55" />
              <TextInput
                value={apiFilterInput}
                onChange={(event) => setApiFilterInput(event.target.value)}
                variant="ghost"
                className="w-36"
                placeholder="按 API key 过滤"
              />
            </div>
            <button
              type="button"
              onClick={applyFilter}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
            >
              <Filter size={14} />
              应用过滤
            </button>
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={isLoading}
              aria-busy={isLoading}
              className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              <span className="grid">
                <span
                  className={
                    isLoading
                      ? "col-start-1 row-start-1 opacity-0"
                      : "col-start-1 row-start-1 opacity-100"
                  }
                >
                  刷新
                </span>
                <span
                  className={
                    isLoading
                      ? "col-start-1 row-start-1 opacity-100"
                      : "col-start-1 row-start-1 opacity-0"
                  }
                >
                  刷新中
                </span>
              </span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </section>

      <Reveal>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="总请求"
            value={<AnimatedNumber value={metrics.requestCount} format={formatNumber} />}
            hint="已按时间范围过滤"
            icon={Activity}
          />
          <KpiCard
            title="成功率"
            value={<AnimatedNumber value={metrics.successRate} format={formatRate} />}
            hint={`成功 ${formatNumber(metrics.successCount)} / 失败 ${formatNumber(metrics.failedCount)}`}
            icon={ShieldCheck}
          />
          <KpiCard
            title="总 Token"
            value={<AnimatedNumber value={metrics.totalTokens} format={formatNumber} />}
            hint="输入 + 输出 + 推理 + 缓存"
            icon={Sigma}
          />
          <KpiCard
            title="输出 Token"
            value={<AnimatedNumber value={metrics.outputTokens} format={formatNumber} />}
            hint={`输入 Token：${formatNumber(metrics.inputTokens)}`}
            icon={Coins}
          />
        </section>
      </Reveal>

      {!hasData && !isLoading ? (
        <Reveal>
          <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700 dark:bg-white/10 dark:text-white/70">
                <ChartSpline size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">暂无监控数据</p>
              <p className="text-sm text-slate-600 dark:text-white/65">
                可以点击上方“刷新”重新拉取数据。
              </p>
              <button
                type="button"
                onClick={() => void refreshData()}
                className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
          </section>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
              <Card
                title="模型用量分布"
                description={`最近 ${timeRange} 天 · 按${modelMetric === "requests" ? "请求数" : "Token"} · Top10`}
                actions={modelActions}
                loading={isRefreshing}
              >
                <div className="grid h-72 grid-cols-[minmax(0,1fr)_220px] gap-4">
                  <EChart
                    option={modelDistributionOption}
                    className="h-72 min-w-0"
                  />
                  <div className="flex h-72 flex-col justify-center gap-2 overflow-y-auto pr-1">
                    {modelDistributionLegend.map((item) => (
                      <div
                        key={item.name}
                        className="grid grid-cols-[minmax(0,120px)_40px_52px] items-center gap-x-1 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full ${item.colorClass} opacity-80 ring-1 ring-black/5 dark:ring-white/10`}
                          />
                          <span className="min-w-0 truncate text-slate-700 dark:text-white/80">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                          {item.valueLabel}
                        </span>
                        <span className="text-right tabular-nums text-slate-500 dark:text-white/55">
                          {item.percentLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card
                title="每日用量趋势"
                description={`最近 ${timeRange} 天 · 请求数与 Token 用量趋势`}
                loading={isRefreshing}
              >
                <div className="flex h-72 min-w-0 flex-col overflow-hidden">
                  <EChart
                    option={dailyTrendOption}
                    className="min-h-0 flex-1 min-w-0"
                    replaceMerge="series"
                  />
                  <ChartLegend
                    className="shrink-0 pt-4"
                    items={[
                      ...(dailyLegendAvailability.hasInput
                        ? [
                            {
                              key: "输入 Token",
                              label: "输入 Token",
                              colorClass: "bg-violet-400",
                              enabled: dailyLegendSelected["输入 Token"] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                      ...(dailyLegendAvailability.hasOutput
                        ? [
                            {
                              key: "输出 Token",
                              label: "输出 Token",
                              colorClass: "bg-emerald-400",
                              enabled: dailyLegendSelected["输出 Token"] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                      ...(dailyLegendAvailability.hasRequests
                        ? [
                            {
                              key: "请求数",
                              label: "请求数",
                              colorClass: "bg-blue-500",
                              enabled: dailyLegendSelected["请求数"] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </Card>
            </section>
          </Reveal>

          <Reveal>
            <Card
              title="每小时模型请求分布"
              description="按小时聚合（Top5 模型 + 其他）"
              actions={<HourWindowSelector value={modelHourWindow} onChange={setModelHourWindow} />}
              loading={isRefreshing}
            >
              <div className="flex h-72 flex-col overflow-hidden">
                <EChart
                  option={hourlyModelOption}
                  className="min-h-0 flex-1"
                  replaceMerge="series"
                />
                <ChartLegend
                  className="shrink-0 pt-4"
                  items={[
                    ...hourlySeries.modelKeys.map((key) => ({
                      key,
                      label: key,
                      colorClass: hourlyModelPalette.classByKey[key] ?? "bg-slate-400",
                      enabled: hourlyModelSelected[key] ?? true,
                      onToggle: toggleHourlyModelLegend,
                    })),
                    {
                      key: "总请求",
                      label: "总请求",
                      colorClass: hourlyModelPalette.classByKey["总请求"] ?? "bg-blue-500",
                      enabled: hourlyModelSelected["总请求"] ?? true,
                      onToggle: toggleHourlyModelLegend,
                    },
                  ]}
                />
              </div>
            </Card>
          </Reveal>

          <Reveal>
            <Card
              title="每小时 Token 用量"
              description="按小时聚合（输入 / 输出 / 推理 / 缓存）"
              actions={<HourWindowSelector value={tokenHourWindow} onChange={setTokenHourWindow} />}
              loading={isRefreshing}
            >
              <div className="flex h-72 flex-col overflow-hidden">
                <EChart
                  option={hourlyTokenOption}
                  className="min-h-0 flex-1"
                  replaceMerge="series"
                />
                <ChartLegend
                  className="shrink-0 pt-4"
                  items={[
                    ...hourlySeries.tokenKeys.map((key) => ({
                      key,
                      label: key,
                      colorClass: hourlyTokenPalette.classByKey[key] ?? "bg-slate-400",
                      enabled: hourlyTokenSelected[key] ?? true,
                      onToggle: toggleHourlyTokenLegend,
                    })),
                    {
                      key: "总 Token",
                      label: "总 Token",
                      colorClass: hourlyTokenPalette.classByKey["总 Token"] ?? "bg-blue-500",
                      enabled: hourlyTokenSelected["总 Token"] ?? true,
                      onToggle: toggleHourlyTokenLegend,
                    },
                  ]}
                />
              </div>
            </Card>
          </Reveal>
        </>
      )}
    </div>
  );
}
