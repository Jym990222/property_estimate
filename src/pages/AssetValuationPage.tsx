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
  Segmented,
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
  LineChartOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { ApiError } from '../api/http';
import { useAuth } from '../auth/context';
import {
  addMember,
  applyMembership,
  approveMemberApplication,
  assetImportTemplateUrl,
  createAsset,
  createProject,
  createScenario,
  deleteAsset,
  deleteProject,
  deleteScenario,
  fetchAssets,
  fetchMembers,
  fetchMyMemberships,
  fetchProjectDetail,
  fetchProjectDirectory,
  fetchProjects,
  fetchResidualMaterials,
  fetchResults,
  fetchSensitivities,
  fetchTraces,
  importAssets,
  issueProject,
  patchAsset,
  putResidualMaterial,
  rejectMemberApplication,
  removeMember,
  reviewProject,
  runCalculation,
  valuationExportUrl,
  withdrawProject,
  type AssetGeometry,
  type AssetItem,
  type DirectoryItem,
  type MyMembership,
  type ProjectDetail,
  type ProjectMember,
  type ResidualMaterial,
  type ScenarioTotals,
  type SensitivityResponse,
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

const GEOMETRY_TYPES = [
  { value: '', label: '不估重（手工填重量）' },
  { value: 'pipe', label: '管道（按 OD×壁厚×长度）' },
  { value: 'tank', label: '立式储罐（按直径×高×壁厚）' },
  { value: 'tower', label: '塔器（按直径×高×壁厚）' },
];
const GEOMETRY_DEFAULT_FACTOR: Record<string, number> = { pipe: 1.0, tank: 1.15, tower: 1.25 };

/** 与后端 estimate_weight_from_geometry 保持一致，用于表单实时预览 */
function estimateWeight(geometry: AssetGeometry | null | undefined): number | null {
  if (!geometry || !geometry.type) return null;
  const num = (value: number | null | undefined): number | null =>
    value === null || value === undefined || value === ('' as unknown) ? null : Number(value);
  const factor = geometry.factor ? Number(geometry.factor) : GEOMETRY_DEFAULT_FACTOR[geometry.type] ?? 1;
  if (geometry.type === 'pipe') {
    const od = num(geometry.od_mm);
    const wall = num(geometry.wall_mm);
    const length = num(geometry.length_m);
    if (!od || !wall || !length) return null;
    return Number(((0.0246615 * (od - wall) * wall * length * factor) / 1000).toFixed(3));
  }
  if (geometry.type === 'tank' || geometry.type === 'tower') {
    const diameter = num(geometry.diameter_m);
    const height = num(geometry.height_m);
    const wall = num(geometry.wall_mm);
    if (!diameter || !height || !wall) return null;
    const shell = Math.PI * diameter * height * (wall / 1000) * 7.85;
    let body = shell * 1.02;
    if (geometry.type === 'tank') {
      const bottom = (Math.PI / 4) * diameter ** 2 * (wall / 1000) * 7.85;
      body = shell + bottom + bottom * 1.1;
    }
    return Number((body * factor).toFixed(3));
  }
  return null;
}

/** 分组节点（装置等）的有效重量：手工优先，其次几何估重 */
const effectiveWeight = (asset: { weight_ton?: number | null; estimated_weight_ton?: number | null }): number | null =>
  asset.weight_ton ?? asset.estimated_weight_ton ?? null;

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
  const { isLoggedIn, loading: authLoading, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canCreate = user?.role === 'admin' || user?.role === 'staff';
  const viewAll = canCreate;
  const [items, setItems] = useState<ValuationProject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [directory, setDirectory] = useState<DirectoryItem[]>([]);
  const [directoryKeyword, setDirectoryKeyword] = useState('');
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [mine, setMine] = useState<MyMembership[]>([]);
  const [applyNote, setApplyNote] = useState('');
  const [applyTarget, setApplyTarget] = useState<DirectoryItem | ValuationProject | null>(null);

  const load = useCallback(async () => {
    // 等鉴权就绪再拉数据：否则首屏请求可能早于令牌注入
    if (authLoading) return;
    if (!isLoggedIn) {
      setItems([]);
      setTotal(0);
      setMine([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProjects({ status, keyword: keyword.trim() || undefined, page_size: 100 });
      setItems(data.items);
      setTotal(data.total);
      setMine(await fetchMyMemberships().catch(() => [] as MyMembership[]));
    } catch (error) {
      showApiError(error, '项目列表加载失败');
    } finally {
      setLoading(false);
    }
  }, [status, keyword, isLoggedIn, authLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchDirectory = async (value?: string) => {
    setDirectoryLoading(true);
    try {
      setDirectory(await fetchProjectDirectory(value?.trim() || undefined));
    } catch (error) {
      showApiError(error, '项目目录查询失败');
    } finally {
      setDirectoryLoading(false);
    }
  };

  const submitApply = async () => {
    if (!applyTarget) return;
    setApplyingId(applyTarget.project_id);
    try {
      await applyMembership(applyTarget.project_id, applyNote || undefined);
      void message.success('申请已提交，等待超级管理员审批');
      setApplyTarget(null);
      setApplyNote('');
      await load();
      if (directoryOpen) await searchDirectory(directoryKeyword);
    } catch (error) {
      showApiError(error, '提交申请失败');
    } finally {
      setApplyingId(null);
    }
  };

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

  const MEMBERSHIP_TAG: Record<string, { color: string; text: string }> = {
    active: { color: 'green', text: '已参与' },
    pending: { color: 'orange', text: '申请中' },
    rejected: { color: 'default', text: '已驳回' },
  };

  const columns: TableProps<ValuationProject>['columns'] = [
    { title: '项目编号', dataIndex: 'project_no', width: 140 },
    { title: '项目名称', dataIndex: 'project_name', ellipsis: true },
    { title: '基准日', dataIndex: 'base_date', width: 105 },
    { title: '取价城市', dataIndex: 'reference_city', width: 85 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 85,
      render: (value: string) => <Tag color={STATUS_TAG[value]?.color}>{STATUS_TAG[value]?.text ?? value}</Tag>,
    },
    {
      title: '我的参与',
      dataIndex: 'my_membership',
      width: 100,
      render: (value: string | null) => (value
        ? <Tag color={MEMBERSHIP_TAG[value]?.color}>{MEMBERSHIP_TAG[value]?.text ?? value}</Tag>
        : <Text type="secondary">未参与</Text>),
    },
    {
      title: '参与人数',
      dataIndex: 'member_count',
      width: 90,
      align: 'center' as const,
      render: (value: number) => value ?? 0,
    },
    {
      title: '操作',
      key: 'op',
      width: 190,
      render: (_: unknown, row) => (
        <Space size={0}>
          <Button type="link" size="small" onClick={() => onOpen(row.project_id)}>
            进入
          </Button>
          {row.my_membership !== 'active' && row.my_membership !== 'pending' && isLoggedIn && (
            <Button type="link" size="small" disabled={applyingId === row.project_id}
                    onClick={() => setApplyTarget(row)}>
              申请参与
            </Button>
          )}
          <Popconfirm
            title={`删除项目 ${row.project_no}？其资产、场景、结果与轨迹都会一并删除`}
            disabled={row.status !== 'draft' || !isAdmin}
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
            <Button type="link" size="small" danger disabled={row.status !== 'draft' || !isAdmin}>
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
          <Button
            icon={<TeamOutlined />}
            onClick={() => {
              setDirectoryOpen(true);
              void searchDirectory('');
            }}
            disabled={!isLoggedIn}
          >
            找项目 / 申请参与
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!canCreate}
            onClick={() => setCreateOpen(true)}
          >
            新建评估项目
          </Button>
        </Space>
      </Space>

      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        石化行业资产评估：按<Text strong>成本法（在用价值）</Text>与<Text strong>清算/拆解价值</Text>两种口径测算，
        资产支持手工录入与 Excel 批量导入，废金属单价自动取 <Text code>price</Text> 模块行情，
        计算过程逐步留痕（审计轨迹），项目需经<Text strong>复核 → 签发</Text>两级确认。
        <br />
        权限：<Text strong>超级管理员</Text>可查看并修改所有项目；
        <Text strong>项目相关人员</Text>可查看所有项目、只能修改自己参与的项目；
        <Text strong>一般人员</Text>只能查看与修改自己参与的项目。参与关系由管理员分配或本人申请后审批。
      </Paragraph>

      {!isLoggedIn && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="未登录：评估项目数据需要登录后按参与情况查看"
          description={
            <span style={{ fontSize: 12 }}>
              行情、价格走势、工程估算工具等公开内容无需登录。
            </span>
          }
          action={<Button size="small" href="/login">登录 / 注册</Button>}
        />
      )}

      {isLoggedIn && !viewAll && (
        <Alert
          type={mine.some((m) => m.membership_status === 'pending') ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 12 }}
          message={`当前账号（${user?.role_label}）只能查看自己参与的项目`}
          description={
            <span style={{ fontSize: 12 }}>
              你参与 {mine.filter((m) => m.membership_status === 'active').length} 个项目、
              申请中 {mine.filter((m) => m.membership_status === 'pending').length} 个。
              需要查看其他项目时，用右上角「找项目 / 申请参与」提交申请，由超级管理员审批。
            </span>
          }
        />
      )}

      {isLoggedIn && viewAll && !isAdmin && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="项目相关人员：可查看所有项目；录入资产、执行计算等修改操作仅限你参与的项目"
          description={
            <span style={{ fontSize: 12 }}>
              你参与 {mine.filter((m) => m.membership_status === 'active').length} 个项目；
              未参与的项目可点行内「申请参与」加入。
            </span>
          }
        />
      )}

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

      {/* 项目目录：任何登录用户都可查找并申请参与 */}
      <Modal
        title="项目目录（申请参与）"
        open={directoryOpen}
        onCancel={() => setDirectoryOpen(false)}
        footer={<Button onClick={() => setDirectoryOpen(false)}>关闭</Button>}
        width={880}
      >
        <Space style={{ marginBottom: 12 }}>
          <Input.Search
            placeholder="项目编号 / 名称"
            style={{ width: 280 }}
            allowClear
            value={directoryKeyword}
            onChange={(e) => setDirectoryKeyword(e.target.value)}
            onSearch={(value) => void searchDirectory(value)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            目录只显示编号/名称/基准日/状态；评估结果等数据需成为参与人员后才能查看。
          </Text>
        </Space>
        <Table<DirectoryItem>
          rowKey="project_id"
          size="small"
          loading={directoryLoading}
          dataSource={directory}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: '项目编号', dataIndex: 'project_no', width: 140 },
            { title: '项目名称', dataIndex: 'project_name', ellipsis: true },
            { title: '基准日', dataIndex: 'base_date', width: 110 },
            {
              title: '状态',
              dataIndex: 'status',
              width: 90,
              render: (value: string) => (
                <Tag color={STATUS_TAG[value]?.color}>{STATUS_TAG[value]?.text ?? value}</Tag>
              ),
            },
            {
              title: '我的参与',
              dataIndex: 'my_membership',
              width: 100,
              render: (value: string | null) => (value
                ? <Tag color={MEMBERSHIP_TAG[value]?.color}>{MEMBERSHIP_TAG[value]?.text ?? value}</Tag>
                : <Text type="secondary">未参与</Text>),
            },
            {
              title: '操作',
              key: 'op',
              width: 120,
              render: (_: unknown, row) => (row.my_membership === 'active'
                ? <Text type="secondary">已是参与人员</Text>
                : row.my_membership === 'pending'
                  ? <Tag color="orange">待审批</Tag>
                  : (
                    <Button type="link" size="small" disabled={applyingId === row.project_id}
                            onClick={() => setApplyTarget(row)}>
                      申请参与
                    </Button>
                  )),
            },
          ]}
          locale={{ emptyText: <Empty description="没有匹配的项目" /> }}
        />
      </Modal>

      <Modal
        title="申请参与项目"
        open={!!applyTarget}
        onCancel={() => setApplyTarget(null)}
        onOk={() => void submitApply()}
        confirmLoading={applyingId === applyTarget?.project_id}
      >
        {applyTarget && (
          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="项目编号">{applyTarget.project_no}</Descriptions.Item>
            <Descriptions.Item label="项目名称">{applyTarget.project_name}</Descriptions.Item>
          </Descriptions>
        )}
        <Input.TextArea
          rows={3}
          value={applyNote}
          onChange={(e) => setApplyNote(e.target.value)}
          placeholder="申请说明（选填），如：我是本项目造价人员 / 负责该装置拆除评估"
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          提交后由超级管理员审批；通过后你可查看并修改该项目。
        </Text>
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

        {/* 几何反推估重：留空重量时按规格估算吨位（清算价值的基础） */}
        <Card size="small" style={{ marginBottom: 16, background: '#fafafa' }}>
          <Space size={12} style={{ display: 'flex' }} align="start">
            <Form.Item name={['geometry', 'type']} label="几何估重" style={{ flex: 1, marginBottom: 8 }}
                       tooltip="按规格自动估算重量；手工填了「重量(吨)」时以手工值为准">
              <Select allowClear options={GEOMETRY_TYPES} placeholder="不估重" />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, next) => prev.geometry !== next.geometry}>
              {({ getFieldValue }) => {
                const geometry = (getFieldValue(['geometry']) ?? {}) as AssetGeometry;
                const kind = geometry.type;
                if (!kind) return <Text type="secondary" style={{ fontSize: 12, paddingTop: 30 }}>
                  需要按规格估重时请选择类型
                </Text>;
                return (
                  <Space size={12} wrap style={{ paddingTop: 0 }}>
                    {kind === 'pipe' ? (
                      <>
                        <Form.Item name={['geometry', 'od_mm']} label="外径 OD(mm)" style={{ marginBottom: 8 }}>
                          <InputNumber min={0} style={{ width: 130 }} />
                        </Form.Item>
                        <Form.Item name={['geometry', 'wall_mm']} label="壁厚 t(mm)" style={{ marginBottom: 8 }}>
                          <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name={['geometry', 'length_m']} label="长度 L(m)" style={{ marginBottom: 8 }}>
                          <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                      </>
                    ) : (
                      <>
                        <Form.Item name={['geometry', 'diameter_m']} label="直径 D(m)" style={{ marginBottom: 8 }}>
                          <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name={['geometry', 'height_m']} label="高度 H(m)" style={{ marginBottom: 8 }}>
                          <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name={['geometry', 'wall_mm']} label="壁厚 t(mm)" style={{ marginBottom: 8 }}>
                          <InputNumber min={0} style={{ width: 120 }} />
                        </Form.Item>
                      </>
                    )}
                    <Form.Item name={['geometry', 'factor']} label="附件/内件系数"
                               tooltip="默认：管道 1.0、储罐 1.15、塔器 1.25" style={{ marginBottom: 8 }}>
                      <InputNumber min={0} step={0.05} style={{ width: 130 }}
                                   placeholder={String(GEOMETRY_DEFAULT_FACTOR[kind] ?? 1)} />
                    </Form.Item>
                    <Form.Item label="估算重量" style={{ marginBottom: 8 }}>
                      <Text strong style={{ color: '#08979c' }}>
                        {estimateWeight(geometry) == null ? '待补全参数' : `${estimateWeight(geometry)} 吨`}
                      </Text>
                    </Form.Item>
                  </Space>
                );
              }}
            </Form.Item>
          </Space>
        </Card>
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
  const { isLoggedIn, loading: authLoading, user } = useAuth();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [memberOpen, setMemberOpen] = useState(false);
  const [memberForm] = Form.useForm();
  const [applying, setApplying] = useState(false);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [results, setResults] = useState<ValuationResult[]>([]);
  const [totals, setTotals] = useState<Record<string, ScenarioTotals>>({});
  const [traces, setTraces] = useState<ValuationTrace[]>([]);
  const [materials, setMaterials] = useState<ResidualMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioForm] = Form.useForm();
  const [reviewOpen, setReviewOpen] = useState<'review' | 'issue' | 'withdraw' | null>(null);
  const [reviewForm] = Form.useForm();
  const [resultScenarioId, setResultScenarioId] = useState<number | undefined>();
  const [resultView, setResultView] = useState<'compare' | 'single'>('compare');
  const [sensitivity, setSensitivity] = useState<SensitivityResponse | null>(null);
  const [sensitivityLoading, setSensitivityLoading] = useState(false);
  const [traceAssetId, setTraceAssetId] = useState<number | undefined>();
  const [materialEditing, setMaterialEditing] = useState<ResidualMaterial | null>(null);
  const [materialForm] = Form.useForm();

  const status = detail?.project.status ?? 'draft';
  const isDraft = status === 'draft';
  // 权限由服务端判定：canEdit=可改项目数据（管理员或本项目参与人员）；canAdmin=可做复核/签发/撤回/删除
  const canEdit = detail?.can_edit ?? false;
  const canAdmin = detail?.can_admin ?? false;
  const myMembership = detail?.my_membership ?? null;

  const load = useCallback(async () => {
    if (authLoading) return;   // 等鉴权就绪，避免首个请求不带令牌
    setLoading(true);
    try {
      const [projectDetail, assetList, resultPage, traceList, materialList, memberList] = await Promise.all([
        fetchProjectDetail(projectId),
        fetchAssets(projectId),
        fetchResults(projectId),
        fetchTraces(projectId),
        fetchResidualMaterials(),
        fetchMembers(projectId).catch(() => [] as ProjectMember[]),
      ]);
      setDetail(projectDetail);
      setAssets(assetList);
      setResults(resultPage.items);
      setTotals(resultPage.totals);
      setTraces(traceList);
      setMaterials(materialList);
      setMembers(memberList);
      setResultScenarioId((prev) => prev ?? projectDetail.scenarios[0]?.scenario_id);
    } catch (error) {
      showApiError(error, '项目数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectId, authLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const tree = useMemo(() => buildTree(assets), [assets]);
  // 资产树默认全部展开：数据是异步加载的，defaultExpandAllRows 不会重新生效，故改为受控
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  useEffect(() => {
    setExpandedKeys(assets.map((item) => item.asset_id));
  }, [assets]);

  const costScenario = detail?.scenarios.find((s) => s.method === 'cost');
  const liquidationScenario = detail?.scenarios.find((s) => s.method === 'liquidation');
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

  // 合计取后端 meta.totals（只统计根节点，父子不重复计数）
  const costTotal = costScenario ? Number(totals[String(costScenario.scenario_id)]?.value_in_use ?? 0) : 0;
  const liquidationTotal = liquidationScenario
    ? Number(totals[String(liquidationScenario.scenario_id)]?.liquidation_value ?? 0) : 0;

  /** 对比视图：把成本法与清算法的结果按资产合并成一行 */
  const compareRows = useMemo(() => {
    const byAsset = new Map<number, { cost?: ValuationResult; liquidation?: ValuationResult }>();
    results.forEach((row) => {
      const entry = byAsset.get(row.asset_id) ?? {};
      if (row.method === 'cost') entry.cost = row;
      else entry.liquidation = row;
      byAsset.set(row.asset_id, entry);
    });
    const order = new Map(assets.map((item, index) => [item.asset_id, index]));
    return Array.from(byAsset.entries())
      .map(([assetId, entry]) => ({ asset_id: assetId, ...entry }))
      .sort((a, b) => (order.get(a.asset_id) ?? 0) - (order.get(b.asset_id) ?? 0));
  }, [results, assets]);

  const loadSensitivity = useCallback(async () => {
    setSensitivityLoading(true);
    try {
      setSensitivity(await fetchSensitivities(projectId));
    } catch (error) {
      showApiError(error, '敏感性分析失败');
    } finally {
      setSensitivityLoading(false);
    }
  }, [projectId]);

  const totalValue = currentScenario?.method === 'cost' ? costTotal : liquidationTotal;

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
      } else if (reviewOpen === 'issue') {
        await issueProject(projectId, { issued_by: values.person, note: values.note });
        void message.success('已完成签发');
      } else {
        await withdrawProject(projectId, { withdrawn_by: values.person, note: values.note });
        void message.success('已撤回一步，项目可继续修改');
      }
      setReviewOpen(null);
      reviewForm.resetFields();
      await load();
    } catch (error) {
      showApiError(error, reviewOpen === 'review' ? '复核失败'
        : reviewOpen === 'issue' ? '签发失败' : '撤回失败');
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

  const submitMember = async () => {
    const values = await memberForm.validateFields();
    setBusy(true);
    try {
      await addMember(projectId, { username: String(values.username).trim(), note: values.note });
      void message.success('已分配为项目参与人员');
      setMemberOpen(false);
      memberForm.resetFields();
      await load();
    } catch (error) {
      showApiError(error, '分配参与人员失败');
    } finally {
      setBusy(false);
    }
  };

  const handleMemberAction = async (action: 'approve' | 'reject' | 'remove', row: ProjectMember) => {
    setBusy(true);
    try {
      if (action === 'approve') {
        await approveMemberApplication(row.member_id);
        void message.success(`已通过：${row.real_name ?? row.username}`);
      } else if (action === 'reject') {
        await rejectMemberApplication(row.member_id, '管理员驳回');
        void message.success('已驳回');
      } else {
        await removeMember(row.project_id, row.user_id);
        void message.success('已移除');
      }
      await load();
    } catch (error) {
      showApiError(error, action === 'approve' ? '审批失败' : action === 'reject' ? '驳回失败' : '移除失败');
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
    {
      title: '重量(吨)',
      key: 'weight',
      width: 120,
      align: 'right' as const,
      render: (_: unknown, row: AssetItem) => {
        const weight = effectiveWeight(row);
        if (weight == null) return '-';
        return row.weight_ton != null ? money(weight) : (
          <Tooltip title="按几何参数估算（未手工填重量）">
            <Text style={{ color: '#08979c' }}>{money(weight)} 估</Text>
          </Tooltip>
        );
      },
    },
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
              disabled={!isDraft || !canEdit}
              icon={<EditOutlined />}
              onClick={() => {
                setEditingAsset(row);
                setAssetFormOpen(true);
              }}
            />
          </Tooltip>
          <Popconfirm
            title="删除该资产？"
            disabled={!isDraft || !canEdit}
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
            <Button type="link" size="small" danger disabled={!isDraft || !canEdit} icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const resultColumns: TableProps<ValuationResult>['columns'] = currentScenario?.method === 'cost'
    ? [
        { title: '资产', dataIndex: 'asset_name', ellipsis: true },
        { title: '类别', dataIndex: 'category', width: 90 },
        {
          title: '重置成本(元)',
          dataIndex: 'replacement_cost',
          width: 140,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group ? <Text type="secondary">—</Text> : money(value)),
        },
        {
          title: '综合成新率',
          dataIndex: 'newness_rate',
          width: 110,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group
            ? <Tooltip title="分组节点（装置）不单独计价，取「含下级」合计"><Text type="secondary">—</Text></Tooltip>
            : <Text strong>{percent(value, 1)}</Text>),
        },
        {
          title: '在用价值(元)',
          dataIndex: 'value_in_use',
          width: 150,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group && row.children_count ? (
            <Tooltip title={`含下级 ${row.children_count} 项：本节点 ${money(value)} + 下级`}>
              <Text strong style={{ color: '#cf1322' }}>{money(row.subtree_value_in_use ?? value)}</Text>
              <Tag color="blue" style={{ marginInlineStart: 6 }}>含下级</Tag>
            </Tooltip>
          ) : (
            <Text strong style={{ color: '#cf1322' }}>{money(value)}</Text>
          )),
        },
      ]
    : [
        { title: '资产', dataIndex: 'asset_name', ellipsis: true },
        { title: '材质', dataIndex: 'material', width: 100 },
        {
          title: '重量(吨)',
          key: 'weight',
          width: 110,
          align: 'right' as const,
          render: (_: unknown, row: ValuationResult) => {
            const weight = effectiveWeight(row);
            if (weight == null) return '-';
            return row.weight_ton != null ? money(weight) : (
              <Tooltip title="按几何参数估算"><Text style={{ color: '#08979c' }}>{money(weight)} 估</Text></Tooltip>
            );
          },
        },
        {
          title: '废金属单价(元/吨)',
          dataIndex: 'scrap_unit_price',
          width: 140,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group ? <Text type="secondary">—</Text> : money(value)),
        },
        { title: '回收率', dataIndex: 'recovery_rate', width: 90, align: 'right' as const, render: (v: number) => percent(v, 1) },
        {
          title: '回收价值',
          dataIndex: 'scrap_recovery',
          width: 130,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group ? <Text type="secondary">—</Text> : money(value)),
        },
        {
          title: '取价来源',
          dataIndex: 'metal_price_snapshot',
          width: 190,
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
        {
          title: '拆除成本',
          dataIndex: 'dismantle_cost',
          width: 110,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group ? <Text type="secondary">—</Text> : money(value)),
        },
        {
          title: '清算价值(元)',
          dataIndex: 'liquidation_value',
          width: 160,
          align: 'right' as const,
          render: (value: number, row) => (row.is_group && row.children_count ? (
            <Tooltip title={`含下级 ${row.children_count} 项`}>
              <Text strong style={{ color: '#cf1322' }}>{money(row.subtree_liquidation_value ?? value)}</Text>
              <Tag color="blue" style={{ marginInlineStart: 6 }}>含下级</Tag>
            </Tooltip>
          ) : (
            <Text strong style={{ color: '#cf1322' }}>{money(value)}</Text>
          )),
        },
      ];

  /** 对比视图：同一批资产并列展示「在用价值」与「清算价值」，一眼看出差距 */
  interface CompareRow {
    asset_id: number;
    cost?: ValuationResult;
    liquidation?: ValuationResult;
  }
  const compareColumns: TableProps<CompareRow>['columns'] = [
    {
      title: '资产',
      key: 'name',
      ellipsis: true,
      render: (_: unknown, row) => row.cost?.asset_name ?? row.liquidation?.asset_name ?? '-',
    },
    {
      title: '类别',
      key: 'category',
      width: 90,
      render: (_: unknown, row) => row.cost?.category ?? row.liquidation?.category ?? '-',
    },
    {
      title: '材质',
      key: 'material',
      width: 100,
      render: (_: unknown, row) => {
        const material = row.cost?.material ?? row.liquidation?.material;
        return material ? <Tag>{material}</Tag> : '-';
      },
    },
    {
      title: '重量(吨)',
      key: 'weight',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row) => {
        const source = row.cost ?? row.liquidation;
        if (!source) return '-';
        const weight = effectiveWeight(source);
        if (weight == null) return '-';
        return source.weight_ton != null ? money(weight) : (
          <Tooltip title="按几何参数估算"><Text style={{ color: '#08979c' }}>{money(weight)} 估</Text></Tooltip>
        );
      },
    },
    {
      title: '重置成本(元)',
      key: 'replacement',
      width: 130,
      align: 'right' as const,
      render: (_: unknown, row) => (row.cost?.is_group ? <Text type="secondary">—</Text> : money(row.cost?.replacement_cost)),
    },
    {
      title: '综合成新率',
      key: 'newness',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row) => (row.cost?.is_group ? <Text type="secondary">—</Text> : percent(row.cost?.newness_rate, 1)),
    },
    {
      title: '在用价值(元)',
      key: 'in_use',
      width: 145,
      align: 'right' as const,
      render: (_: unknown, row) => {
        const cost = row.cost;
        if (!cost) return <Text type="secondary">—</Text>;
        const shown = cost.is_group && cost.children_count ? cost.subtree_value_in_use ?? cost.value_in_use : cost.value_in_use;
        return (
          <Text strong style={{ color: '#1677ff' }}>
            {money(shown)}{cost.is_group && cost.children_count ? <Tag color="blue" style={{ marginInlineStart: 6 }}>含下级</Tag> : null}
          </Text>
        );
      },
    },
    {
      title: '废金属单价(元/吨)',
      key: 'unit_price',
      width: 125,
      align: 'right' as const,
      render: (_: unknown, row) => (row.liquidation?.is_group ? <Text type="secondary">—</Text> : money(row.liquidation?.scrap_unit_price)),
    },
    {
      title: '回收率',
      key: 'recovery',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, row) => (row.liquidation?.is_group ? <Text type="secondary">—</Text> : percent(row.liquidation?.recovery_rate, 0)),
    },
    {
      title: '清算价值(元)',
      key: 'liquidation',
      width: 145,
      align: 'right' as const,
      render: (_: unknown, row) => {
        const liquidation = row.liquidation;
        if (!liquidation) return <Text type="secondary">—</Text>;
        const shown = liquidation.is_group && liquidation.children_count
          ? liquidation.subtree_liquidation_value ?? liquidation.liquidation_value
          : liquidation.liquidation_value;
        return (
          <Text strong style={{ color: '#cf1322' }}>
            {money(shown)}{liquidation.is_group && liquidation.children_count
              ? <Tag color="blue" style={{ marginInlineStart: 6 }}>含下级</Tag> : null}
          </Text>
        );
      },
    },
    {
      title: '差额(在用−清算)',
      key: 'gap',
      width: 150,
      align: 'right' as const,
      render: (_: unknown, row) => {
        const inUse = row.cost
          ? (row.cost.is_group && row.cost.children_count ? row.cost.subtree_value_in_use : row.cost.value_in_use)
          : null;
        const liquidation = row.liquidation
          ? (row.liquidation.is_group && row.liquidation.children_count
            ? row.liquidation.subtree_liquidation_value : row.liquidation.liquidation_value)
          : null;
        if (inUse == null || liquidation == null) return <Text type="secondary">—</Text>;
        const gap = Number(inUse) - Number(liquidation);
        return <Text style={{ color: gap >= 0 ? '#389e0d' : '#cf1322' }}>{money(gap)}</Text>;
      },
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
            disabled={!isDraft || !canEdit}
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
            disabled={status !== 'draft' || !canAdmin}
            onClick={() => setReviewOpen('review')}
          >
            复核
          </Button>
          <Button
            type="primary"
            ghost
            icon={<CheckCircleOutlined />}
            disabled={status !== 'reviewed' || !canAdmin}
            onClick={() => setReviewOpen('issue')}
          >
            签发
          </Button>
          <Tooltip title="已复核/已签发的项目如需修改，先撤回一步">
            <Button
              icon={<RollbackOutlined />}
              disabled={status === 'draft' || !canAdmin}
              onClick={() => setReviewOpen('withdraw')}
            >
              撤回
            </Button>
          </Tooltip>
        </Space>
      </Space>

      {!canEdit && (
        <Alert
          type={myMembership?.status === 'pending' ? 'info' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={myMembership?.status === 'pending'
            ? '参与申请待超级管理员审批'
            : '只读：你不是该项目参与人员'}
          description={
            <span style={{ fontSize: 12 }}>
              你可以查看本项目的全部内容（评估结果、审计轨迹、底稿导出）；
              录入资产、执行计算等修改操作需要成为项目参与人员。
              {myMembership?.status === 'pending'
                ? '申请已提交，审批通过后即可修改。'
                : '可点右侧按钮申请参与，由超级管理员审批。'}
            </span>
          }
          action={isLoggedIn && myMembership?.status !== 'pending' ? (
            <Button
              type="primary"
              size="small"
              loading={applying}
              onClick={() => {
                void (async () => {
                  setApplying(true);
                  try {
                    await applyMembership(projectId, '申请参与本项目');
                    void message.success('申请已提交，等待超级管理员审批');
                    await load();
                  } catch (error) {
                    showApiError(error, '提交申请失败');
                  } finally {
                    setApplying(false);
                  }
                })();
              }}
            >
              申请参与
            </Button>
          ) : undefined}
        />
      )}
      {canEdit && !canAdmin && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="你是本项目参与人员：可修改项目数据；复核、签发、撤回、删除由超级管理员执行"
          description={
            <span style={{ fontSize: 12 }}>
              当前账号：{user?.real_name}（{user?.role_label}）· 本项目参与人员
            </span>
          }
        />
      )}

      {status !== 'draft' && (
        <Alert
          type={status === 'issued' ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            status === 'issued'
              ? `已签发（${project?.issued_by ?? ''} ${project?.issued_at ?? ''}）——项目已锁定，如需修改请点右上角「撤回」`
              : `已复核（${project?.reviewed_by ?? ''} ${project?.reviewed_at ?? ''}）——如需修改请点右上角「撤回」，或直接签发`
          }
          description={project?.withdraw_note
            ? <Text type="secondary" style={{ fontSize: 12 }}>
                最近一次撤回：{project.withdrawn_by} {project.withdrawn_at}（{project.withdraw_note}）
              </Text>
            : undefined}
        />
      )}

      <Card size="small" style={{ marginBottom: 12 }}>
        <Space size={40} wrap>
          <Statistic title="资产数量" value={detail?.asset_count ?? 0} suffix="项" />
          <Statistic title="价值场景" value={detail?.scenarios.length ?? 0} suffix="个" />
          <Statistic title="评估结果" value={detail?.result_count ?? 0} suffix="条" />
          <Statistic
            title="在用价值合计（成本法）"
            value={costTotal}
            precision={2}
            suffix="元"
            valueStyle={{ color: '#1677ff' }}
          />
          <Statistic
            title="清算价值合计（拆解）"
            value={liquidationTotal}
            precision={2}
            suffix="元"
            valueStyle={{ color: '#cf1322' }}
          />
          <Statistic
            title="差额（在用 − 清算）"
            value={costTotal - liquidationTotal}
            precision={2}
            suffix="元"
            valueStyle={{ color: '#389e0d' }}
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
                    disabled={!isDraft || !canEdit}
                    onClick={() => {
                      setEditingAsset(null);
                      setAssetFormOpen(true);
                    }}
                  >
                    新增资产
                  </Button>
                  <Upload beforeUpload={handleUpload} showUploadList={false} accept=".xlsx">
                    <Button icon={<UploadOutlined />} disabled={!isDraft || !canEdit} loading={busy}>
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
                    disabled={!isDraft || !canEdit}
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
                          disabled={!isDraft || !canEdit}
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
                          <Button type="link" size="small" danger disabled={!isDraft || !canEdit}>
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
                  <Segmented
                    value={resultView}
                    onChange={(value) => setResultView(value as 'compare' | 'single')}
                    options={[
                      { value: 'compare', label: '两种口径对比' },
                      { value: 'single', label: '单场景明细' },
                    ]}
                  />
                  {resultView === 'single' && (
                    <>
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
                    </>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    在用价值合计 <Text strong style={{ color: '#1677ff' }}>{money(costTotal)}</Text> 元 ·
                    清算价值合计 <Text strong style={{ color: '#cf1322' }}>{money(liquidationTotal)}</Text> 元 ·
                    差额 <Text strong style={{ color: '#389e0d' }}>{money(costTotal - liquidationTotal)}</Text> 元
                  </Text>
                </Space>
                {resultView === 'compare' ? (
                  <Table<CompareRow>
                    rowKey="asset_id"
                    size="small"
                    loading={loading}
                    columns={compareColumns}
                    dataSource={compareRows}
                    scroll={{ x: 1330 }}
                    pagination={{ pageSize: 20, showTotal: (count) => `共 ${count} 项资产` }}
                    summary={(rows) => (rows.length > 0 ? (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={6}>
                          <Text strong>合计（含下级，不重复计数）</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <Text strong style={{ color: '#1677ff' }}>{money(costTotal)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} colSpan={2} />
                        <Table.Summary.Cell index={3} align="right">
                          <Text strong style={{ color: '#cf1322' }}>{money(liquidationTotal)}</Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <Text strong style={{ color: '#389e0d' }}>{money(costTotal - liquidationTotal)}</Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    ) : null)}
                    locale={{ emptyText: <Empty description="还没有结果：先建场景、录资产，再点「执行计算」" /> }}
                  />
                ) : (
                  <Table<ValuationResult>
                    rowKey="result_id"
                    size="small"
                    loading={loading}
                    columns={resultColumns}
                    dataSource={currentResults}
                    scroll={{ x: 1200 }}
                    pagination={{ pageSize: 20, showTotal: (count) => `共 ${count} 条` }}
                    summary={(rows) =>
                      rows.length > 0 ? (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={currentScenario?.method === 'cost' ? 4 : 9}>
                            <Text strong>合计（含下级，不重复计数）</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <Text strong style={{ color: '#cf1322' }}>{money(totalValue)}</Text>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      ) : null
                    }
                    locale={{ emptyText: <Empty description="还没有结果：先建场景、录资产，再点「执行计算」" /> }}
                  />
                )}
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
            key: 'sensitivity',
            label: '敏感性分析',
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button icon={<LineChartOutlined />} loading={sensitivityLoading}
                          onClick={() => void loadSensitivity()}>
                    {sensitivity ? '重新计算' : '生成分析'}
                  </Button>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    关键参数按 ±10%/±20% 波动时项目合计价值的变化（不写库、不影响已保存的结果）
                  </Text>
                </Space>
                {!sensitivity ? (
                  <Empty description="点「生成分析」查看关键参数波动的价值影响" />
                ) : (
                  <Space direction="vertical" size={16} style={{ display: 'flex' }}>
                    {sensitivity.items.map((item) => (
                      <Card key={item.scenario_id} size="small"
                            title={<Space>
                              <Text strong>{item.scenario_name}</Text>
                              <Tag color={METHOD_TAG[item.method]?.color}>{METHOD_TAG[item.method]?.text}</Tag>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                基准合计 {money(item.baseline)} 元
                              </Text>
                            </Space>}>
                        <Table
                          rowKey="key"
                          size="small"
                          pagination={false}
                          dataSource={item.factors}
                          columns={[
                            { title: '波动因素', dataIndex: 'name', width: 200 },
                            ...item.changes.map((change, index) => ({
                              title: change === 0 ? '基准 (0%)' : `${change > 0 ? '+' : ''}${(change * 100).toFixed(0)}%`,
                              key: `c${index}`,
                              align: 'right' as const,
                              render: (_: unknown, row: { values: number[] }) => {
                                const value = row.values[index];
                                const baseline = item.baseline;
                                const diff = baseline ? (value - baseline) / baseline : 0;
                                if (change === 0) return <Text strong>{money(value)}</Text>;
                                return (
                                  <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
                                    <Text>{money(value)}</Text>
                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                      {diff >= 0 ? '+' : ''}{(diff * 100).toFixed(1)}%
                                    </Text>
                                  </Space>
                                );
                              },
                            })),
                          ]}
                        />
                      </Card>
                    ))}
                  </Space>
                )}
              </>
            ),
          },
          {
            key: 'members',
            label: `项目成员（${members.filter((m) => m.status === 'active').length}）`,
            children: (
              <>
                <Space style={{ marginBottom: 12 }} wrap>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    disabled={!canAdmin}
                    onClick={() => setMemberOpen(true)}
                  >
                    分配参与人员
                  </Button>
                  <Tag color={canAdmin ? 'gold' : 'default'}>
                    {canAdmin ? '管理员：可增删成员并审批申请' : '仅管理员可管理成员'}
                  </Tag>
                  {members.filter((m) => m.status === 'pending').length > 0 && (
                    <Tag color="orange">
                      待审批 {members.filter((m) => m.status === 'pending').length} 个
                    </Tag>
                  )}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    参与人员可修改本项目数据；未参与的人（项目相关人员/管理员）只能查看
                  </Text>
                </Space>
                <Table<ProjectMember>
                  rowKey="member_id"
                  size="small"
                  loading={loading}
                  dataSource={members}
                  pagination={false}
                  columns={[
                    { title: '姓名', dataIndex: 'real_name', width: 110, render: (v: string | null, row) => v || row.username || '-' },
                    { title: '登录名', dataIndex: 'username', width: 130 },
                    { title: '部门', dataIndex: 'department', width: 140, render: (v: string | null) => v || '-' },
                    {
                      title: '账号角色',
                      dataIndex: 'user_role',
                      width: 120,
                      render: (v: string | null) => (v === 'admin'
                        ? <Tag color="gold">超级管理员</Tag>
                        : v === 'staff' ? <Tag color="blue">项目相关人员</Tag> : <Tag>一般人员</Tag>),
                    },
                    {
                      title: '参与状态',
                      dataIndex: 'status',
                      width: 100,
                      render: (value: string) => (
                        <Tag color={value === 'active' ? 'green' : value === 'pending' ? 'orange' : 'default'}>
                          {value === 'active' ? '已参与' : value === 'pending' ? '待审批' : '已驳回'}
                        </Tag>
                      ),
                    },
                    { title: '来源', dataIndex: 'source_label', width: 100 },
                    {
                      title: '申请说明 / 驳回原因',
                      key: 'note',
                      ellipsis: true,
                      render: (_: unknown, row) => row.applied_note || row.reject_note || '-',
                    },
                    {
                      title: '审批人',
                      dataIndex: 'approved_by',
                      width: 110,
                      render: (value: string | null) => value || '-',
                    },
                    {
                      title: '操作',
                      key: 'op',
                      width: 190,
                      render: (_: unknown, row) => (
                        <Space size={0} wrap>
                          {row.status === 'pending' && (
                            <>
                              <Button type="link" size="small" disabled={!canAdmin || busy}
                                      onClick={() => void handleMemberAction('approve', row)}>
                                通过
                              </Button>
                              <Button type="link" size="small" danger disabled={!canAdmin || busy}
                                      onClick={() => void handleMemberAction('reject', row)}>
                                驳回
                              </Button>
                            </>
                          )}
                          {row.status !== 'pending' && (
                            <Popconfirm
                              title={`移除 ${row.real_name ?? row.username}？移除后其将看不到本项目`}
                              disabled={!canAdmin || busy}
                              onConfirm={() => void handleMemberAction('remove', row)}
                            >
                              <Button type="link" size="small" danger disabled={!canAdmin || busy}>
                                移除
                              </Button>
                            </Popconfirm>
                          )}
                        </Space>
                      ),
                    },
                  ]}
                  locale={{ emptyText: <Empty description="还没有参与人员：可点「分配参与人员」添加，或等用户申请" /> }}
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
                          disabled={!canAdmin}
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
        title={reviewOpen === 'review' ? '复核评估项目'
          : reviewOpen === 'issue' ? '签发评估项目' : '撤回一步'}
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
            ? '复核后项目将被锁定，不能再增删资产或重新计算（如需修改可再撤回）'
            : reviewOpen === 'issue'
              ? '签发后项目进入最终状态，修改需先撤回一步'
              : `将把项目从「${status === 'issued' ? '已签发' : '已复核'}」退回上一步，退回后可继续修改并重新计算`}
        />
        <Form form={reviewForm} layout="vertical">
          <Form.Item name="person"
                     label={reviewOpen === 'review' ? '复核人' : reviewOpen === 'issue' ? '签发人' : '撤回人'}
                     rules={[{ required: true, message: '请填写姓名' }]}>
            <Input placeholder="姓名" />
          </Form.Item>
          <Form.Item name="note" label={reviewOpen === 'withdraw' ? '撤回理由（建议填写）' : '意见'}>
            <Input.TextArea rows={3}
                            placeholder={reviewOpen === 'withdraw'
                              ? '如 参数填错需修正' : '如 参数与取价复核无误'} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="分配参与人员"
        open={memberOpen}
        onCancel={() => setMemberOpen(false)}
        onOk={() => void submitMember()}
        confirmLoading={busy}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="被分配的人将可以查看并修改本项目"
          description={
            <span style={{ fontSize: 12 }}>
              一般人员被分配后也能看到本项目（其默认只能看自己参与的项目）。
              对方需是「正常」状态的账号；也可让本人通过「找项目 / 申请参与」提交申请后在此审批。
            </span>
          }
        />
        <Form form={memberForm} layout="vertical">
          <Form.Item name="username" label="对方登录名" rules={[{ required: true, message: '请输入登录名' }]}>
            <Input placeholder="如 zhangsan" />
          </Form.Item>
          <Form.Item name="note" label="说明">
            <Input placeholder="选填，如 本项目评估师" />
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
