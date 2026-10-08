import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ClearOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  EyeOutlined,
  LinkOutlined,
  ReloadOutlined,
  StarFilled,
  StarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ApiError } from '../api/http';
import {
  cleanupLogFiles,
  deleteLogFile,
  deleteLogs,
  executeCleanup,
  exportUrlFromLinks,
  fetchLogDetail,
  fetchLogFile,
  fetchLogFiles,
  fetchLogInfo,
  fetchLogs,
  fetchLogStats,
  followLogs,
  logExportUrl,
  markLogKey,
  previewCleanup,
  type LogFileInfo,
  type LogItem,
  type LogQueryPayload,
  type LogStats,
  type LogStoreInfo,
} from '../api/logs';
import type { ApiLink } from '../api/http';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

/** 统一展示规范错误包装里的 message + details */
function showApiError(error: unknown, fallback: string): void {
  if (error instanceof ApiError) {
    const detail = error.detailText;
    void message.error(detail ? `${error.message}（${detail}）` : error.message);
    return;
  }
  void message.error(fallback);
}

const LEVEL_COLOR: Record<string, string> = {
  FATAL: 'magenta',
  ERROR: 'red',
  WARN: 'orange',
  INFO: 'blue',
  DEBUG: 'default',
};

const LEVEL_OPTIONS = ['FATAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'].map((v) => ({ value: v, label: v }));

const TYPE_LABEL: Record<string, string> = {
  api: '接口',
  business: '业务',
  ai: 'AI 问答',
  db: '数据库',
  crawler: '数据采集',
  system: '系统',
};

const TYPE_OPTIONS = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

function prettyDetail(raw?: string | null): string {
  if (!raw) return '（无附加明细）';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

const LogsPage = () => {
  // ---------- 列表状态 ----------
  const [items, setItems] = useState<LogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  /** 服务端超媒体链接：翻页/导出直接用它，避免客户端重拼条件 */
  const [links, setLinks] = useState<Record<string, ApiLink>>({});

  // ---------- 筛选条件 ----------
  const [levels, setLevels] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [onlyKey, setOnlyKey] = useState(false);
  const [onlySlow, setOnlySlow] = useState(false);

  // ---------- 概览 / 详情 ----------
  const [info, setInfo] = useState<LogStoreInfo | null>(null);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [statDays, setStatDays] = useState(7);
  const [detail, setDetail] = useState<LogItem | null>(null);
  const [detailLinks, setDetailLinks] = useState<Record<string, ApiLink>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [traceView, setTraceView] = useState<{ total: number; items: LogItem[] } | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  // ---------- 兜底文件 ----------
  const [files, setFiles] = useState<LogFileInfo[]>([]);
  const [logDir, setLogDir] = useState('');
  const [filesLoading, setFilesLoading] = useState(false);
  const [fileView, setFileView] = useState<{ name: string; total: number; rows: Record<string, unknown>[] } | null>(null);
  const [fileViewLoading, setFileViewLoading] = useState(false);
  const [tabKey, setTabKey] = useState('db');

  // ---------- 清理 ----------
  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupDays, setCleanupDays] = useState(30);
  const [cleanupFileDays, setCleanupFileDays] = useState(30);
  const [cleanupIncludeKey, setCleanupIncludeKey] = useState(false);
  const [cleanupDryRun, setCleanupDryRun] = useState(true);
  const [cleanupBusy, setCleanupBusy] = useState(false);

  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const slowMs = info?.slow_ms ?? 3000;

  // ---------- 组装查询条件 ----------
  const queryPayload = useCallback(
    (): LogQueryPayload => ({
      page,
      page_size: pageSize,
      order: 'desc',
      level: levels.length > 0 ? levels : undefined,
      log_type: types.length > 0 ? types : undefined,
      keyword: keyword.trim() || undefined,
      date_from: range?.[0]?.format('YYYY-MM-DD'),
      date_to: range?.[1]?.format('YYYY-MM-DD'),
      is_important: onlyKey ? true : undefined,
      min_duration_ms: onlySlow ? slowMs : undefined,
    }),
    [page, pageSize, levels, types, keyword, range, onlyKey, onlySlow, slowMs],
  );

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchLogs(queryPayload());
      setItems(data.items ?? []);
      setTotal(Number(data.total ?? 0));
      setLinks(data.links ?? {});
      if (data.degraded) {
        void message.warning('数据库日志不可用，已降级为本地文件日志');
      }
    } catch (error) {
      showApiError(error, '日志加载失败，请确认后端已启动');
    } finally {
      setLoading(false);
    }
  }, [queryPayload]);

  /** 跟随服务端链接（超媒体）：翻页时用它，链接里已带当前全部过滤条件 */
  const gotoHref = useCallback(async (href: string) => {
    setLoading(true);
    try {
      const data = await followLogs(href);
      setItems(data.items ?? []);
      setTotal(Number(data.total ?? 0));
      setLinks(data.links ?? {});
      setPage(Number(data.page ?? 1));
      setPageSize(Number(data.page_size ?? 20));
      setSelectedKeys([]);
    } catch (error) {
      showApiError(error, '翻页失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStats = useCallback(async (days: number) => {
    try {
      setStats(await fetchLogStats(days));
    } catch {
      /* 概览失败不影响列表 */
    }
  }, []);

  const loadInfo = useCallback(async () => {
    try {
      const data = await fetchLogInfo();
      setInfo(data);
      setLogDir(data.log_dir);
      setCleanupDays(data.retention_days);
      setCleanupFileDays(data.retention_days);
    } catch {
      /* 忽略 */
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setFilesLoading(true);
    try {
      const data = await fetchLogFiles();
      setFiles(data.items ?? []);
      setLogDir(data.log_dir || '');
    } catch (error) {
      showApiError(error, '兜底日志文件加载失败');
    } finally {
      setFilesLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void loadLogs();
    void loadStats(statDays);
    void loadInfo();
    void loadFiles();
  }, [loadLogs, loadStats, loadInfo, loadFiles, statDays]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    void loadInfo();
    void loadFiles();
  }, [loadInfo, loadFiles]);

  useEffect(() => {
    void loadStats(statDays);
  }, [loadStats, statDays]);

  // ---------- 趋势图 ----------
  const daily = useMemo(() => stats?.daily ?? [], [stats]);
  /** 详情应答里的超媒体链接：同一请求链路 */
  const sameTraceHref = detailLinks.same_trace?.href;

  // 容器在 JSX 中始终渲染，这里负责初始化与销毁
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chartInstance.current = chart;
    const observer = new ResizeObserver(() => {
      if (chartRef.current && chartRef.current.clientWidth > 0) chart.resize();
    });
    observer.observe(chartRef.current);
    return () => {
      observer.disconnect();
      if (chartInstance.current && !chartInstance.current.isDisposed()) chartInstance.current.dispose();
      chartInstance.current = null;
    };
  }, []);

  useEffect(() => {
    const container = chartRef.current;
    if (!container) return;
    let chart = chartInstance.current;
    if (!chart || chart.isDisposed()) {
      // 兜底：容器晚于挂载出现时也能初始化
      chart = echarts.init(container);
      chartInstance.current = chart;
    }
    chart.setOption(
      {
        tooltip: { trigger: 'axis' },
        legend: { data: ['FATAL', 'ERROR', 'WARN', 'INFO'], top: 0, itemHeight: 8, textStyle: { fontSize: 11 } },
        grid: { left: 40, right: 12, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: daily.map((d) => d.date.slice(5)) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          { name: 'FATAL', type: 'bar', stack: 'x', itemStyle: { color: '#eb2f96' }, data: daily.map((d) => d.FATAL ?? 0) },
          { name: 'ERROR', type: 'bar', stack: 'x', itemStyle: { color: '#ff4d4f' }, data: daily.map((d) => d.ERROR) },
          { name: 'WARN', type: 'bar', stack: 'x', itemStyle: { color: '#faad14' }, data: daily.map((d) => d.WARN) },
          { name: 'INFO', type: 'bar', stack: 'x', itemStyle: { color: '#1890ff' }, data: daily.map((d) => d.INFO) },
        ],
      },
      true,
    );
    chart.resize();
  }, [daily]);

  // ---------- 交互 ----------
  const openDetail = useCallback(async (row: LogItem) => {
    setDetail(row);
    setDetailLinks({});
    setDetailLoading(true);
    try {
      const data = await fetchLogDetail(row.log_id);
      setDetail(data.item);
      setDetailLinks(data.links ?? {});
    } catch (error) {
      showApiError(error, '日志详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  /** 超媒体用法：跟随详情应答里的 _links.same_trace 查看同一请求链路的全部日志 */
  const openTraceView = useCallback(async (href: string) => {
    setTraceLoading(true);
    try {
      const data = await followLogs(href);
      setTraceView({ total: data.total, items: data.items ?? [] });
    } catch (error) {
      showApiError(error, '链路日志加载失败');
    } finally {
      setTraceLoading(false);
    }
  }, []);

  const toggleKey = useCallback(
    async (row: LogItem, next: boolean) => {
      try {
        await markLogKey(row.log_id, next);
        void message.success(next ? '已标记为重要（清理时会保留）' : '已取消重要标记');
        await loadLogs();
        await loadStats(statDays);
      } catch (error) {
        showApiError(error, '标记失败');
      }
    },
    [loadLogs, loadStats, statDays],
  );

  const removeSelected = async () => {
    const ids = selectedKeys.map((k) => Number(k)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) return;
    try {
      const deleted = await deleteLogs(ids);
      void message.success(`已删除 ${deleted} 条日志`);
      setSelectedKeys([]);
      refreshAll();
    } catch (error) {
      showApiError(error, '删除失败');
    }
  };

  const removeOne = async (row: LogItem) => {
    try {
      await deleteLogs([row.log_id]);
      void message.success(`已删除日志 #${row.log_id}`);
      setDetail(null);
      refreshAll();
    } catch (error) {
      showApiError(error, '删除失败');
    }
  };

  const downloadCSV = () => {
    if (total === 0) {
      void message.warning('当前筛选条件下没有日志可导出');
      return;
    }
    // 优先使用服务端 _links.log_exports（条件与列表完全一致），拿不到时退回客户端拼装
    const url = exportUrlFromLinks(links) ?? logExportUrl(queryPayload());
    window.open(url, '_blank');
    void message.success('已开始导出 CSV');
  };

  // 规范用法：先 GET 同条件试算命中条数，确认后再 DELETE 执行
  const runCleanup = async () => {
    setCleanupBusy(true);
    const createdBefore = dayjs().subtract(cleanupDays, 'day').format('YYYY-MM-DD HH:mm:ss');
    const fileBefore = dayjs().subtract(cleanupFileDays, 'day').format('YYYY-MM-DD');
    try {
      if (cleanupDryRun) {
        const hit = await previewCleanup(createdBefore, cleanupIncludeKey);
        Modal.info({
          title: '清理试算结果（未删除任何数据）',
          content: (
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>删除时间点：早于 {createdBefore}</div>
              <div>将被删除：<Text strong>{hit}</Text> 条</div>
              <div>保留人工标记的重要日志：{cleanupIncludeKey ? '否（会一起删除）' : '是'}</div>
              <div>兜底文件将清理：早于 {fileBefore}</div>
            </div>
          ),
        });
        return;
      }

      const result = await executeCleanup(createdBefore, cleanupIncludeKey);
      let filesDeleted = 0;
      try {
        filesDeleted = await cleanupLogFiles(fileBefore);
      } catch {
        /* 文件清理失败不影响数据库清理结果 */
      }
      Modal.info({
        title: '清理完成',
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>删除时间点：早于 {createdBefore}</div>
            <div>已删除日志：<Text strong>{result.deleted}</Text> 条</div>
            <div>受保护（人工标记重要）未删除：{result.protected_important} 条</div>
            <div>清理后仍匹配该条件的记录：{result.remaining_matching} 条</div>
            <div>兜底文件删除：{filesDeleted} 个</div>
          </div>
        ),
      });
      setCleanupOpen(false);
      refreshAll();
    } catch (error) {
      showApiError(error, '清理失败');
    } finally {
      setCleanupBusy(false);
    }
  };

  const cleanupExpiredFiles = async () => {
    const before = dayjs().subtract(cleanupFileDays, 'day').format('YYYY-MM-DD');
    try {
      const deleted = await cleanupLogFiles(before);
      void message.success(`已清理 ${deleted} 个早于 ${before} 的日志文件`);
      void loadFiles();
      void loadInfo();
    } catch (error) {
      showApiError(error, '文件清理失败');
    }
  };

  const removeFile = async (file: LogFileInfo) => {
    try {
      await deleteLogFile(file.name);
      void message.success(`已删除 ${file.name}`);
      void loadFiles();
      void loadInfo();
    } catch (error) {
      showApiError(error, '文件删除失败');
    }
  };

  const openFile = async (file: LogFileInfo) => {
    setFileViewLoading(true);
    setFileView({ name: file.name, total: 0, rows: [] });
    try {
      const data = await fetchLogFile(file.name, 200, keyword.trim());
      setFileView({ name: data.name, total: data.total, rows: data.items ?? [] });
    } catch (error) {
      showApiError(error, '日志文件读取失败');
      setFileView(null);
    } finally {
      setFileViewLoading(false);
    }
  };

  // ---------- 列定义 ----------
  const columns: TableProps<LogItem>['columns'] = useMemo(
    () => [
      {
        title: '时间',
        dataIndex: 'created_at',
        width: 170,
        render: (value: string, row) => (
          <Tooltip title={`最近出现：${row.last_seen_at}`}>
            <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{value}</span>
          </Tooltip>
        ),
      },
      {
        title: '级别',
        dataIndex: 'level',
        width: 88,
        render: (value: string) => (
          <Tag color={LEVEL_COLOR[value] ?? 'default'} style={{ margin: 0 }}>
            {value}
          </Tag>
        ),
      },
      {
        title: '类型',
        dataIndex: 'log_type',
        width: 96,
        render: (value: string) => <Tag style={{ margin: 0 }}>{TYPE_LABEL[value] ?? value}</Tag>,
      },
      {
        title: '动作',
        dataIndex: 'action',
        width: 190,
        ellipsis: true,
        render: (value: string) => <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{value}</span>,
      },
      {
        title: '摘要',
        dataIndex: 'message',
        ellipsis: true,
        render: (value: string, row) => (
          <Tooltip title={value}>
            <span>
              {value}
              {row.repeat_count > 1 && (
                <Tag color="volcano" style={{ marginLeft: 6 }}>
                  重复 {row.repeat_count} 次
                </Tag>
              )}
            </span>
          </Tooltip>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status_code',
        width: 78,
        align: 'center' as const,
        render: (value: number | null) =>
          value == null ? (
            <Text type="secondary">-</Text>
          ) : (
            <Tag color={value >= 500 ? 'red' : value >= 400 ? 'orange' : 'green'} style={{ margin: 0 }}>
              {value}
            </Tag>
          ),
      },
      {
        title: '耗时',
        dataIndex: 'duration_ms',
        width: 92,
        align: 'right' as const,
        render: (value: number | null) =>
          value == null ? (
            <Text type="secondary">-</Text>
          ) : (
            <Text type={value >= slowMs ? 'danger' : undefined}>{value} ms</Text>
          ),
      },
      {
        title: '重要',
        dataIndex: 'is_key',
        width: 62,
        align: 'center' as const,
        render: (value: number, row) => (
          <Button
            type="text"
            size="small"
            title={value ? '取消重要标记' : '标记为重要（清理时保留）'}
            icon={value ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
            onClick={() => void toggleKey(row, !value)}
          />
        ),
      },
      {
        title: '操作',
        key: 'op',
        width: 74,
        render: (_: unknown, row) => (
          <Button type="link" size="small" onClick={() => void openDetail(row)}>
            详情
          </Button>
        ),
      },
    ],
    [slowMs, toggleKey, openDetail],
  );

  const fileColumns: TableProps<LogFileInfo>['columns'] = [
    { title: '日期', dataIndex: 'date', width: 120 },
    {
      title: '文件名',
      dataIndex: 'name',
      render: (value: string) => <span style={{ fontFamily: 'Consolas, monospace', fontSize: 12 }}>{value}</span>,
    },
    { title: '大小(KB)', dataIndex: 'size_kb', width: 100, align: 'right' as const },
    { title: '行数', dataIndex: 'lines', width: 90, align: 'right' as const },
    { title: '最后修改', dataIndex: 'modified', width: 170 },
    {
      title: '操作',
      key: 'op',
      width: 170,
      render: (_: unknown, row) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => void openFile(row)}>
            查看
          </Button>
          <Popconfirm
            title={`删除日志文件 ${row.name}？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => void removeFile(row)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space align="center" style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          日志维护
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading}>
            刷新
          </Button>
          <Button icon={<CloudDownloadOutlined />} onClick={downloadCSV}>
            导出 CSV
          </Button>
          <Button
            type="primary"
            icon={<ClearOutlined />}
            onClick={() => setCleanupOpen(true)}
            danger
          >
            清理过期日志
          </Button>
        </Space>
      </Space>

      <Paragraph type="secondary" style={{ marginBottom: 12, fontSize: 13 }}>
        只记录有价值的日志：<Text strong>WARN/ERROR</Text>、HTTP 异常（4xx/5xx）、慢请求（≥{slowMs} ms）、
        关键业务动作（AI 问答、数据采集写入）以及<Text strong>人工标记为重要</Text>的记录；
        普通成功请求不入库，相同异常在 {info?.dedup_window ?? 60} 秒内自动合并计数。
        数据库不可用时自动降级写入 <Text code>{logDir || 'backend/logs'}</Text>。
      </Paragraph>

      {info && !info.db_ready && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="数据库日志不可用"
          description={`sys_log 表无法访问，日志已降级写入本地文件：${logDir}（共 ${info.fallback_files} 个文件 / ${info.fallback_lines} 行）`}
        />
      )}

      {/* ===== 概览 ===== */}
      <Row gutter={12} style={{ marginBottom: 4 }}>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="日志总数" value={stats?.total ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="今日新增" value={stats?.today ?? 0} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title={`近 ${statDays} 天错误`}
              value={stats?.error_total ?? 0}
              valueStyle={{ color: (stats?.error_total ?? 0) > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title={`近 ${statDays} 天警告`}
              value={stats?.warn_total ?? 0}
              valueStyle={{ color: (stats?.warn_total ?? 0) > 0 ? '#d46b08' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic title="重要标记" value={stats?.key_total ?? 0} prefix={<StarFilled style={{ color: '#faad14' }} />} />
          </Card>
        </Col>
        <Col xs={12} md={8} lg={4}>
          <Card size="small">
            <Statistic
              title="表占用"
              value={stats?.table?.size_mb ?? 0}
              suffix="MB"
              precision={2}
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        style={{ marginBottom: 12 }}
        title={`近 ${statDays} 天日志趋势`}
        extra={
          <Select
            size="small"
            value={statDays}
            style={{ width: 96 }}
            onChange={(value) => setStatDays(value)}
            options={[7, 14, 30].map((d) => ({ value: d, label: `近 ${d} 天` }))}
          />
        }
      >
        <div style={{ position: 'relative' }}>
          {/* 容器必须始终渲染：否则首屏无数据时 echarts 拿不到容器，图表会一直空白 */}
          <div ref={chartRef} style={{ width: '100%', height: 180 }} />
          {daily.length === 0 && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
              }}
            >
              <Text type="secondary">暂无数据</Text>
            </div>
          )}
        </div>
      </Card>

      {/* ===== 明细 ===== */}
      <Card size="small">
        <Tabs
          activeKey={tabKey}
          onChange={(key) => setTabKey(key)}
          items={[
            {
              key: 'db',
              label: '数据库日志',
              children: (
                <>
                  <Space wrap size={8} style={{ marginBottom: 12 }}>
                    <RangePicker
                      value={range ?? undefined}
                      onChange={(vals) => {
                        if (vals && vals[0] && vals[1]) setRange([vals[0], vals[1]]);
                        else setRange(null);
                      }}
                      style={{ width: 240 }}
                      allowClear
                    />
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="级别"
                      style={{ minWidth: 160 }}
                      value={levels}
                      options={LEVEL_OPTIONS}
                      onChange={(value: string[]) => {
                        setLevels(value);
                        setPage(1);
                      }}
                    />
                    <Select
                      mode="multiple"
                      allowClear
                      placeholder="类型"
                      style={{ minWidth: 180 }}
                      value={types}
                      options={TYPE_OPTIONS}
                      onChange={(value: string[]) => {
                        setTypes(value);
                        setPage(1);
                      }}
                    />
                    <Input.Search
                      placeholder="关键字（摘要/动作/路径/明细/trace_id）"
                      style={{ width: 280 }}
                      allowClear
                      value={keyword}
                      onChange={(e) => setKeyword(e.target.value)}
                      onSearch={() => {
                        setPage(1);
                        void loadLogs();
                      }}
                    />
                    <Space size={4}>
                      <Text style={{ fontSize: 13 }}>仅看重要</Text>
                      <Switch
                        size="small"
                        checked={onlyKey}
                        onChange={(checked) => {
                          setOnlyKey(checked);
                          setPage(1);
                        }}
                      />
                    </Space>
                    <Space size={4}>
                      <Text style={{ fontSize: 13 }}>仅慢请求</Text>
                      <Switch
                        size="small"
                        checked={onlySlow}
                        onChange={(checked) => {
                          setOnlySlow(checked);
                          setPage(1);
                        }}
                      />
                    </Space>
                    <Popconfirm
                      title={`删除选中的 ${selectedKeys.length} 条日志？`}
                      description="人工标记为重要的日志也会被删除，请谨慎操作。"
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      disabled={selectedKeys.length === 0}
                      onConfirm={() => void removeSelected()}
                    >
                      <Button danger icon={<DeleteOutlined />} disabled={selectedKeys.length === 0}>
                        批量删除
                      </Button>
                    </Popconfirm>
                  </Space>

                  <Table<LogItem>
                    rowKey="log_id"
                    size="small"
                    loading={loading}
                    columns={columns}
                    dataSource={items}
                    rowSelection={{
                      selectedRowKeys: selectedKeys,
                      onChange: (keys) => setSelectedKeys(keys),
                    }}
                    scroll={{ x: 1180 }}
                    pagination={{
                      current: page,
                      pageSize,
                      total,
                      showSizeChanger: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: (count) => `共 ${count} 条`,
                      onChange: (nextPage, nextSize) => {
                        if (nextSize !== pageSize) {
                          setPage(1);
                          setPageSize(nextSize);
                          return;
                        }
                        // 相邻页优先跟随服务端 _links.next / prev（自带全部过滤条件）
                        const href =
                          nextPage === page + 1
                            ? links.next?.href
                            : nextPage === page - 1
                              ? links.prev?.href
                              : undefined;
                        if (href) {
                          void gotoHref(href);
                          return;
                        }
                        setPage(nextPage);
                      },
                    }}
                  />
                </>
              ),
            },
            {
              key: 'files',
              label: `兜底文件日志（${files.length}）`,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      目录：{logDir || '—'}；数据库不可用时的日志会按天写入 JSONL 文件。
                    </Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={3650}
                      value={cleanupFileDays}
                      onChange={(value) => setCleanupFileDays(Number(value ?? 0))}
                      addonBefore="保留天数"
                      style={{ width: 160 }}
                    />
                    <Popconfirm
                      title={`删除 ${cleanupFileDays} 天前的日志文件？`}
                      okText="清理"
                      cancelText="取消"
                      onConfirm={() => void cleanupExpiredFiles()}
                    >
                      <Button icon={<ClearOutlined />}>清理过期文件</Button>
                    </Popconfirm>
                    <Button icon={<ReloadOutlined />} onClick={() => void loadFiles()} loading={filesLoading}>
                      刷新
                    </Button>
                  </Space>
                  <Table<LogFileInfo>
                    rowKey="name"
                    size="small"
                    loading={filesLoading}
                    columns={fileColumns}
                    dataSource={files}
                    pagination={false}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      {/* ===== 详情抽屉 ===== */}
      <Drawer
        title={detail ? `日志详情 #${detail.log_id}` : '日志详情'}
        width={720}
        open={!!detail}
        loading={detailLoading}
        onClose={() => setDetail(null)}
        extra={
          detail && (
            <Space>
              <Button
                icon={detail.is_key ? <StarFilled style={{ color: '#faad14' }} /> : <StarOutlined />}
                onClick={() => void toggleKey(detail, !detail.is_key)}
              >
                {detail.is_key ? '取消重要' : '标记重要'}
              </Button>
              {/* 超媒体：详情应答里的 _links.same_trace 直接可用，客户端无需自己拼 trace_id 查询 */}
              {sameTraceHref && (
                <Button icon={<LinkOutlined />} loading={traceLoading} onClick={() => void openTraceView(sameTraceHref)}>
                  同一请求链路
                </Button>
              )}
              <Button
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(detail.trace_id ?? '')
                    .then(() => message.success('trace_id 已复制'))
                    .catch(() => message.warning('复制失败'));
                }}
                disabled={!detail.trace_id}
              >
                复制 trace_id
              </Button>
              <Popconfirm
                title={`删除日志 #${detail.log_id}？`}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => void removeOne(detail)}
              >
                <Button danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          )
        }
      >
        {detail && (
          <>
            <Descriptions column={2} size="small" bordered items={[
              { key: 'time', label: '时间', children: detail.created_at },
              { key: 'last', label: '最近出现', children: detail.last_seen_at },
              { key: 'level', label: '级别', children: <Tag color={LEVEL_COLOR[detail.level] ?? 'default'}>{detail.level}</Tag> },
              { key: 'type', label: '类型', children: TYPE_LABEL[detail.log_type] ?? detail.log_type },
              { key: 'action', label: '动作', children: detail.action || '-' },
              { key: 'repeat', label: '重复次数', children: detail.repeat_count },
              { key: 'method', label: '方法', children: detail.method || '-' },
              { key: 'path', label: '路径', children: detail.path || '-' },
              { key: 'status', label: '状态码', children: detail.status_code ?? '-' },
              { key: 'duration', label: '耗时', children: detail.duration_ms == null ? '-' : `${detail.duration_ms} ms` },
              { key: 'ip', label: '客户端', children: detail.client_ip || '-' },
              { key: 'trace', label: 'trace_id', children: detail.trace_id || '-' },
              { key: 'message', label: '摘要', span: 2, children: detail.message },
            ]} />
            <div style={{ marginTop: 16 }}>
              <Text strong>明细</Text>
              {detail.detail?.includes('traceback') && (
                <Tag icon={<WarningOutlined />} color="red" style={{ marginLeft: 8 }}>
                  含异常堆栈
                </Tag>
              )}
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  maxHeight: 420,
                  overflow: 'auto',
                  background: '#0F172A',
                  color: '#E2E8F0',
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {prettyDetail(detail.detail)}
              </pre>
            </div>
          </>
        )}
      </Drawer>

      {/* ===== 兜底文件查看 ===== */}
      <Drawer
        title={fileView ? `兜底日志文件：${fileView.name}` : '兜底日志文件'}
        width={860}
        open={!!fileView}
        loading={fileViewLoading}
        onClose={() => setFileView(null)}
      >
        {fileView && (
          <>
            <Text type="secondary" style={{ fontSize: 13 }}>
              匹配 {fileView.total} 行，展示最近 {fileView.rows.length} 行（倒序）。
            </Text>
            <div style={{ marginTop: 12 }}>
              {fileView.rows.length === 0 ? (
                <Text type="secondary">（无匹配记录）</Text>
              ) : (
                fileView.rows.map((row, index) => (
                  <pre
                    key={index}
                    style={{
                      marginBottom: 8,
                      padding: 10,
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: 8,
                      fontSize: 12,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {JSON.stringify(row, null, 2)}
                  </pre>
                ))
              )}
            </div>
          </>
        )}
      </Drawer>

      {/* ===== 同一请求链路（跟随服务端 _links.same_trace）===== */}
      <Modal
        title={`同一请求链路的日志${traceView ? `（${traceView.total} 条）` : ''}`}
        open={!!traceView}
        onCancel={() => setTraceView(null)}
        footer={<Button onClick={() => setTraceView(null)}>关闭</Button>}
        width={860}
      >
        <Table<LogItem>
          rowKey="log_id"
          size="small"
          loading={traceLoading}
          dataSource={traceView?.items ?? []}
          pagination={false}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 170 },
            {
              title: '级别',
              dataIndex: 'level',
              width: 80,
              render: (value: string) => <Tag color={LEVEL_COLOR[value] ?? 'default'}>{value}</Tag>,
            },
            { title: '动作', dataIndex: 'action', width: 180, ellipsis: true },
            { title: '摘要', dataIndex: 'message', ellipsis: true },
            {
              title: '状态',
              dataIndex: 'status_code',
              width: 70,
              render: (value: number | null) => (value == null ? '-' : value),
            },
          ]}
        />
      </Modal>

      {/* ===== 清理弹窗 ===== */}
      <Modal
        title="清理过期日志"
        open={cleanupOpen}
        onCancel={() => setCleanupOpen(false)}
        onOk={() => void runCleanup()}
        okText={cleanupDryRun ? '试算' : '执行清理'}
        okButtonProps={{ danger: !cleanupDryRun, loading: cleanupBusy }}
        confirmLoading={cleanupBusy}
        width={560}
      >
        <div style={{ fontSize: 13, lineHeight: 2 }}>
          <div>
            数据库日志保留天数：
            <InputNumber
              min={0}
              max={3650}
              value={cleanupDays}
              onChange={(value) => setCleanupDays(Number(value ?? 0))}
              style={{ width: 120, marginLeft: 8 }}
            />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              早于该天数的记录将被删除
            </Text>
          </div>
          <div>
            兜底文件保留天数：
            <InputNumber
              min={0}
              max={3650}
              value={cleanupFileDays}
              onChange={(value) => setCleanupFileDays(Number(value ?? 0))}
              style={{ width: 120, marginLeft: 8 }}
            />
          </div>
          <div>
            仅试算不删除：
            <Switch size="small" checked={cleanupDryRun} onChange={setCleanupDryRun} style={{ marginLeft: 8 }} />
            <Text type="secondary" style={{ marginLeft: 8 }}>
              建议先用试算确认影响范围
            </Text>
          </div>
          <div>
            连人工标记的重要日志一起删除：
            <Switch
              size="small"
              checked={cleanupIncludeKey}
              onChange={setCleanupIncludeKey}
              style={{ marginLeft: 8 }}
            />
          </div>
          {cleanupIncludeKey && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              message="重要日志（★）也会被删除，该操作不可恢复。"
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default LogsPage;
