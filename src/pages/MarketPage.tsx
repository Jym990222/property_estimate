import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Card,
  Select,
  Button,
  Table,
  Space,
  Typography,
  Tag,
  Spin,
  Empty,
  message,
  Grid,
} from 'antd';
import { ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { fetchCities, type CityDTO } from '../api/geo';
import {
  fetchPricesByCity,
  type CityMaterialLatestDTO,
} from '../api/price';
import {
  fetchFuturesLatest,
  type FuturesLatestDTO,
} from '../api/futures';

const { Title, Text } = Typography;

// SHFE 卡片配色
const PRODUCT_COLORS: Record<string, string> = {
  cu: '#faad14',
  al: '#1890ff',
  rb: '#ff4d4f',
  ni: '#52c41a',
  ss: '#722ed1',
};

const PRODUCT_ALIAS: Record<string, string> = {
  cu: '铜基',
  al: '铝基',
  rb: '钢铁基',
  ni: '镍基',
  ss: '不锈钢基',
};

function escapeCSV(field: string): string {
  const s = String(field ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const MarketPage = () => {
  // 断点：xl（≥1200px）一行 5 个，否则一行 3 个
  const screens = Grid.useBreakpoint();
  const cardCols = screens.xl ? 5 : 3;

  // ---------- 城市 ----------
  const [allCities, setAllCities] = useState<CityDTO[]>([]);
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');

  // ---------- SHFE 5 个基 ----------
  const [latest, setLatest] = useState<FuturesLatestDTO[]>([]);
  const [loadingLatest, setLoadingLatest] = useState(false);

  // ---------- 城市废品表格 ----------
  const [tableRows, setTableRows] = useState<CityMaterialLatestDTO[]>([]);
  const [loadingTable, setLoadingTable] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const provinces = useMemo(
    () => Array.from(new Set(allCities.map((c) => c.province_name))),
    [allCities],
  );

  const citiesInProvince = useMemo(
    () => allCities.filter((c) => c.province_name === province).map((c) => c.city_name),
    [allCities, province],
  );

  // ---------- 拉城市列表 ----------
  useEffect(() => {
    let cancelled = false;
    fetchCities()
      .then((list) => {
        if (cancelled) return;
        setAllCities(list);
        if (list.length > 0) {
          setProvince(list[0].province_name);
          setCity(list[0].city_name);
        }
      })
      .catch((err) => {
        console.error(err);
        void message.error('加载城市失败');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- 拉 SHFE 5 个基 ----------
  const loadLatest = useCallback(async () => {
    setLoadingLatest(true);
    try {
      const list = await fetchFuturesLatest();
      setLatest(list);
    } catch (err) {
      console.error(err);
      void message.error('期货基准价加载失败');
    } finally {
      setLoadingLatest(false);
    }
  }, []);

  // ---------- 拉城市废品最新价 ----------
  const loadTable = useCallback(async (targetCity: string) => {
    if (!targetCity) return;
    setLoadingTable(true);
    try {
      const rows = await fetchPricesByCity(targetCity);
      setTableRows(rows);
    } catch (err) {
      console.error(err);
      void message.error(`${targetCity} 废品行情加载失败`);
      setTableRows([]);
    } finally {
      setLoadingTable(false);
    }
  }, []);

  // ---------- 初始加载 ----------
  useEffect(() => {
    void loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (city) void loadTable(city);
  }, [city, loadTable]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadLatest(), city ? loadTable(city) : Promise.resolve()]);
    setRefreshing(false);
    void message.success('已刷新');
  };

  const handleProvinceChange = (value: string) => {
    setProvince(value);
    const first = allCities.find((c) => c.province_name === value);
    if (first) setCity(first.city_name);
  };

  // ---------- 表格列 ----------
  const columns = [
    {
      title: '品类',
      dataIndex: 'material_name',
      key: 'material_name',
      width: 220,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: '报价（元/吨）',
      dataIndex: 'price',
      key: 'price',
      align: 'right' as const,
      width: 160,
      render: (v: number | null) =>
        v == null ? (
          <Text type="secondary">-</Text>
        ) : (
          <Text strong style={{ color: '#faad14' }}>
            ¥ {v.toLocaleString()}
          </Text>
        ),
    },
    {
      title: '最低价',
      dataIndex: 'low_price',
      key: 'low_price',
      align: 'right' as const,
      width: 120,
      render: (v: number | null) => (v == null ? '-' : v.toLocaleString()),
    },
    {
      title: '最高价',
      dataIndex: 'high_price',
      key: 'high_price',
      align: 'right' as const,
      width: 120,
      render: (v: number | null) => (v == null ? '-' : v.toLocaleString()),
    },
    {
      title: '更新日期',
      dataIndex: 'price_date',
      key: 'price_date',
      width: 130,
      render: (v: string) => (
        <Tag color="blue" style={{ margin: 0 }}>
          {v}
        </Tag>
      ),
    },
  ];

  // ---------- 导出 CSV ----------
  const exportCSV = () => {
    if (tableRows.length === 0) {
      void message.warning('暂无数据可导出');
      return;
    }
    try {
      const header = ['品类', '报价(元/吨)', '最低价', '最高价', '更新日期'];
      const rows = tableRows.map((r) => [
        r.material_name,
        r.price == null ? '' : String(r.price),
        r.low_price == null ? '' : String(r.low_price),
        r.high_price == null ? '' : String(r.high_price),
        r.price_date,
      ]);
      const csvContent =
        '\uFEFF' + [header, ...rows].map((r) => r.map(escapeCSV).join(',')).join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `废品行情_${city}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      void message.success('已导出 CSV');
    } catch {
      void message.error('导出失败');
    }
  };

  return (
    <div>
      <Title level={3} style={{ marginBottom: 20 }}>
        行情参数与废旧金属估算（按基准日复核）
      </Title>

      {/* ===== 城市选择 + 刷新 + 导出 ===== */}
      <Space style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        <Select
          value={province || undefined}
          onChange={handleProvinceChange}
          style={{ width: 120 }}
          placeholder="省份"
          showSearch
          optionFilterProp="label"
          options={provinces.map((p) => ({ label: p, value: p }))}
        />
        <Select
          value={city || undefined}
          onChange={setCity}
          style={{ width: 140 }}
          placeholder="城市"
          showSearch
          optionFilterProp="label"
          options={citiesInProvince.map((c) => ({ label: c, value: c }))}
        />
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          刷新参数
        </Button>
        <Button
          icon={<DownloadOutlined />}
          onClick={exportCSV}
          disabled={tableRows.length === 0}
        >
          导出 CSV
        </Button>
        <Tag color="orange">
          提示：内置参数仅用于初算，正式评估应以基准日公开行情复核
        </Tag>
      </Space>

      {/* ===== SHFE 5 个基：xl 一行 5 个，其他一行 3 个 ===== */}
      {loadingLatest && latest.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 30, marginBottom: 20 }}>
          <Spin />
        </div>
      ) : latest.length === 0 ? (
        <div style={{ marginBottom: 20 }}>
          <Empty description="暂无期货数据，请先运行 crawler_shfe.py" />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cardCols}, minmax(0, 1fr))`,
            gap: 12,
            marginBottom: 20,
          }}
        >
          {latest.map((item) => {
            const color = PRODUCT_COLORS[item.product_code] ?? '#94a3b8';
            const alias = PRODUCT_ALIAS[item.product_code] ?? item.product_name;
            return (
              <Card
                key={item.product_code}
                size="small"
                title={alias}
                style={{
                  borderLeft: `4px solid ${color}`,
                  minWidth: 0,
                }}
                styles={{ body: { padding: '10px 12px' } }}
                extra={
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {item.contract}
                  </Text>
                }
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ¥ {item.settlement.toLocaleString()}
                </Text>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  {dayjs(item.trade_date).format('YYYY-MM-DD')}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ===== 城市废品表格 ===== */}
      <Card
        size="small"
        title={
          <Space>
            <span>{city || '未选择城市'} · 废品行情</span>
            {tableRows.length > 0 && (
              <Tag color="blue">共 {tableRows.length} 项</Tag>
            )}
          </Space>
        }
      >
        <Table
          rowKey="material_name"
          columns={columns}
          dataSource={tableRows}
          loading={loadingTable}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          bordered
          size="small"
          locale={{
            emptyText: (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={city ? '该城市暂无废品数据' : '请先选择城市'}
              />
            ),
          }}
        />
      </Card>

      <div style={{ marginTop: 12, color: '#94a3b8', fontSize: 12 }}>
        说明：上方基准价为上海期货交易所主力合约结算价；下方为选定城市的废品行情（价格 = 最低价与最高价的均值）。
      </div>
    </div>
  );
};

export default MarketPage;