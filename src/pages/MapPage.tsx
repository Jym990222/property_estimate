import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as echarts from 'echarts';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Tooltip, Empty } from 'antd';
import {
  ArrowRightOutlined,
  SwapOutlined,
  AimOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { fetchCities, type CityDTO } from '../api/geo';
import { fetchCommonMaterials, fetchLatestPrice } from '../api/price';

// ----- 默认地图视图 -----
const DEFAULT_MAP_CENTER: [number, number] = [110.32634741815278, 30.170788676332254];
const DEFAULT_MAP_ZOOM = 1.1979;

// ----- 路线配色 -----
const ROUTE_COLORS = [
  '#ff6b35', '#1677ff', '#16a34a', '#d97706', '#9333ea',
  '#0891b2', '#e11d48', '#65a30d', '#c026d3', '#0d9488',
];
const ROUTE_LIMIT = 30;

// ----- 类型定义 -----
interface CityCoord {
  name: string;
  lat: number;
  lng: number;
  province: string;
}

interface Formula {
  startPrice: number;
  endPrice: number;
  priceGain: number;
  freight: number;
  weight: number;
  costPerKm: number;
  category: string;
  startDate?: string;
  endDate?: string;
}

interface CalcResult {
  cost: number;
  distance: number;
  formula: Formula;
}

interface RouteItem {
  id: string;
  start: CityCoord;
  end: CityCoord;
  color: string;
  result: CalcResult;
  createdAt: number;
}

// ----- 省份视图中心 -----
const provinceCenters: Record<string, { lat: number; lng: number; zoom: number }> = {
  '全国': { lat: DEFAULT_MAP_CENTER[1], lng: DEFAULT_MAP_CENTER[0], zoom: DEFAULT_MAP_ZOOM },
  '北京': { lat: 39.9, lng: 116.4, zoom: 5.5 },
  '上海': { lat: 31.2, lng: 121.5, zoom: 5.5 },
  '天津': { lat: 39.1, lng: 117.2, zoom: 5.5 },
  '重庆': { lat: 29.6, lng: 106.5, zoom: 5.5 },
  '安徽': { lat: 31.8, lng: 117.3, zoom: 5.0 },
  '江苏': { lat: 32.0, lng: 120.0, zoom: 5.0 },
  '浙江': { lat: 29.5, lng: 120.5, zoom: 5.0 },
  '山东': { lat: 36.5, lng: 119.0, zoom: 5.0 },
  '广东': { lat: 23.0, lng: 114.0, zoom: 5.0 },
  '河北': { lat: 38.5, lng: 116.0, zoom: 5.0 },
  '河南': { lat: 34.0, lng: 114.0, zoom: 5.0 },
  '湖北': { lat: 31.0, lng: 113.0, zoom: 5.0 },
  '湖南': { lat: 27.5, lng: 112.5, zoom: 5.0 },
  '四川': { lat: 30.5, lng: 103.5, zoom: 5.0 },
  '福建': { lat: 25.5, lng: 118.5, zoom: 5.0 },
  '陕西': { lat: 35.5, lng: 109.0, zoom: 5.0 },
  '江西': { lat: 27.5, lng: 115.5, zoom: 5.0 },
  '辽宁': { lat: 41.5, lng: 123.0, zoom: 5.0 },
  '吉林': { lat: 43.5, lng: 126.0, zoom: 5.0 },
  '黑龙江': { lat: 46.5, lng: 127.0, zoom: 5.0 },
  '内蒙': { lat: 44.0, lng: 115.0, zoom: 4.5 },
  '内蒙古': { lat: 44.0, lng: 115.0, zoom: 4.5 },
  '山西': { lat: 37.5, lng: 112.5, zoom: 5.0 },
  '甘肃': { lat: 37.5, lng: 103.0, zoom: 5.0 },
  '宁夏': { lat: 37.5, lng: 106.3, zoom: 5.0 },
  '青海': { lat: 36.5, lng: 100.0, zoom: 5.0 },
  '新疆': { lat: 43.5, lng: 87.0, zoom: 4.5 },
  '西藏': { lat: 31.0, lng: 88.0, zoom: 4.5 },
  '云南': { lat: 24.5, lng: 102.0, zoom: 5.0 },
  '贵州': { lat: 26.5, lng: 107.0, zoom: 5.0 },
  '广西': { lat: 23.5, lng: 109.0, zoom: 5.0 },
  '海南': { lat: 19.0, lng: 110.0, zoom: 5.0 },
  '台湾': { lat: 24.0, lng: 121.0, zoom: 5.0 },
  '香港': { lat: 22.3, lng: 114.2, zoom: 6.0 },
  '澳门': { lat: 22.2, lng: 113.5, zoom: 6.0 },
};

// 省份名归一化（兼容 "安徽省" / "内蒙古自治区" 等）
const normalizeProvinceName = (name: string): string =>
  name
    .replace(/(省|市|自治区|特别行政区|维吾尔|壮族|回族|自治州)/g, '')
    .trim();

const findProvinceCenter = (name: string) => {
  if (!name) return null;
  if (provinceCenters[name]) return provinceCenters[name];
  const norm = normalizeProvinceName(name);
  if (provinceCenters[norm]) return provinceCenters[norm];
  for (const [key, val] of Object.entries(provinceCenters)) {
    if (key.startsWith(norm) || norm.startsWith(key)) return val;
  }
  return null;
};

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ========== 主组件 ==========
const MapPage: React.FC = () => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // 城市 & 省份
  const [cityData, setCityData] = useState<CityCoord[]>([]);
  const [provinces, setProvinces] = useState<string[]>(['全国']);
  const [loadingGeo, setLoadingGeo] = useState(true);

  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_MAP_ZOOM);

  // 地图应聚焦的省份（下拉框驱动）
  const [viewProvince, setViewProvince] = useState<string>('全国');

  // 省份聚焦（点击地图省份）
  const [previousView, setPreviousView] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const [focusedProvince, setFocusedProvince] = useState<string | null>(null);

  // 待确认的起终点
  const [pendingStart, setPendingStart] = useState<CityCoord | null>(null);
  const [pendingEnd, setPendingEnd] = useState<CityCoord | null>(null);

  // 已保存的路线（全部保留在地图上）
  const [routes, setRoutes] = useState<RouteItem[]>([]);

  // 下拉筛选
  const [startProvince, setStartProvince] = useState<string>('');
  const [endProvince, setEndProvince] = useState<string>('');

  // 弹窗
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [commonMaterials, setCommonMaterials] = useState<string[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // ---------- 拉取城市数据 ----------
  useEffect(() => {
    let cancelled = false;
    setLoadingGeo(true);
    fetchCities()
      .then((list: CityDTO[]) => {
        if (cancelled) return;
        const cities: CityCoord[] = list.map((c) => ({
          name: c.city_name,
          lat: c.lat,
          lng: c.lng,
          province: c.province_name,
        }));
        setCityData(cities);
        const provSet = Array.from(new Set(cities.map((c) => c.province)));
        setProvinces(['全国', ...provSet]);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('加载城市失败', err);
        void message.error('城市数据加载失败，请确认后端已启动');
      })
      .finally(() => {
        if (!cancelled) setLoadingGeo(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 视图跟随 viewProvince（下拉框改变时缩放；点击省份聚焦时暂停自动）
  useEffect(() => {
    if (focusedProvince) return;
    const center = findProvinceCenter(viewProvince) || provinceCenters['全国'];
    setMapCenter([center.lng, center.lat]);
    setMapZoom(center.zoom);
  }, [viewProvince, focusedProvince]);

  // ---------- ECharts 配置 ----------
  const getOption = useCallback(
    (
      routeList: RouteItem[],
      pStart: CityCoord | null,
      pEnd: CityCoord | null,
      center: [number, number],
      zoom: number,
      focused: string | null,
    ) => {
      const showScatter = zoom >= 3;

      const scatterData = showScatter
        ? cityData.map((c) => ({ name: c.name, value: [c.lng, c.lat] }))
        : [];

      const series: any[] = [
        {
          name: '城市',
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 1,
          data: scatterData,
          symbolSize: 6,
          label: {
            show: zoom >= 4,
            formatter: '{b}',
            position: 'right',
            fontSize: 10,
            color: '#475569',
          },
          itemStyle: { color: 'rgba(30,144,255,0.55)' },
          emphasis: { itemStyle: { color: '#ff4d4f' } },
        },
      ];

      // 已保存路线
      routeList.forEach((r) => {
        series.push({
          name: '路线',
          type: 'lines',
          coordinateSystem: 'geo',
          zlevel: 2,
          effect: {
            show: true,
            period: 4,
            trailLength: 0.3,
            symbol: 'arrow',
            symbolSize: 7,
            color: r.color,
          },
          lineStyle: { color: r.color, width: 2.5, opacity: 0.88, curveness: 0.22 },
          data: [
            {
              name: `${r.start.name} → ${r.end.name}`,
              coords: [
                [r.start.lng, r.start.lat],
                [r.end.lng, r.end.lat],
              ],
            },
          ],
        });
      });

      // 路线端点（可点击复用为新路线的起终点）
      if (routeList.length > 0) {
        series.push({
          name: '路线端点',
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 3,
          symbolSize: 11,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: {
            show: false,
            formatter: '{b}',
            position: 'right',
            fontSize: 10,
            color: '#0f172a',
            backgroundColor: 'rgba(255,255,255,0.9)',
            padding: [2, 4],
            borderRadius: 4,
          },
          emphasis: {
            scale: 1.6,
            label: { show: true },
            itemStyle: {
              borderColor: '#0f172a',
              borderWidth: 2,
              shadowBlur: 10,
              shadowColor: 'rgba(15,23,42,0.35)',
            },
          },
          data: routeList.flatMap((r) => [
            { name: r.start.name, value: [r.start.lng, r.start.lat], itemStyle: { color: r.color } },
            { name: r.end.name, value: [r.end.lng, r.end.lat], itemStyle: { color: r.color } },
          ]),
        });
      }

      // 待选起点
      if (pStart) {
        series.push({
          name: '待选起点光晕',
          type: 'effectScatter',
          coordinateSystem: 'geo',
          zlevel: 4,
          silent: true,
          data: [{ name: pStart.name, value: [pStart.lng, pStart.lat] }],
          symbolSize: 24,
          rippleEffect: { brushType: 'stroke', scale: 4 },
          itemStyle: { color: '#52c41a', shadowBlur: 10, shadowColor: '#52c41a' },
          label: { show: false },
        });
        series.push({
          name: '待选起点',
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 5,
          data: [{ name: pStart.name, value: [pStart.lng, pStart.lat] }],
          symbolSize: 14,
          label: {
            show: true,
            formatter: '起\n{b}',
            position: 'top',
            color: '#fff',
            fontSize: 11,
            fontWeight: 'bold',
            backgroundColor: '#52c41a',
            padding: [3, 6],
            borderRadius: 6,
          },
          itemStyle: { color: '#52c41a', borderColor: '#fff', borderWidth: 2 },
        });
      }

      // 待选终点
      if (pEnd) {
        series.push({
          name: '待选终点光晕',
          type: 'effectScatter',
          coordinateSystem: 'geo',
          zlevel: 4,
          silent: true,
          data: [{ name: pEnd.name, value: [pEnd.lng, pEnd.lat] }],
          symbolSize: 24,
          rippleEffect: { brushType: 'stroke', scale: 4 },
          itemStyle: { color: '#faad14', shadowBlur: 10, shadowColor: '#faad14' },
          label: { show: false },
        });
        series.push({
          name: '待选终点',
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 5,
          data: [{ name: pEnd.name, value: [pEnd.lng, pEnd.lat] }],
          symbolSize: 14,
          label: {
            show: true,
            formatter: '终\n{b}',
            position: 'bottom',
            color: '#fff',
            fontSize: 11,
            fontWeight: 'bold',
            backgroundColor: '#faad14',
            padding: [3, 6],
            borderRadius: 6,
          },
          itemStyle: { color: '#faad14', borderColor: '#fff', borderWidth: 2 },
        });
      }

      // 聚焦省份高亮
      const focusKey = focused ? normalizeProvinceName(focused) : null;
      const regions = focusKey
        ? Object.keys(provinceCenters)
            .filter((k) => k !== '全国' && normalizeProvinceName(k) === focusKey)
            .flatMap((name) => [
              { name, itemStyle: { areaColor: '#dbeafe', borderColor: '#3b82f6', borderWidth: 1.5 } },
              { name: name + '省', itemStyle: { areaColor: '#dbeafe', borderColor: '#3b82f6', borderWidth: 1.5 } },
              { name: name + '市', itemStyle: { areaColor: '#dbeafe', borderColor: '#3b82f6', borderWidth: 1.5 } },
              { name: name + '自治区', itemStyle: { areaColor: '#dbeafe', borderColor: '#3b82f6', borderWidth: 1.5 } },
              { name: name + '特别行政区', itemStyle: { areaColor: '#dbeafe', borderColor: '#3b82f6', borderWidth: 1.5 } },
            ])
        : [];

      return {
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            if (params.seriesName === '路线端点') {
              return `${params.name}<br/><span style="font-size:11px;color:#64748b">点击可作为新路线的起点或终点</span>`;
            }
            return params?.name ?? '';
          },
        },
        geo: {
          map: 'china',
          roam: true,
          center,
          zoom,
          label: { show: false },
          itemStyle: {
            areaColor: '#eaf4fb',
            borderColor: '#b8d4e8',
            borderWidth: 1,
            shadowColor: 'rgba(30,90,140,0.12)',
            shadowBlur: 12,
          },
          emphasis: {
            label: { show: true, color: '#000' },
            itemStyle: { areaColor: '#d0e7f5' },
          },
          regions,
        },
        series,
      };
    },
    [cityData],
  );

  // ---------- 初始化 ECharts ----------
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      const el = chartRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) chart.resize();
    });
    resizeObserver.observe(chartRef.current);

    const handleWindowResize = () => chart.resize();
    window.addEventListener('resize', handleWindowResize);

    fetch('/china.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((geoJson) => {
        echarts.registerMap('china', geoJson);
        setMapLoaded(true);
        setTimeout(() => chart.resize(), 0);
      })
      .catch((err) => {
        console.error('地图加载失败', err);
        void message.error('地图加载失败，请检查 /public/china.json 是否存在');
      });

    // 拖动/缩放时同步 center/zoom
    chart.on('georoam', () => {
      const option = chart.getOption() as any;
      const geo = option.geo?.[0];
      if (geo && geo.center && geo.zoom) {
        setMapCenter(geo.center);
        setMapZoom(geo.zoom);
      }
    });

    // 点击省份 → 聚焦放大
    chart.on('click', (params: any) => {
      if (params.componentType !== 'geo') return;
      const clickedName = params.name;
      if (!clickedName || clickedName === '全国') return;

      const center = findProvinceCenter(clickedName);
      if (!center) return;

      const option = chart.getOption() as any;
      const geo = option.geo?.[0];
      if (geo?.center && geo?.zoom) {
        setPreviousView((prev) => prev ?? { center: geo.center, zoom: geo.zoom });
      }

      setFocusedProvince(clickedName);
      setMapCenter([center.lng, center.lat]);
      setMapZoom(center.zoom);
    });

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.dispose();
      }
      chartInstance.current = null;
    };
  }, []);

  // ---------- 重绘 ----------
  useEffect(() => {
    if (!chartInstance.current || !mapLoaded) return;
    if (chartInstance.current.isDisposed()) return;
    chartInstance.current.setOption(
      getOption(routes, pendingStart, pendingEnd, mapCenter, mapZoom, focusedProvince),
      { replaceMerge: ['series'] },
    );
  }, [routes, pendingStart, pendingEnd, mapCenter, mapZoom, mapLoaded, focusedProvince, getOption]);

  // ---------- 城市点击 ----------
  const handleCityClick = useCallback(
    (city: CityCoord) => {
      if (modalVisible) {
        void message.info('请先完成当前输入的参数');
        return;
      }

      const isCurrentStart = pendingStart?.name === city.name;
      const isCurrentEnd = pendingEnd?.name === city.name;

      // 取消起点
      if (isCurrentStart) {
        setPendingStart(null);
        setStartProvince('');
        void message.info(`已取消起点：${city.name}`);
        return;
      }
      // 取消终点
      if (isCurrentEnd) {
        setPendingEnd(null);
        setEndProvince('');
        void message.info(`已取消终点：${city.name}`);
        return;
      }

      // 起点位空 → 填入起点
      if (!pendingStart) {
        setPendingStart(city);
        setStartProvince(city.province);
        setViewProvince(city.province); // 视图跟随
        void message.info(`已选起点：${city.name}`);
        return;
      }

      // 终点位空 → 填入终点
      if (!pendingEnd) {
        setPendingEnd(city);
        setEndProvince(city.province);
        setViewProvince(city.province); // 视图跟随
        void message.info(`已选终点：${city.name}`);
        return;
      }

      // 起终点都齐了 → 开始下一条
      setPendingStart(city);
      setPendingEnd(null);
      setStartProvince(city.province);
      setEndProvince('');
      setViewProvince(city.province);
      void message.info(`已选起点：${city.name}，请继续选择终点`);
    },
    [pendingStart, pendingEnd, modalVisible],
  );

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart || !mapLoaded) return;

    const clickHandler = (params: any) => {
      const clickableSeries = ['城市', '待选起点', '待选终点', '路线端点'];
      if (!clickableSeries.includes(params.seriesName)) return;

      const cityName = params.name;
      if (!cityName) return;

      const found = cityData.find((c) => c.name === cityName);
      if (!found) {
        void message.warning(`未找到城市"${cityName}"的坐标数据`);
        return;
      }
      handleCityClick(found);
    };

    chart.on('click', clickHandler);
    return () => {
      chart.off('click', clickHandler);
    };
  }, [mapLoaded, handleCityClick, cityData]);

  // ---------- 加载两地共有品类 ----------
  const loadCommonMaterials = useCallback(async (start: CityCoord, end: CityCoord) => {
    setLoadingMaterials(true);
    try {
      const list = await fetchCommonMaterials(start.name, end.name);
      setCommonMaterials(list.map((m) => m.material_name));
    } catch (err) {
      console.error('加载共有品类失败', err);
      void message.error('加载两地共有品类失败');
      setCommonMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, []);

  const handleMainButton = async () => {
    if (!pendingStart || !pendingEnd) {
      void message.warning('请先选择起点和终点');
      return;
    }
    form.resetFields();
    setCommonMaterials([]);
    setModalVisible(true);
    await loadCommonMaterials(pendingStart, pendingEnd);
  };

  // ---------- 计算并保存 ----------
  const handleCalculate = async (values: {
    costPerKm: number;
    category: string;
    weight: number;
  }) => {
    const { costPerKm, category, weight } = values;
    const start = pendingStart;
    const end = pendingEnd;
    if (!start || !end) {
      void message.error('请选择起点和终点');
      return;
    }

    setCalculating(true);
    try {
      const [startPriceRes, endPriceRes] = await Promise.all([
        fetchLatestPrice(start.name, category),
        fetchLatestPrice(end.name, category),
      ]);

      if (!startPriceRes || !endPriceRes) {
        void message.error('两地缺少该品类的最新价格数据');
        return;
      }

      const startLow = startPriceRes.low_price ?? 0;
      const startHigh = startPriceRes.high_price ?? 0;
      const endLow = endPriceRes.low_price ?? 0;
      const endHigh = endPriceRes.high_price ?? 0;

      const startPrice = (startLow + startHigh) / 2;
      const endPrice = (endLow + endHigh) / 2;

      const distance = haversineDistance(start.lat, start.lng, end.lat, end.lng);
      const priceGain = (endPrice - startPrice) * weight;
      const freight = distance * costPerKm;
      const totalCost = priceGain - freight;

      const result: CalcResult = {
        cost: totalCost,
        distance,
        formula: {
          startPrice,
          endPrice,
          priceGain,
          freight,
          weight,
          costPerKm,
          category,
          startDate: startPriceRes.price_date,
          endDate: endPriceRes.price_date,
        },
      };

      setRoutes((prev) => {
        if (prev.length >= ROUTE_LIMIT) {
          void message.warning(`最多保留 ${ROUTE_LIMIT} 条路线，请先删除部分路线`);
          return prev;
        }
        const item: RouteItem = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          start,
          end,
          color: ROUTE_COLORS[prev.length % ROUTE_COLORS.length],
          result,
          createdAt: Date.now(),
        };
        return [...prev, item];
      });

      setPendingStart(null);
      setPendingEnd(null);
      setStartProvince('');
      setEndProvince('');
      setModalVisible(false);
      void message.success('已添加一条路线，可继续选择新的起点');
    } catch (err) {
      console.error(err);
      void message.error('获取价格失败，请检查后端');
    } finally {
      setCalculating(false);
    }
  };

  // ---------- 其它操作 ----------
  const resetAll = () => {
    setPendingStart(null);
    setPendingEnd(null);
    setRoutes([]);
    setModalVisible(false);
    setStartProvince('');
    setEndProvince('');
    setMapCenter(DEFAULT_MAP_CENTER);
    setMapZoom(DEFAULT_MAP_ZOOM);
    setViewProvince('全国');
    setCommonMaterials([]);
    setPreviousView(null);
    setFocusedProvince(null);
    form.resetFields();
    void message.success('已重置');
  };

  const handleSwap = () => {
    if (!pendingStart || !pendingEnd) {
      void message.info('请先选好起点和终点');
      return;
    }
    const s = pendingStart;
    const e = pendingEnd;
    setPendingStart(e);
    setPendingEnd(s);
    setStartProvince(e.province);
    setEndProvince(s.province);
  };

  const removeRoute = (id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id));
  };

  const focusRoute = (r: RouteItem) => {
    const lng = (r.start.lng + r.end.lng) / 2;
    const lat = (r.start.lat + r.end.lat) / 2;
    setMapCenter([lng, lat]);
    setMapZoom(5);
    setFocusedProvince(null);
    setPreviousView(null);
  };

  const distance = pendingStart && pendingEnd
    ? haversineDistance(pendingStart.lat, pendingStart.lng, pendingEnd.lat, pendingEnd.lng)
    : 0;

  const startCityOptions = useMemo(() => {
    const cities = startProvince
      ? cityData.filter((c) => c.province === startProvince)
      : cityData;
    return cities.map((c) => ({ label: c.name, value: c.name }));
  }, [startProvince, cityData]);

  const endCityOptions = useMemo(() => {
    const cities = endProvince
      ? cityData.filter((c) => c.province === endProvince)
      : cityData;
    return cities.map((c) => ({ label: c.name, value: c.name }));
  }, [endProvince, cityData]);

  const provinceOptions = useMemo(
    () => provinces.filter((p) => p !== '全国').map((p) => ({ label: p, value: p })),
    [provinces],
  );

  const materialOptions = useMemo(
    () => commonMaterials.map((m) => ({ label: m, value: m })),
    [commonMaterials],
  );

  const materialPlaceholder = loadingMaterials
    ? '加载中…'
    : commonMaterials.length === 0
    ? '两地暂无共有品类'
    : '选择品类';

  const hintText = !pendingStart
    ? '① 选一个起点（可点地图城市或已保存路线的端点）'
    : !pendingEnd
    ? '② 再选一个终点（重复点击已选点可取消）'
    : '③ 点击"输入参数并计算"添加路线，或点击新城市开始下一条';

  const latestResult = routes.length > 0 ? routes[routes.length - 1].result : null;

  return (
    <div>
      <Card styles={{ body: { padding: 16 } }}>
        <div
          style={{
            display: 'flex',
            gap: 16,
            flexWrap: 'wrap',
            alignItems: 'stretch',
          }}
        >
          {/* ===== 左侧：地图 ===== */}
          <div
            style={{
              flex: 1,
              minWidth: 320,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 620,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div
                style={{
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(6px)',
                  padding: '8px 14px',
                  borderRadius: 10,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  fontSize: 13,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AimOutlined style={{ color: '#1677ff' }} />
                <span style={{ fontWeight: 500 }}>{hintText}</span>
              </div>

              {focusedProvince && previousView && (
                <Button
                  size="small"
                  icon={<ArrowRightOutlined rotate={180} />}
                  onClick={() => {
                    setMapCenter(previousView.center);
                    setMapZoom(previousView.zoom);
                    setPreviousView(null);
                    setFocusedProvince(null);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.95)',
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    borderRadius: 10,
                  }}
                >
                  返回
                </Button>
              )}
            </div>

            <div
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                zIndex: 10,
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(6px)',
                padding: '5px 10px',
                borderRadius: 999,
                fontSize: 12,
                color: mapLoaded && !loadingGeo ? '#16a34a' : '#94a3b8',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: mapLoaded && !loadingGeo ? '#22c55e' : '#cbd5e1',
                  boxShadow: mapLoaded && !loadingGeo ? '0 0 0 3px rgba(34,197,94,0.2)' : 'none',
                }}
              />
              {!mapLoaded || loadingGeo ? '加载中…' : `缩放 ${mapZoom.toFixed(2)}`}
            </div>

            {routes.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 12,
                  left: 12,
                  zIndex: 10,
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(6px)',
                  padding: '6px 12px',
                  borderRadius: 10,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  fontSize: 12,
                  color: '#334155',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontWeight: 600, color: '#1677ff' }}>{routes.length}</span>
                <span>条路线已保留</span>
              </div>
            )}

            <div
              ref={chartRef}
              style={{
                flex: 1,
                width: '100%',
                minHeight: 500,
                borderRadius: 12,
                overflow: 'hidden',
                background: 'linear-gradient(180deg,#f7fbff 0%,#eef6fc 100%)',
              }}
            />
          </div>

          {/* ===== 右侧控制面板 ===== */}
          <div style={{ flex: '0 0 280px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 12,
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#dcfce7',
                    color: '#16a34a',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >起</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                  {pendingStart ? pendingStart.name : (
                    <span style={{ color: '#94a3b8', fontWeight: 400 }}>未选择起点</span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', margin: '2px 0 8px' }}>
                <div style={{ width: 20, display: 'flex', justifyContent: 'center' }}>
                  <div style={{ width: 1, height: 20, borderLeft: '1px dashed #cbd5e1' }} />
                </div>
                <Tooltip title="互换起点终点">
                  <Button
                    type="text"
                    size="small"
                    icon={<SwapOutlined />}
                    onClick={handleSwap}
                    style={{ marginLeft: 4, color: '#64748b' }}
                  />
                </Tooltip>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fef3c7',
                    color: '#d97706',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >终</div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: '#0f172a' }}>
                  {pendingEnd ? pendingEnd.name : (
                    <span style={{ color: '#94a3b8', fontWeight: 400 }}>未选择终点</span>
                  )}
                </div>
              </div>

              {pendingStart && pendingEnd && (
                <div
                  style={{
                    marginTop: 10,
                    padding: '6px 10px',
                    background: '#eff6ff',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <EnvironmentOutlined />
                  直线距离约 <b>{distance.toFixed(1)}</b> km
                </div>
              )}
            </div>

            {/* 省份/城市选择 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>起点（省份 / 城市）</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Select
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="省份"
                    value={startProvince || undefined}
                    options={provinceOptions}
                    onChange={(value) => {
                      setStartProvince(value || '');
                      if (pendingStart && pendingStart.province !== value) setPendingStart(null);
                      // 选择具体省份 → 视图缩放并清除之前的地图点击聚焦
                      if (value) {
                        setFocusedProvince(null);
                        setPreviousView(null);
                        setViewProvince(value);
                      }
                    }}
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    size="small"
                    loading={loadingGeo}
                  />
                  <Select
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="城市"
                    value={pendingStart?.name}
                    options={startCityOptions}
                    onChange={(value) => {
                      const city = cityData.find((c) => c.name === value);
                      if (city) handleCityClick(city);
                    }}
                    showSearch
                    optionFilterProp="label"
                    size="small"
                    disabled={loadingGeo}
                  />
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>终点（省份 / 城市）</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Select
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="省份"
                    value={endProvince || undefined}
                    options={provinceOptions}
                    onChange={(value) => {
                      setEndProvince(value || '');
                      if (pendingEnd && pendingEnd.province !== value) setPendingEnd(null);
                      // 选择具体省份 → 视图缩放并清除之前的地图点击聚焦
                      if (value) {
                        setFocusedProvince(null);
                        setPreviousView(null);
                        setViewProvince(value);
                      }
                    }}
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    size="small"
                    loading={loadingGeo}
                  />
                  <Select
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="城市"
                    value={pendingEnd?.name}
                    options={endCityOptions}
                    onChange={(value) => {
                      const city = cityData.find((c) => c.name === value);
                      if (city) handleCityClick(city);
                    }}
                    showSearch
                    optionFilterProp="label"
                    size="small"
                    disabled={loadingGeo}
                  />
                </div>
              </div>
            </div>

            <Button
              type="primary"
              size="large"
              block
              icon={<ThunderboltOutlined />}
              onClick={handleMainButton}
              disabled={!pendingStart || !pendingEnd}
            >
              输入参数并计算
            </Button>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                block
                size="small"
                style={{ color: '#64748b' }}
                onClick={() => {
                  setPendingStart(null);
                  setPendingEnd(null);
                  setStartProvince('');
                  setEndProvince('');
                }}
                disabled={!pendingStart && !pendingEnd}
              >
                清空当前选择
              </Button>
              <Button
                danger
                block
                size="small"
                onClick={resetAll}
                disabled={routes.length === 0 && !pendingStart && !pendingEnd}
              >
                重置
              </Button>
            </div>

            {/* 最新一条结果 */}
            {latestResult && (
              <Card
                size="small"
                styles={{ body: { padding: 12 } }}
                style={{
                  background: latestResult.cost >= 0
                    ? 'linear-gradient(135deg,#f0fdf4,#ecfdf5)'
                    : 'linear-gradient(135deg,#fef2f2,#fff1f2)',
                  borderColor: latestResult.cost >= 0 ? '#bbf7d0' : '#fecaca',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>最新收益</span>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: latestResult.cost >= 0 ? '#16a34a' : '#dc2626',
                      fontFamily: 'ui-monospace, monospace',
                    }}
                  >
                    {latestResult.cost >= 0 ? '+' : ''}{latestResult.cost.toFixed(2)}
                    <span style={{ fontSize: 12, fontWeight: 500, marginLeft: 2 }}>元</span>
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      货价差（{latestResult.formula.category} {latestResult.formula.startPrice.toFixed(0)} → {latestResult.formula.endPrice.toFixed(0)}，× {latestResult.formula.weight}）
                    </span>
                    <span style={{ color: '#0f172a' }}>+{latestResult.formula.priceGain.toFixed(0)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>运费（{latestResult.distance.toFixed(0)} × {latestResult.formula.costPerKm}）</span>
                    <span style={{ color: '#0f172a' }}>-{latestResult.formula.freight.toFixed(0)}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* 路线列表 */}
            <div style={{ marginTop: 4 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <UnorderedListOutlined /> 地图路线
                  {routes.length > 0 && (
                    <span style={{ color: '#94a3b8', fontWeight: 400 }}>({routes.length})</span>
                  )}
                </span>
                {routes.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    style={{ fontSize: 12, padding: 0 }}
                    onClick={() => setRoutes([])}
                  >
                    全部清除
                  </Button>
                )}
              </div>

              {routes.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span style={{ fontSize: 12, color: '#94a3b8' }}>暂无路线</span>}
                  style={{ margin: '8px 0' }}
                />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    maxHeight: 260,
                    overflowY: 'auto',
                    paddingRight: 2,
                  }}
                >
                  {[...routes].reverse().map((r) => (
                    <div
                      key={r.id}
                      onClick={() => focusRoute(r)}
                      title="点击定位到该路线"
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: '#f8fafc',
                        border: '1px solid #eef2f7',
                        cursor: 'pointer',
                        fontSize: 12,
                        transition: 'all .15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#eff6ff';
                        e.currentTarget.style.borderColor = '#bfdbfe';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.borderColor = '#eef2f7';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: r.color,
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            color: '#0f172a',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {r.start.name} → {r.end.name}
                        </span>
                        <span
                          style={{
                            color: r.result.cost >= 0 ? '#16a34a' : '#dc2626',
                            fontWeight: 600,
                            flexShrink: 0,
                          }}
                        >
                          {r.result.cost >= 0 ? '+' : ''}{r.result.cost.toFixed(0)}
                        </span>
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseOutlined style={{ fontSize: 10 }} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRoute(r.id);
                          }}
                          style={{ color: '#cbd5e1', padding: 0, width: 18, height: 18, minWidth: 18 }}
                        />
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          paddingLeft: 14,
                          fontSize: 11,
                          color: '#94a3b8',
                          display: 'flex',
                          gap: 6,
                          alignItems: 'center',
                        }}
                      >
                        <Tag
                          color="blue"
                          style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '15px' }}
                        >
                          {r.result.formula.category}
                        </Tag>
                        <span>{r.result.formula.weight}t</span>
                        <span>·</span>
                        <span>{r.result.distance.toFixed(0)}km</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Modal
        title="输入运输参数"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
        destroyOnHidden
        width={420}
      >
        {pendingStart && pendingEnd && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              background: '#f8fafc',
              borderRadius: 8,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <span style={{ color: '#16a34a', fontWeight: 600 }}>{pendingStart.name}</span>
            <ArrowRightOutlined style={{ color: '#94a3b8' }} />
            <span style={{ color: '#d97706', fontWeight: 600 }}>{pendingEnd.name}</span>
            <Tag color="blue">{distance.toFixed(0)} km</Tag>
          </div>
        )}
        <Form form={form} onFinish={handleCalculate} layout="vertical">
          <Form.Item
            name="category"
            label="废品品类"
            rules={[{ required: true, message: '请选择废品品类' }]}
          >
            <Select
              options={materialOptions}
              placeholder={materialPlaceholder}
              loading={loadingMaterials}
              disabled={loadingMaterials || commonMaterials.length === 0}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item
            name="weight"
            label="重量（吨）"
            rules={[
              { required: true, message: '请输入重量' },
              {
                validator: (_, value) => {
                  const num = Number(value);
                  if (isNaN(num) || num <= 0) {
                    return Promise.reject(new Error('重量必须为大于0的数字'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input type="number" placeholder="输入重量（吨）" step="0.1" />
          </Form.Item>
          <Form.Item
            name="costPerKm"
            label="每公里费用（元/公里）"
            rules={[
              { required: true, message: '请输入每公里费用' },
              {
                validator: (_, value) => {
                  const num = Number(value);
                  if (isNaN(num) || num <= 0) {
                    return Promise.reject(new Error('每公里费用必须为大于0的数字'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
          >
            <Input type="number" placeholder="输入每公里费用" step="0.01" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={calculating}
            >
              计算并添加到地图
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MapPage;