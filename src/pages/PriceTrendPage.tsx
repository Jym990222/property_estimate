import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import * as echarts from 'echarts';
import {
  Card,
  Select,
  Typography,
  Space,
  Tag,
  DatePicker,
  Button,
  message,
  Spin,
  Empty,
  Tooltip,
  Switch,
} from 'antd';
import {
  DownloadOutlined,
  LineChartOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { fetchCities, type CityDTO } from '../api/geo';
import {
  fetchMaterialsByCity,
  fetchPriceRange,
  fetchProvinceAvg,
  type PriceRangeResp,
  type ProvinceAvgResp,
} from '../api/price';

const { Text } = Typography;
const { RangePicker } = DatePicker;

// 日期下限
const MIN_DATE = dayjs('2026-06-01');

// 直辖市（省均价无意义）
const MUNICIPALITIES = new Set(['北京', '上海', '天津', '重庆']);

// 颜色调色板（城市曲线依次取色）
const SERIES_PALETTE = [
  '#1890ff', '#fa541c', '#52c41a', '#722ed1',
  '#eb2f96', '#13c2c2', '#faad14', '#a0d911',
];

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function genId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function escapeCSV(field: string): string {
  const s = String(field ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ============================ 数据类型 ============================
interface CityEntry {
  id: string;
  province: string;
  city: string;
  materials: string[];
  availableMaterials: string[];
  data: PriceRangeResp | null;
  loadingMaterials: boolean;
  loadingData: boolean;
}

interface ChartSeries {
  key: string;
  name: string;
  color: string;
  isProvinceAvg: boolean;
  pointMap: Map<string, number>;
}

// ============================ 子组件：城市卡片 ============================
interface CityCardProps {
  entry: CityEntry;
  onRemove: () => void;
  onMaterialsChange: (mats: string[]) => void;
}

const CityCard: React.FC<CityCardProps> = ({ entry, onRemove, onMaterialsChange }) => {
  const available = entry.availableMaterials ?? [];
  const selected = entry.materials ?? [];

  return (
    <Card
      size="small"
      styles={{ body: { padding: '8px 10px' } }}
      style={{
        width: 300,
        border: '1px solid #e2e8f0',
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <Space size={4}>
          <Tag color="blue" style={{ margin: 0 }}>
            {entry.province}
          </Tag>
          <Text strong style={{ fontSize: 13 }}>
            {entry.city}
          </Text>
          {entry.loadingData && <Spin size="small" />}
        </Space>
        <Tooltip title="移除">
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={onRemove}
          />
        </Tooltip>
      </div>

      <Select
        mode="multiple"
        size="small"
        value={selected}
        onChange={onMaterialsChange}
        loading={entry.loadingMaterials}
        placeholder={
          entry.loadingMaterials
            ? '加载中…'
            : available.length === 0
            ? '该城市暂无可选材料'
            : '选择材料（最多 3 种）'
        }
        disabled={entry.loadingMaterials || available.length === 0}
        maxTagCount={2}
        optionFilterProp="label"
        style={{ width: '100%' }}
        options={available.map((m) => ({ label: m, value: m }))}
      />
    </Card>
  );
};

// ============================ 主组件 ============================
const PriceTrendPage: React.FC = () => {
  const [allCities, setAllCities] = useState<CityDTO[]>([]);
  const [entries, setEntries] = useState<CityEntry[]>([]);
  const [pendingCity, setPendingCity] = useState<string | undefined>(undefined);

  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const dateRangeInit = useRef(false);

  const [showProvinceAvg, setShowProvinceAvg] = useState(false);
  const [provinceAvgMap, setProvinceAvgMap] = useState<Map<string, ProvinceAvgResp>>(
    new Map(),
  );
  const [loadingProvinceAvg, setLoadingProvinceAvg] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // 城市下拉（按省分组，value = "省|市"）
  const cityOptions = useMemo(() => {
      const selected = new Set(entries.map((e) => e.city));
      const grouped: Record<string, string[]> = {};
      allCities.forEach((c) => {
        if (selected.has(c.city_name)) return;   // 已添加的跳过
        if (!grouped[c.province_name]) grouped[c.province_name] = [];
        grouped[c.province_name].push(c.city_name);
      });
      return Object.entries(grouped)
        .filter(([, cities]) => cities.length > 0)   // 空省不显示
        .map(([prov, cities]) => ({
          label: prov,
          options: cities.map((c) => ({ label: c, value: `${prov}|${c}` })),
        }));
    }, [allCities, entries]);

  // ---------- 拉城市列表 ----------
  useEffect(() => {
    let cancelled = false;
    fetchCities()
      .then((list) => {
        if (!cancelled) setAllCities(list);
      })
      .catch((err) => {
        console.error(err);
        void message.error('加载城市列表失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- 更新单个 entry ----------
  const updateEntry = useCallback((id: string, patch: Partial<CityEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  // ---------- 加载数据 ----------
  const loadDataForEntry = useCallback(
    async (id: string, city: string, mats: string[]) => {
      if (mats.length === 0) {
        updateEntry(id, { data: null });
        return;
      }
      updateEntry(id, { loadingData: true });
      try {
        const resp = await fetchPriceRange(city, mats);
        updateEntry(id, { data: resp, loadingData: false });
      } catch (err) {
        console.error(err);
        void message.error(`${city} 价格加载失败`);
        updateEntry(id, { data: null, loadingData: false });
      }
    },
    [updateEntry],
  );

  // ---------- 添加城市 ----------
  const handleAddCity = useCallback(
    (value: string | undefined) => {
      if (!value || typeof value !== 'string') return;
      const [prov, cityName] = value.split('|');
      if (!prov || !cityName) return;

      if (entries.some((e) => e.city === cityName)) {
        void message.warning('该城市已添加');
        return;
      }
      const id = genId();
      const entry: CityEntry = {
        id,
        province: prov,
        city: cityName,
        materials: [],
        availableMaterials: [],
        data: null,
        loadingMaterials: true,
        loadingData: false,
      };
      setEntries((prev) => [...prev, entry]);

      fetchMaterialsByCity(cityName)
        .then((list) => {
          const names = list.map((m) => m.material_name);
          const selected = names.length > 0 ? [names[0]] : [];
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id
                ? {
                    ...e,
                    availableMaterials: names,
                    materials: selected,
                    loadingMaterials: false,
                  }
                : e,
            ),
          );
          if (selected.length > 0) {
            void loadDataForEntry(id, cityName, selected);
          }
        })
        .catch((err) => {
          console.error(err);
          void message.error(`${cityName} 材料列表加载失败`);
          setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, loadingMaterials: false } : e)),
          );
        });
    },
    [entries, loadDataForEntry],
  );

  // ---------- 移除城市 ----------
  const handleRemove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // ---------- 修改材料 ----------
  const handleMaterialsChange = (id: string, mats: string[]) => {
    if (mats.length === 0) {
      void message.warning('至少选择一种材料');
      return;
    }
    if (mats.length > 3) {
      void message.warning('最多同时对比 3 种材料');
      return;
    }
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    updateEntry(id, { materials: mats });
    void loadDataForEntry(id, entry.city, mats);
  };

  // ---------- 城市清空时重置 ----------
  useEffect(() => {
    if (entries.length === 0) {
      dateRangeInit.current = false;
      setDateRange(null);
      setShowProvinceAvg(false);
      setProvinceAvgMap(new Map());
    }
  }, [entries.length]);

  // ---------- 首次数据加载后初始化日期范围 ----------
  useEffect(() => {
    if (dateRangeInit.current) return;
    const withData = entries.find(
      (e) => e.data?.available_dates && e.data.available_dates.length > 0,
    );
    if (!withData?.data) return;
    const dates = withData.data.available_dates.filter(
      (d) => !dayjs(d).isBefore(MIN_DATE, 'day'),
    );
    if (dates.length === 0) return;
    setDateRange([dayjs(dates[0]), dayjs(dates[dates.length - 1])]);
    dateRangeInit.current = true;
  }, [entries]);

  // ---------- 省均价加载 ----------
  useEffect(() => {
    if (!showProvinceAvg) {
      setProvinceAvgMap(new Map());
      return;
    }
    if (entries.length === 0) return;

    const byProv = new Map<string, Set<string>>();
    entries.forEach((e) => {
      if (MUNICIPALITIES.has(e.province)) return;
      if (!byProv.has(e.province)) byProv.set(e.province, new Set());
      (e.materials ?? []).forEach((m) => byProv.get(e.province)!.add(m));
    });

    if (byProv.size === 0) {
      setProvinceAvgMap(new Map());
      return;
    }

    let cancelled = false;
    setLoadingProvinceAvg(true);

    const from = dateRange?.[0]?.format('YYYY-MM-DD');
    const to = dateRange?.[1]?.format('YYYY-MM-DD');

    Promise.all(
      Array.from(byProv.entries()).map(async ([prov, mats]) => {
        const resp = await fetchProvinceAvg(prov, Array.from(mats), from, to);
        return [prov, resp] as const;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setProvinceAvgMap(new Map(results));
      })
      .catch((err) => {
        console.error(err);
        void message.error('省均价加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoadingProvinceAvg(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showProvinceAvg, entries, dateRange]);

  // ---------- 图表初始化 ----------
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && chartRef.current.clientWidth > 0) chart.resize();
    });
    resizeObserver.observe(chartRef.current);

    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.dispose();
      }
      chartInstance.current = null;
    };
  }, []);

  // ---------- 日期列表 ----------
  const dateList = useMemo(() => {
    if (!dateRange || !dateRange[0] || !dateRange[1]) return [];
    const [from, to] = dateRange;
    if (!from.isValid() || !to.isValid() || to.isBefore(from)) return [];
    const days = to.diff(from, 'day');
    const list: string[] = [];
    for (let i = 0; i <= days; i++) {
      list.push(from.add(i, 'day').format('YYYY-MM-DD'));
    }
    return list;
  }, [dateRange]);

  // ---------- 组装系列 ----------
  const chartSeries = useMemo<ChartSeries[]>(() => {
    const result: ChartSeries[] = [];
    const colorByProvMat = new Map<string, string>();
    let colorIdx = 0;

    entries.forEach((entry) => {
      (entry.materials ?? []).forEach((mat) => {
        const color = SERIES_PALETTE[colorIdx % SERIES_PALETTE.length];
        colorIdx += 1;
        colorByProvMat.set(`${entry.province}|${mat}`, color);

        const s = entry.data?.series.find((x) => x.material === mat);
        const pointMap = new Map<string, number>();
        s?.points.forEach((p) => pointMap.set(p.date, p.price));

        result.push({
          key: `city-${entry.id}-${mat}`,
          name: `${entry.city} - ${mat}`,
          color,
          isProvinceAvg: false,
          pointMap,
        });
      });
    });

    if (showProvinceAvg) {
      provinceAvgMap.forEach((resp, prov) => {
        resp.series.forEach((s) => {
          const color = colorByProvMat.get(`${prov}|${s.material}`) ?? '#94a3b8';
          const pointMap = new Map<string, number>();
          s.points.forEach((p) => pointMap.set(p.date, p.price));
          result.push({
            key: `avg-${prov}-${s.material}`,
            name: `${prov}均价 - ${s.material}`,
            color,
            isProvinceAvg: true,
            pointMap,
          });
        });
      });
    }

    return result;
  }, [entries, showProvinceAvg, provinceAvgMap]);

  // ---------- ECharts option ----------
  const chartOption = useMemo(() => {
    if (dateList.length === 0 || chartSeries.length === 0) return null;

    const xLabels = dateList.map((d) => dayjs(d).format('MM/DD'));

    const series = chartSeries.map((s) => {
      const data = dateList.map((d) => {
        const v = s.pointMap.get(d);
        return v === undefined ? null : v;
      });
      return {
        name: s.name,
        type: 'line',
        data,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        showSymbol: false,
        connectNulls: true,
        lineStyle: {
          color: s.color,
          width: s.isProvinceAvg ? 1.8 : 2.4,
          type: s.isProvinceAvg ? 'dashed' : 'solid',
          opacity: s.isProvinceAvg ? 0.85 : 1,
        },
        itemStyle: { color: s.color },
        areaStyle: s.isProvinceAvg
          ? undefined
          : {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: hexToRgba(s.color, 0.15) },
                  { offset: 1, color: hexToRgba(s.color, 0.01) },
                ],
              },
            },
        emphasis: { focus: 'series' },
      };
    });

    return {
      animationDuration: 500,
      animationEasing: 'cubicOut' as const,
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: '#334155',
        borderWidth: 0,
        textStyle: { color: '#F1F5F9', fontSize: 12 },
        padding: [10, 14],
        axisPointer: {
          type: 'line',
          lineStyle: { color: '#38BDF8', type: 'dashed' },
        },
        formatter: (params: any[]) => {
          if (!params || !params.length) return '';
          const dateLabel = params[0].axisValue;
          let html = `<div style="font-weight:bold;margin-bottom:8px;color:#38BDF8;">${dateLabel}</div>`;
          let hasValue = false;
          params.forEach((p: any) => {
            if (p.value === null || p.value === undefined) return;
            hasValue = true;
            html += `
              <div style="display:flex;justify-content:space-between;gap:18px;line-height:1.8;font-size:12px;">
                <span>${p.marker}${p.seriesName}</span>
                <span style="font-weight:bold;">¥ ${Number(p.value).toLocaleString()}</span>
              </div>`;
          });
          return hasValue
            ? html
            : html + '<div style="color:#94a3b8;font-size:12px;">当日无数据</div>';
        },
      },
      legend: {
        type: 'scroll',
        right: 10,
        top: 6,
        icon: 'roundRect',
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: '#334155', fontSize: 12 },
        pageTextStyle: { color: '#64748B' },
      },
      grid: {
        left: 70,
        right: 30,
        top: 50,
        bottom: 30,
        containLabel: false,
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: xLabels,
        axisLine: { lineStyle: { color: '#CBD5E1' } },
        axisLabel: { color: '#64748B', fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        name: '价格（元/吨）',
        nameTextStyle: { color: '#64748B', fontSize: 11, padding: [0, 0, 6, 0] },
        scale: true,
        axisLine: { show: false },
        axisLabel: {
          color: '#64748B',
          fontSize: 11,
          formatter: (v: number) => v.toLocaleString(),
        },
        splitLine: { lineStyle: { color: '#E2E8F0', type: 'dashed' } },
      },
      series,
    };
  }, [dateList, chartSeries]);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart || chart.isDisposed()) return;
    if (!chartOption) {
      chart.clear();
      return;
    }
    chart.setOption(chartOption, true);
  }, [chartOption]);

  // ---------- 日期禁用 ----------
  const availableDateSet = useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => {
      e.data?.available_dates.forEach((d) => s.add(d));
    });
    return s;
  }, [entries]);

  const disabledDate = (current: Dayjs) => {
    if (!current) return false;
    if (current.isBefore(MIN_DATE, 'day')) return true;
    if (current.isAfter(dayjs(), 'day')) return true;
    return !availableDateSet.has(current.format('YYYY-MM-DD'));
  };

  // ---------- 导出 CSV ----------
  const exportCSV = () => {
    if (dateList.length === 0 || chartSeries.length === 0) {
      void message.warning('暂无数据可导出');
      return;
    }
    try {
      const header = ['日期', ...chartSeries.map((s) => s.name)];
      const rows = dateList.map((d) => [
        d,
        ...chartSeries.map((s) => {
          const v = s.pointMap.get(d);
          return v === undefined ? '' : String(v);
        }),
      ]);
      const csvContent =
        '\uFEFF' + [header, ...rows].map((r) => r.map(escapeCSV).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `价格走势_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      void message.success('已导出 CSV');
    } catch {
      void message.error('导出失败');
    }
  };

  const hasAnyData = chartSeries.length > 0 && dateList.length > 0;
  const hasCity = entries.length > 0;
  const allCitiesLoaded = entries.every((e) => !e.loadingData && e.data !== null);

  return (
    <div
      style={{
        height: 'calc(100vh - 160px)',
        minHeight: 560,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      {/* 顶部标题 + 导出 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a' }}>
          价格走势分析
        </div>
        <Button
          type="primary"
          size="small"
          icon={<DownloadOutlined />}
          onClick={exportCSV}
          disabled={!hasAnyData}
        >
          导出 CSV
        </Button>
      </div>

      {/* 筛选区 */}
      <Card size="small" style={{ flexShrink: 0 }} styles={{ body: { padding: '10px 14px' } }}>
        <Space size="middle" wrap align="center">
          <Space size={6}>
            <Text strong style={{ fontSize: 13 }}>添加城市：</Text>
            <Select
              showSearch
              placeholder="搜索城市（按省份分组）"
              style={{ width: 240 }}
              size="small"
              options={cityOptions}
              value={pendingCity}
              onChange={(v) => {
                setPendingCity(undefined);
                if (v) handleAddCity(v);
              }}
              optionFilterProp="label"
              suffixIcon={<PlusOutlined />}
              notFoundContent={allCities.length === 0 ? <Spin size="small" /> : '无匹配城市'}
            />
          </Space>

          <Space size={6}>
            <Text strong style={{ fontSize: 13 }}>时间段：</Text>
            <RangePicker
              value={dateRange ?? undefined}
              onChange={(vals) => {
                if (vals && vals[0] && vals[1]) {
                  setDateRange([vals[0], vals[1]]);
                }
              }}
              allowClear={false}
              disabledDate={disabledDate}
              disabled={!hasCity}
              size="small"
              style={{ width: 230 }}
              placeholder={(hasCity ? ['起始日期', '结束日期'] : ['先添加城市', '先添加城市']) as [string, string]}
            />
          </Space>

          <Space size={6}>
            <Text strong style={{ fontSize: 13 }}>省均价对比：</Text>
            <Switch
              size="small"
              checked={showProvinceAvg}
              onChange={setShowProvinceAvg}
              disabled={!hasCity || entries.every((e) => MUNICIPALITIES.has(e.province))}
              loading={loadingProvinceAvg}
            />
          </Space>
        </Space>

        <div style={{ marginTop: 8, borderTop: '1px dashed #e5e7eb', paddingTop: 8 }}>
          <Space wrap size={6}>
            <Text type="secondary" style={{ fontSize: 12 }}>说明：</Text>
            <Tag color="blue" style={{ margin: 0 }}>实线 = 城市价</Tag>
            <Tag color="default" style={{ margin: 0 }}>虚线 = 省均价</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              日期下限 {MIN_DATE.format('YYYY-MM-DD')}；只可选数据库内有数据的日期
            </Text>
          </Space>
        </div>
      </Card>

      {/* 城市卡片区 */}
      {hasCity && (
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            maxHeight: 180,
            overflowY: 'auto',
            paddingRight: 4,
          }}
        >
          {entries.map((entry) => (
            <CityCard
              key={entry.id}
              entry={entry}
              onRemove={() => handleRemove(entry.id)}
              onMaterialsChange={(mats) => handleMaterialsChange(entry.id, mats)}
            />
          ))}
        </div>
      )}

      {/* 图表 */}
      <Card
        size="small"
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
        styles={{
          body: {
            flex: 1,
            minHeight: 0,
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {!hasCity && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    请先添加至少一个城市
                  </span>
                }
              />
            </div>
          )}

          {hasCity && !hasAnyData && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {allCitiesLoaded ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>
                      所选时间段内无数据
                    </span>
                  }
                />
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
                    加载中…
                  </div>
                </div>
              )}
            </div>
          )}

          <div
            ref={chartRef}
            style={{ width: '100%', height: '100%', minHeight: 0 }}
          />
        </div>
      </Card>

      {/* 底部说明 */}
      <div style={{ flexShrink: 0, color: '#94a3b8', fontSize: 11, lineHeight: 1.4 }}>
        <LineChartOutlined style={{ marginRight: 4 }} />
        数据来源于数据库；价格 = 当日最低价与最高价的平均值。省均价 = 该省各城市同材料均值的算术平均。
      </div>
    </div>
  );
};

export default PriceTrendPage;