import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { TableProps, UploadProps } from 'antd';
import {
  ArrowLeftOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  DeleteOutlined,
  EditOutlined,
  FileExcelOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ApiError } from '../api/http';
import {
  assetImportTemplateUrl,
  createAsset,
  createProject,
  createScenario,
  deleteAsset,
  deleteProject,
  deleteScenario,
  fetchAssets,
  fetchProjectDetail,
  fetchProjects,
  fetchResidualMaterials,
  fetchResults,
  fetchTraces,
  importAssets,
  issueProject,
  patchAsset,
  putResidualMaterial,
  reviewProject,
  runCalculation,
  valuationExportUrl,
  type AssetItem,
  type ProjectDetail,
  type ResidualMaterial,
  type ValuationMethod,
  type ValuationProject,
  type ValuationResult,
  type ValuationScenario,
  type ValuationTrace,
} from '../api/asset';

const { Title, Text, Paragraph } = Typography;

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  draft: { color: 'blue', text: '草稿' },
  reviewed: { color: 'orange', text: '已复核' },
  issued: { color: 'green', text: '已签发' },
};

const METHOD_TAG: Record<ValuationMethod, { color: string; text: string }> = {
  cost: { color: 'geekblue', text: '成本法（在用价值）' },
  liquidation: { color: 'volcano', text: '清算/拆解价值' },
};

const CATEGORY_OPTIONS = ['装置', '单元', '储罐', '塔器', '换热器', '管道', '钢结构', '电缆', '电机电气', '其他']
  .map((v) => ({ value: v }));
const ASSET_STATUS_OPTIONS = ['在役', '停用', '报废', '待拆除'].map((v) => ({ value: v }));
const COST_PARAM_LABELS: Record<string, string> = {
  replacement_unit_price: '每吨重置造价(元/吨，空=用原购置成本)',
  freight_ratio: '运杂费率',
  install_ratio: '安装调试费率',
  foundation_ratio: '基础费率',
  other_ratio: '其他从属费率',
  profit_ratio: '合理利润率',
  idc_rate: '建设期资金成本年利率',
  construction_months: '工期(月)',
  w_age: '年限法权重',
  w_inspection: '勘察法权重',
  functional_obsolescence: '功能性贬值率',
  economic_obsolescence: '经济性贬值率',
};
const LIQUIDATION_PARAM_LABELS: Record<string, string> = {
  reusable_unit_price: '可再利用单价(元/吨)',
  dismantle_unit_cost: '拆除处置成本(元/吨)',
  disposal_discount: '处置折扣率',
};

function showApiError(error: unknown, fallback: string): void {
  if (error instanceof ApiError) {
    const detail = error.detailText;
    void message.error(detail ? `${error.message}（${detail}）` : error.message);
    return;
  }
  if (error instanceof Error && error.message) {
    void message.error(error.message);
    return;
  }
  void message.error(fallback);
}

const money = (value: number | null | undefined): string =>
  value == null ? '-' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
const percent = (value: number | null | undefined, digits = 2): string =>
  value == null ? '-' : `${(Number(value) * 100).toFixed(digits)}%`;

/** 把扁平列表按 parent_id 组成资产树 */
function buildTree(items: AssetItem[]): AssetItem[] {
  const map = new Map<number, AssetItem>();
  items.forEach((item) => map.set(item.asset_id, { ...item, children: [] }));
  const roots: AssetItem[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  map.forEach((node) => {
    if (node.children && node.children.length === 0) delete node.children;
  });
  return roots;
}

// ============ 项目列表 ============
const ProjectList: React.FC<{ onOpen: (id: number) => void }> = ({ onOpen }) => {
  const [items, setItems] = useState<ValuationProject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjects({ status, keyword: keyword.trim() || undefined, page_size: 100 });
      setItems(data.items);
      setTotal(data.total);
    } catch (error) {
      showApiError(error, '项目列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const project = await createProject({
        ...values,
        base_date: (values.base_date as Dayjs).format('YYYY-MM-DD'),
      });
      void message.success(`项目已创建：${project.project_no}`);
      setCreateOpen(false);
      form.resetFields();
      onOpen(project.project_id);
    } catch (error) {
      showApiError(error, '创建项目失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: TableProps<ValuationProject>['columns'] = [
    { title: '项目编号', dataIndex: 'project_no', width: 150 },
    { title: '项目名称', dataIndex: 'project_name', ellipsis: true },
    { title: '基准日', dataIndex: 'base_date', width: 110 },
    { title: '取价城市', dataIndex: 'reference_city', width: 90 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) => <Tag color={STATUS_TAG[value]?.color}>{STATUS_TAG[value]?.text ?? value}</Tag>,
    },
    { title: '评估目的', dataIndex: 'valuation_purpose', ellipsis: true },
    {
      title: '操作',
      key: 'op',
      width: 130,
      render: (_: unknown, row) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => onOpen(row.project_id)}>
            进入
          </Button>
          <Popconfirm
            title={`删除项目 ${row.project_no}？其资产、场景、结果与轨迹都会一并删除`}
            disabled={row.status !== 'draft'}
            okButtonProps={{ danger: true }}
            onConfirm={() => {
              void (async () => {
                try {
                  await deleteProject(row.project_id);
                  void message.success('项目已删除');
                  await load();
                } catch (error) {
                  showApiError(error, '删除项目失败');
                }
              })();
            }}
          >
            <Button type="link" size="small" danger disabled={row.status !== 'draft'}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={3} style={{ margin: 0 }}>
          资产评估
        </Title>
        <Space>
          <Select
            allowClear
            placeholder="状态"
            style={{ width: 120 }}
            value={status}
            onChange={setStatus}
            options={Object.entries(STATUS_TAG).map(([value, item]) => ({ value, label: item.text }))}
          />
          <Input.Search
            placeholder="项目编号 / 名称"
            style={{ width: 220 }}
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => void load()}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建评估项目
          </Button>
        </Space>
      </Space>

      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        石化行业资产评估：按<Text strong>成本法（在用价值）</Text>与<Text strong>清算/拆解价值</Text>两种口径测算，
        资产支持手工录入与 Excel 批量导入，废金属单价自动取 <Text code>price</Text> 模块行情，
        计算过程逐步留痕（审计轨迹），项目需经<Text strong>复核 → 签发</Text>两级确认。
      </Paragraph>

      <Table<ValuationProject>
        rowKey="project_id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{ pageSize: 20, total, showTotal: (count) => `共 ${count} 个项目` }}
        locale={{ emptyText: <Empty description="暂无评估项目，点右上角「新建评估项目」开始" /> }}
      />

      <Modal
        title="新建评估项目"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void submit()}
        confirmLoading={saving}
        width={620}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ base_date: dayjs(), reference_city: '北京' }}
        >
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="project_no" label="项目编号" rules={[{ required: true, message: '请输入项目编号' }]}
                       style={{ flex: 1 }}>
              <Input placeholder="如 PS-2026-001" />
            </Form.Item>
            <Form.Item name="base_date" label="评估基准日" rules={[{ required: true, message: '请选择基准日' }]}
                       style={{ flex: 1 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Form.Item name="project_name" label="项目名称" rules={[{ required: true, message: '请输入项目名称' }]}>
            <Input placeholder="如 某石化装置拆除处置价值评估" />
          </Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="reference_city" label="取价基准城市" style={{ flex: 1 }}
                       tooltip="清算价值中废金属单价按该城市行情取价">
              <Select
                showSearch
                options={['北京', '上海', '广东'].map((v) => ({ value: v, label: v }))}
                placeholder="北京"
              />
            </Form.Item>
            <Form.Item name="valuation_purpose" label="评估目的" style={{ flex: 2 }}>
              <Input placeholder="如 报废装置拆除处置价值评估" />
            </Form.Item>
          </Space>
          <Form.Item name="assumptions" label="评估假设">
            <Input.TextArea rows={2} placeholder="如 假设基准日后无重大技术改造" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

// ============ 资产表单 ============
interface AssetFormProps {
  open: boolean;
  projectId: number;
  editing: AssetItem | null;
  assets: AssetItem[];
  onClose: () => void;
  onSaved: () => void;
}

const AssetFormModal: React.FC<AssetFormProps> = ({ open, projectId, editing, assets, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [materials, setMaterials] = useState<ResidualMaterial[]>([]);

  useEffect(() => {
    if (open) {
      void fetchResidualMaterials().then(setMaterials).catch(() => setMaterials([]));
      if (editing) {
        form.setFieldsValue(editing);
      } else {
        form.resetFields();
        form.setFieldsValue({ status: '在役', quantity: 1, unit: '台' });
      }
    }
  }, [open, editing, form]);

  const submit = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await patchAsset(editing.asset_id, values);
        void message.success('资产已更新');
      } else {
        await createAsset(projectId, values);
        void message.success('资产已新增');
      }
      onSaved();
      onClose();
    } catch (error) {
      showApiError(error, '保存资产失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? `编辑资产：${editing.asset_name}` : '新增资产'}
      open={open}
      onCancel={onClose}
      onOk={() => void submit()}
      confirmLoading={saving}
      width={760}
    >
      <Form form={form} layout="vertical">
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="asset_name" label="资产名称" rules={[{ required: true, message: '请输入名称' }]}
                     style={{ flex: 2 }}>
            <Input placeholder="如 常压塔 / 球罐 / 废电缆" />
          </Form.Item>
          <Form.Item name="asset_code" label="资产编码" style={{ flex: 1 }}>
            <Input placeholder="如 E-001" />
          </Form.Item>
          <Form.Item name="parent_id" label="上级节点" style={{ flex: 2 }}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="留空 = 根节点（装置）"
              options={assets
                .filter((a) => !editing || a.asset_id !== editing.asset_id)
                .map((a) => ({
                  value: a.asset_id,
                  label: `${a.asset_code ? `${a.asset_code} ` : ''}${a.asset_name}`,
                }))}
            />
          </Form.Item>
        </Space>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="category" label="类别" style={{ flex: 1 }}>
            <Select allowClear options={CATEGORY_OPTIONS} placeholder="储罐/塔器/管道…" />
          </Form.Item>
          <Form.Item name="material" label="材质" style={{ flex: 1 }}
                     tooltip="清算价值按材质映射回收率与行情单价">
            <AutoComplete
              options={materials.map((m) => ({ value: m.material }))}
              placeholder="碳钢 / 不锈钢304 / 铜…"
              filterOption={(input, option) => String(option?.value ?? '').includes(input)}
            />
          </Form.Item>
          <Form.Item name="spec" label="规格型号" style={{ flex: 1 }}>
            <Input placeholder="DN3200×H42000" />
          </Form.Item>
          <Form.Item name="status" label="状态" style={{ flex: 1 }}>
            <Select options={ASSET_STATUS_OPTIONS} />
          </Form.Item>
        </Space>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="quantity" label="数量" style={{ flex: 1 }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit" label="单位" style={{ flex: 1 }}>
            <Input placeholder="台/套/吨" />
          </Form.Item>
          <Form.Item name="weight_ton" label="重量(吨)" style={{ flex: 1 }}
                     tooltip="清算价值的核心：回收价值 = 重量 × 回收率 × 单价">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="acquired_cost" label="原购置成本(元)" style={{ flex: 1 }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Space>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="installed_year" label="启用年份" style={{ flex: 1 }}>
            <InputNumber min={1950} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="service_years" label="已用年限" style={{ flex: 1 }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="economic_life" label="经济寿命(年)" style={{ flex: 1 }}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="inspection_score" label="勘察打分(0~100)" style={{ flex: 1 }}>
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
        </Space>
        <Space size={12} style={{ display: 'flex' }}>
          <Form.Item name="w_age" label="年限法权重" style={{ flex: 1 }} tooltip="留空用场景默认（0.4/0.6）">
            <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="w_inspection" label="勘察法权重" style={{ flex: 1 }}>
            <InputNumber min={0} max={1} step={0.05} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="compliance_cost" label="合规整改成本(元)" style={{ flex: 1 }}
                     tooltip="成本法中从在用价值里扣减">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Space>
        <Form.Item name="remark" label="备注">
          <Input placeholder="如 待拆除、含保温层" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

// ============ 工作台 ============
const ProjectWorkbench: React.FC<{ projectId: number; onBack: () => void }> = ({ projectId, onBack }) => {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [results, setResults] = useState<ValuationResult[]>([]);
  const [traces, setTraces] = useState<ValuationTrace[]>([]);
  const [materials, setMaterials] = useState<ResidualMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioForm] = Form.useForm();
  const [reviewOpen, setReviewOpen] = useState<'review' | 'issue' | null>(null);
  const [reviewForm] = Form.useForm();
  const [resultScenarioId, setResultScenarioId] = useState<number | undefined>();
  const [traceAssetId, setTraceAssetId] = useState<number | undefined>();
  const [materialEditing, setMaterialEditing] = useState<ResidualMaterial | null>(null);
  const [materialForm] = Form.useForm();

  const status = detail?.project.status ?? 'draft';
  const isDraft = status === 'draft';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [projectDetail, assetList, resultList, traceList, materialList] = await Promise.all([
        fetchProjectDetail(projectId),
        fetchAssets(projectId),
        fetchResults(projectId),
        fetchTraces(projectId),
        fetchResidualMaterials(),
      ]);
      setDetail(projectDetail);
      setAssets(assetList);
      setResults(resultList);
      setTraces(traceList);
      setMaterials(materialList);
      setResultScenarioId((prev) => prev ?? projectDetail.scenarios[0]?.scenario_id);
    } catch (error) {
      showApiError(error, '项目数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildTree(assets), [assets]);
  // 资产树默认全部展开：数据是异步加载的，defaultExpandAllRows 不会重新生效，故改为受控
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  useEffect(() => {
    setExpandedKeys(assets.map((item) => item.asset_id));
  }, [assets]);

  const currentScenario = detail?.scenarios.find((s) => s.scenario_id === resultScenarioId);
  const currentResults = useMemo(
    () => results.filter((r) => r.scenario_id === resultScenarioId),
    [results, resultScenarioId],
  );
  const currentTraces = useMemo(
    () => traces.filter((t) => (!traceAssetId || t.asset_id === traceAssetId)
      && (!resultScenarioId || t.scenario_id === resultScenarioId)),
    [traces, traceAssetId, resultScenarioId],
  );

  const totalValue = currentResults.reduce(
    (sum, item) => sum + Number((currentScenario?.method === 'cost' ? item.value_in_use : item.liquidation_value) ?? 0),
    0,
  );

  const doCalculation = async () => {
    setBusy(true);
    try {
      const outcome = await runCalculation(projectId);
      void message.success(`计算完成：${outcome.scenarios} 个场景 × ${outcome.assets} 个资产 = ${outcome.results} 条结果`);
      await load();
    } catch (error) {
      showApiError(error, '计算失败');
    } finally {
      setBusy(false);
    }
  };

  const doTransition = async () => {
    const values = await reviewForm.validateFields();
    if (!reviewOpen) return;
    setBusy(true);
    try {
      if (reviewOpen === 'review') {
        await reviewProject(projectId, { reviewed_by: values.person, note: values.note });
        void message.success('已完成复核');
      } else {
        await issueProject(projectId, { issued_by: values.person, note: values.note });
        void message.success('已完成签发');
      }
      setReviewOpen(null);
      reviewForm.resetFields();
      await load();
    } catch (error) {
      showApiError(error, reviewOpen === 'review' ? '复核失败' : '签发失败');
    } finally {
      setBusy(false);
    }
  };

  const submitScenario = async () => {
    const values = await scenarioForm.validateFields();
    const method = values.method as ValuationMethod;
    const paramKeys = method === 'cost' ? Object.keys(COST_PARAM_LABELS) : Object.keys(LIQUIDATION_PARAM_LABELS);
    const params: Record<string, number | null> = {};
    paramKeys.forEach((key) => {
      const value = values[key];
      if (value !== undefined && value !== null) params[key] = Number(value);
    });
    setBusy(true);
    try {
      await createScenario(projectId, { scenario_name: values.scenario_name, method, params });
      void message.success('价值场景已创建');
      setScenarioOpen(false);
      scenarioForm.resetFields();
      await load();
    } catch (error) {
      showApiError(error, '创建场景失败');
    } finally {
      setBusy(false);
    }
  };

  const submitMaterial = async () => {
    if (!materialEditing) return;
    const values = await materialForm.validateFields();
    setBusy(true);
    try {
      await putResidualMaterial(materialEditing.material, {
        price_material: values.price_material || null,
        recovery_rate: Number(values.recovery_rate),
        unit_price_override: values.unit_price_override === undefined || values.unit_price_override === null
          ? null : Number(values.unit_price_override),
      });
      void message.success('材质映射已保存');
      setMaterialEditing(null);
      await load();
    } catch (error) {
      showApiError(error, '保存材质映射失败');
    } finally {
      setBusy(false);
    }
  };

  const handleUpload: UploadProps['beforeUpload'] = (file) => {
    void (async () => {
      setBusy(true);
      try {
        const outcome = await importAssets(projectId, file as unknown as File);
        if (outcome.failed > 0) {
          Modal.warning({
            title: `导入完成：成功 ${outcome.imported} 条，失败 ${outcome.failed} 条`,
            width: 620,
            content: (
              <div style={{ fontSize: 13, lineHeight: 2, maxHeight: 300, overflow: 'auto' }}>
                {outcome.errors.map((item) => (
                  <div key={`${item.row}-${item.message}`}>第 {item.row} 行：{item.message}</div>
                ))}
              </div>
            ),
          });
        } else {
          void message.success(`已导入 ${outcome.imported} 条资产`);
        }
        await load();
      } catch (error) {
        showApiError(error, 'Excel 导入失败');
      } finally {
        setBusy(false);
      }
    })();
    return false;
  };

  const assetColumns: TableProps<AssetItem>['columns'] = [
    { title: '资产编码', dataIndex: 'asset_code', width: 110 },
    { title: '资产名称', dataIndex: 'asset_name', ellipsis: true },
    { title: '类别', dataIndex: 'category', width: 90 },
    {
      title: '材质',
      dataIndex: 'material',
      width: 110,
      render: (value: string | null) => (value ? <Tag>{value}</Tag> : '-'),
    },
    { title: '重量(吨)', dataIndex: 'weight_ton', width: 100, align: 'right' as const, render: money },
    { title: '原购置成本', dataIndex: 'acquired_cost', width: 120, align: 'right' as const, render: money },
    {
      title: '年限(已用/寿命)',
      key: 'life',
      width: 130,
      render: (_: unknown, row) => `${row.service_years ?? '-'} / ${row.economic_life ?? '-'}`,
    },
    { title: '勘察打分', dataIndex: 'inspection_score', width: 90, align: 'right' as const },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) => <Tag color={value === '报废' || value === '待拆除' ? 'red' : 'default'}>{value}</Tag>,
    },
    {
      title: '操作',
      key: 'op',
      width: 120,
      render: (_: unknown, row) => (
        <Space size={0}>
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              disabled={!isDraft}
              icon={<EditOutlined />}
              onClick={() => {
                setEditingAsset(row);
                setAssetFormOpen(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="删除该资产？"
            disabled={!isDraft}
            onConfirm={() => {
              void (async () => {
                try {
                  await deleteAsset(row.asset_id);
                  void message.success('已删除');
                  await load();
                } catch (error) {
                  showApiError(error, '删除失败');
                }
              })();
            }}
          >
            <Button type="link" size="small" danger disabled={!isDraft} icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const resultColumns: TableProps<ValuationResult>['columns'] = currentScenario?.method === 'cost'
    ? [
        { title: '资产', dataIndex: 'asset_name', ellipsis: true },
        { title: '类别', dataIndex: 'category', width: 90 },
        { title: '重置成本(元)', dataIndex: 'replacement_cost', width: 140, align: 'right' as const, render: money },
        { title: '年限法成新率', dataIndex: 'age_newness', width: 120, align: 'right' as const, render: (v: number) => percent(v, 1) },
        { title: '勘察法成新率', dataIndex: 'inspection_newness', width: 120, align: 'right' as const, render: (v: number) => percent(v, 1) },
        {
          title: '综合成新率',
          dataIndex: 'newness_rate',
          width: 110,
          align: 'right' as const,
          render: (v: number) => <Text strong>{percent(v, 1)}</Text>,
        },
        {
          title: '在用价值(元)',
          dataIndex: 'value_in_use',
          width: 150,
          align: 'right' as const,
          render: (v: number) => <Text strong style={{ color: '#cf1322' }}>{money(v)}</Text>,
        },
      ]
    : [
        { title: '资产', dataIndex: 'asset_name', ellipsis: true },
        { title: '材质', dataIndex: 'material', width: 100 },
        { title: '重量(吨)', dataIndex: 'weight_ton', width: 100, align: 'right' as const, render: money },
        { title: '废金属单价(元/吨)', dataIndex: 'scrap_unit_price', width: 140, align: 'right' as const, render: money },
        { title: '回收率', dataIndex: 'recovery_rate', width: 90, align: 'right' as const, render: (v: number) => percent(v, 1) },
        { title: '回收价值', dataIndex: 'scrap_recovery', width: 130, align: 'right' as const, render: money },
        {
          title: '可取价来源',
          dataIndex: 'metal_price_snapshot',
          width: 200,
          ellipsis: true,
          render: (value: ValuationResult['metal_price_snapshot']) =>
            value?.material ? (
              <Tooltip title={`${value.city} / ${value.material} / ${value.price_date}`}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {value.city}·{value.material}（{value.price_date}）
                </Text>
              </Tooltip>
            ) : (
              <Text type="secondary">手动/未配置</Text>
            ),
        },
        { title: '拆除成本', dataIndex: 'dismantle_cost', width: 110, align: 'right' as const, render: money },
        {
          title: '清算价值(元)',
          dataIndex: 'liquidation_value',
          width: 150,
          align: 'right' as const,
          render: (v: number) => <Text strong style={{ color: '#cf1322' }}>{money(v)}</Text>,
        },
      ];

  const traceColumns: TableProps<ValuationTrace>['columns'] = [
    { title: '资产', dataIndex: 'asset_name', width: 160, ellipsis: true },
    { title: '步骤', dataIndex: 'step', width: 160 },
    { title: '公式', dataIndex: 'formula', ellipsis: true },
    { title: '输出', dataIndex: 'output', width: 140, align: 'right' as const, render: money },
    { title: '数据来源', dataIndex: 'source', width: 200, ellipsis: true },
  ];

  const project = detail?.project;

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>
            返回列表
          </Button>
          <Title level={3} style={{ margin: 0 }}>
            {project?.project_name ?? '评估项目'}
          </Title>
          {project && (
            <Tag color={STATUS_TAG[project.status]?.color} style={{ marginInlineStart: 4 }}>
              {STATUS_TAG[project.status]?.text}
            </Tag>
          )}
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
          <Button
            icon={<CalculatorOutlined />}
            type="primary"
            disabled={!isDraft}
            loading={busy}
            onClick={() => void doCalculation()}
          >
            执行计算
          </Button>
          <Button
            icon={<CloudDownloadOutlined />}
            disabled={!detail?.computed}
            onClick={() => window.open(valuationExportUrl(projectId), '_blank')}
          >
            导出底稿
          </Button>
          <Button
            icon={<SafetyCertificateOutlined />}
            disabled={status !== 'draft'}
            onClick={() => setReviewOpen('review')}
          >
            复核
          </Button>
          <Button
            type="primary"
            ghost
            icon={<CheckCircleOutlined />}
            disabled={status !== 'reviewed'}
            onClick={() => setReviewOpen('issue')}
          >
            签发
          </Button>
        </Space>
      </Space>

      {status !== 'draft' && (
        <Alert
          type={status === 'issued' ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            status === 'issued'
              ? `已签发（${project?.issued_by ?? ''} ${project?.issued_at ?? ''}）——项目已锁定，不可再修改`
              : `已复核（${project?.reviewed_by ?? ''} ${project?.reviewed_at ?? ''}）——如需修改请新建项目`
          }
        />
      )}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={40} wrap>
          <Statistic title="资产数量" value={detail?.asset_count ?? 0} suffix="项" />
          <Statistic title="价值场景" value={detail?.scenarios.length ?? 0} suffix="个" />
          <Statistic title="评估结果" value={detail?.result_count ?? 0} suffix="条" />
          <Statistic
            title={currentScenario?.method === 'cost' ? '当前场景在用价值合计' : '当前场景清算价值合计'}
            value={totalValue}
            precision={2}
            suffix="元"
            valueStyle={{ color: '#cf1322' }}
          />
          <Descriptions column={1} size="small" style={{ minWidth: 320 }}>
            <Descriptions.Item label="项目编号">{project?.project_no ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="评估基准日">{project?.base_date ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="取价基准城市">{project?.reference_city ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="评估目的">{project?.valuation_purpose || '-'}</Descriptions.Item>
          </Descriptions>
        </Space>
      </Card>

      <Tabs
        items={[
          {
            key: 'assets',
            label: `资产台账（${assets.length}）`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!isDraft}
                    onClick={() => {
                      setEditingAsset(null);
                      setAssetFormOpen(true);
                    }}
                  >
                    新增资产
                  </Button>
                  <Upload beforeUpload={handleUpload} showUploadList={false} accept=".xlsx">
                    <Button icon={<UploadOutlined />} disabled={!isDraft} loading={busy}>
                      Excel 批量导入
                    </Button>
                  </Upload>
                  <Button
                    icon={<FileExcelOutlined />}
                    onClick={() => window.open(assetImportTemplateUrl(), '_blank')}
                  >
                    下载导入模板
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    模板列：上级编码（留空=装置）、资产编码、资产名称、类别、材质、重量(吨)…
                  </Text>
                </Space>
                <Table<AssetItem>
                  rowKey="asset_id"
                  size="small"
                  loading={loading}
                  columns={assetColumns}
                  dataSource={tree}
                  pagination={false}
                  expandable={{
                    expandedRowKeys: expandedKeys,
                    onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
                  }}
                  locale={{ emptyText: <Empty description="还没有资产：可手工新增或下载模板后 Excel 导入" /> }}
                />
              </>
            ),
          },
          {
            key: 'scenarios',
            label: `价值场景（${detail?.scenarios.length ?? 0}）`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!isDraft}
                    onClick={() => setScenarioOpen(true)}
                  >
                    新建场景
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    成本法算「在用价值」，清算/拆解算「处置残值」，同一批资产可同时挂多个场景做对比
                  </Text>
                </Space>
                <Table<ValuationScenario>
                  rowKey="scenario_id"
                  size="small"
                  pagination={false}
                  dataSource={detail?.scenarios ?? []}
                  columns={[
                    { title: '场景名称', dataIndex: 'scenario_name' },
                    {
                      title: '价值口径',
                      dataIndex: 'method',
                      width: 180,
                      render: (value: ValuationMethod) => (
                        <Tag color={METHOD_TAG[value]?.color}>{METHOD_TAG[value]?.text}</Tag>
                      ),
                    },
                    {
                      title: '关键参数',
                      dataIndex: 'params',
                      render: (params: Record<string, number | null>, row) => {
                        const labels = row.method === 'cost' ? COST_PARAM_LABELS : LIQUIDATION_PARAM_LABELS;
                        return (
                          <Space size={12} wrap style={{ fontSize: 12 }}>
                            {Object.entries(params ?? {}).map(([key, value]) => (
                              <Text key={key} type="secondary">
                                {labels[key] ?? key}: {value === null ? '—' : String(value)}
                              </Text>
                            ))}
                          </Space>
                        );
                      },
                    },
                    {
                      title: '操作',
                      key: 'op',
                      width: 80,
                      render: (_: unknown, row) => (
                        <Popconfirm
                          title="删除该场景？其计算结果将一并删除"
                          disabled={!isDraft}
                          onConfirm={() => {
                            void (async () => {
                              try {
                                await deleteScenario(row.scenario_id);
                                void message.success('已删除');
                                await load();
                              } catch (error) {
                                showApiError(error, '删除失败');
                              }
                            })();
                          }}
                        >
                          <Button type="link" size="small" danger disabled={!isDraft}>
                            删除
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'results',
            label: `评估结果（${results.length}）`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Select
                    style={{ width: 260 }}
                    value={resultScenarioId}
                    onChange={setResultScenarioId}
                    placeholder="选择价值场景"
                    options={(detail?.scenarios ?? []).map((s) => ({
                      value: s.scenario_id,
                      label: `${s.scenario_name}（${METHOD_TAG[s.method]?.text}）`,
                    }))}
                  />
                  {currentScenario && (
                    <Tag color={METHOD_TAG[currentScenario.method]?.color}>
                      {METHOD_TAG[currentScenario.method]?.text}
                    </Tag>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    合计：<Text strong style={{ color: '#cf1322' }}>{money(totalValue)}</Text> 元
                  </Text>
                </Space>
                <Table<ValuationResult>
                  rowKey="result_id"
                  size="small"
                  loading={loading}
                  columns={resultColumns}
                  dataSource={currentResults}
                  pagination={{ pageSize: 20, showTotal: (count) => `共 ${count} 条` }}
                  summary={(rows) =>
                    rows.length > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={currentScenario?.method === 'cost' ? 6 : 8}>
                          <Text strong>合计</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1}>
                          <Text strong style={{ color: '#cf1322' }}>{money(totalValue)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null
                  }
                  locale={{ emptyText: <Empty description="还没有结果：先建场景、录资产，再点「执行计算」" /> }}
                />
              </>
            ),
          },
          {
            key: 'traces',
            label: `审计轨迹（${traces.length}）`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Select
                    allowClear
                    style={{ width: 240 }}
                    placeholder="全部资产"
                    value={traceAssetId}
                    onChange={setTraceAssetId}
                    optionFilterProp="label"
                    showSearch
                    options={assets.map((a) => ({ value: a.asset_id, label: a.asset_name }))}
                  />
                  <Select
                    style={{ width: 240 }}
                    value={resultScenarioId}
                    onChange={setResultScenarioId}
                    options={(detail?.scenarios ?? []).map((s) => ({ value: s.scenario_id, label: s.scenario_name }))}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    每个中间量的公式、输入、输出与数据来源都会留痕，支撑复核与执业准则的审计要求
                  </Text>
                </Space>
                <Table<ValuationTrace>
                  rowKey="trace_id"
                  size="small"
                  columns={traceColumns}
                  dataSource={currentTraces}
                  pagination={{ pageSize: 50, showTotal: (count) => `共 ${count} 条` }}
                  expandable={{
                    expandedRowRender: (row) => (
                      <pre style={{ margin: 0, fontSize: 12, lineHeight: 1.7 }}>
                        {JSON.stringify(row.inputs ?? {}, null, 2)}
                      </pre>
                    ),
                  }}
                />
              </>
            ),
          },
          {
            key: 'materials',
            label: '材质映射',
            children: (
              <>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  清算价值 = 重量 × 回收率 × 废金属单价；单价默认取「对应材料 + 项目基准城市 + ≤基准日」的最新行情，
                  填了手动单价则优先生效。
                </Text>
                <Table<ResidualMaterial>
                  rowKey="map_id"
                  size="small"
                  style={{ marginTop: 8 }}
                  pagination={false}
                  dataSource={materials}
                  columns={[
                    { title: '材质', dataIndex: 'material', width: 140 },
                    { title: '对应行情材料', dataIndex: 'price_material', width: 200 },
                    {
                      title: '回收率',
                      dataIndex: 'recovery_rate',
                      width: 110,
                      render: (value: number) => percent(value, 1),
                    },
                    {
                      title: '手动单价覆盖(元/吨)',
                      dataIndex: 'unit_price_override',
                      width: 180,
                      render: (value: number | null) => (value == null ? <Text type="secondary">未设置</Text> : money(value)),
                    },
                    {
                      title: '操作',
                      key: 'op',
                      width: 80,
                      render: (_: unknown, row) => (
                        <Button
                          type="link"
                          size="small"
                          onClick={() => {
                            setMaterialEditing(row);
                            materialForm.setFieldsValue(row);
                          }}
                        >
                          编辑
                        </Button>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      <AssetFormModal
        open={assetFormOpen}
        projectId={projectId}
        editing={editingAsset}
        assets={assets}
        onClose={() => {
          setAssetFormOpen(false);
          setEditingAsset(null);
        }}
        onSaved={() => void load()}
      />

      <Modal
        title="新建价值场景"
        open={scenarioOpen}
        onCancel={() => setScenarioOpen(false)}
        onOk={() => void submitScenario()}
        confirmLoading={busy}
        width={680}
      >
        <Form form={scenarioForm} layout="vertical" initialValues={{ method: 'cost' }}>
          <Form.Item name="scenario_name" label="场景名称" rules={[{ required: true, message: '请输入场景名称' }]}>
            <Input placeholder="如 成本法-在用视角 / 清算拆解-处置视角" />
          </Form.Item>
          <Form.Item name="method" label="价值口径" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'cost', label: '成本法（在用价值 = 重置成本 × 成新率 × (1−贬值) − 合规整改）' },
                { value: 'liquidation', label: '清算/拆解（残值 = (回收 + 再利用 − 拆除) × (1−折扣)）' },
              ]}
            />
          </Form.Item>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="参数留空即用系统默认值（运杂 2%、安装 8%、基础 3%、其他 2%、利润 3%、IDC 3.5%/12个月；成新率权重 0.4/0.6；处置折扣 10%、拆除 200 元/吨）"
          />
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.method !== next.method}>
            {({ getFieldValue }) => {
              const method = getFieldValue('method') as ValuationMethod;
              const labels = method === 'cost' ? COST_PARAM_LABELS : LIQUIDATION_PARAM_LABELS;
              return (
                <Space size={12} wrap>
                  {Object.entries(labels).map(([key, label]) => (
                    <Form.Item key={key} name={key} label={label} style={{ minWidth: 200, marginBottom: 8 }}>
                      <InputNumber style={{ width: '100%' }} step={key.includes('ratio') || key.includes('rate') ? 0.01 : 1} />
                    </Form.Item>
                  ))}
                </Space>
              );
            }}
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={reviewOpen === 'review' ? '复核评估项目' : '签发评估项目'}
        open={!!reviewOpen}
        onCancel={() => setReviewOpen(null)}
        onOk={() => void doTransition()}
        confirmLoading={busy}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message={reviewOpen === 'review'
            ? '复核后项目将被锁定，不能再增删资产或重新计算'
            : '签发后项目进入最终状态，不可再修改'}
        />
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="person" label={reviewOpen === 'review' ? '复核人' : '签发人'}
                     rules={[{ required: true, message: '请填写姓名' }]}>
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="note" label="意见">
            <Input.TextArea rows={3} placeholder="如 参数与取价复核无误" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title="材质映射"
        width={460}
        open={!!materialEditing}
        onClose={() => setMaterialEditing(null)}
        extra={
          <Button type="primary" loading={busy} onClick={() => void submitMaterial()}>
            保存
          </Button>
        }
      >
        <Form form={materialForm} layout="vertical">
          <Form.Item label="材质">
            <Input value={materialEditing?.material} disabled />
          </Form.Item>
          <Form.Item name="price_material" label="对应行情材料（price 模块材料名）">
            <Input placeholder="如 重废≥6mm / 304回炉边料 / 光亮铜" />
          </Form.Item>
          <Form.Item name="recovery_rate" label="回收率（0~1）" rules={[{ required: true, message: '请输入回收率' }]}>
            <InputNumber min={0} max={1} step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="unit_price_override" label="手动单价覆盖(元/吨，留空=用行情)">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  );
};

const AssetValuationPage: React.FC = () => {
  const [projectId, setProjectId] = useState<number | null>(null);
  return projectId ? (
    <ProjectWorkbench projectId={projectId} onBack={() => setProjectId(null)} />
  ) : (
    <ProjectList onOpen={setProjectId} />
  );
};

export default AssetValuationPage;
