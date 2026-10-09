import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import { CheckOutlined, CloseOutlined, KeyOutlined, ReloadOutlined, UserOutlined } from '@ant-design/icons';
import { ApiError } from '../api/http';
import {
  approveUser,
  fetchLoginLogs,
  fetchUsers,
  patchUser,
  rejectUser,
  resetUserPassword,
  type AuthUser,
  type LoginLog,
  type Role,
} from '../api/auth';
import { useAuth } from '../auth/context';

const { Title, Text, Paragraph } = Typography;

const STATUS_TAG: Record<string, { color: string; text: string }> = {
  pending: { color: 'orange', text: '待审批' },
  active: { color: 'green', text: '正常' },
  disabled: { color: 'red', text: '已停用' },
  rejected: { color: 'default', text: '已驳回' },
};

function showError(error: unknown, fallback: string): void {
  if (error instanceof ApiError) {
    void message.error(error.detailText ? `${error.message}（${error.detailText}）` : error.message);
    return;
  }
  void message.error(fallback);
}

const AdminUsersPage: React.FC = () => {
  const auth = useAuth();
  const [view, setView] = useState<'pending' | 'all' | 'logs'>('pending');
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [approveTarget, setApproveTarget] = useState<AuthUser | null>(null);
  const [approveForm] = Form.useForm();
  const [rejectTarget, setRejectTarget] = useState<AuthUser | null>(null);
  const [rejectForm] = Form.useForm();
  const [credential, setCredential] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, pending] = await Promise.all([
        fetchUsers({ keyword: keyword.trim() || undefined, page_size: 200 }),
        fetchUsers({ status: 'pending', page_size: 200 }),
      ]);
      setUsers(all.items);
      setPendingCount(pending.total);
      if (view === 'logs') setLogs(await fetchLoginLogs({ page_size: 100 }));
    } catch (error) {
      showError(error, '用户数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, view]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!auth.isAdmin) {
    return (
      <Card>
        <Alert
          type="warning"
          showIcon
          message="需要超级管理员权限"
          description={
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>用户管理仅对超级管理员开放。</div>
              <div>
                当前状态：{auth.isLoggedIn
                  ? `${auth.user?.real_name}（${auth.user?.role_label}）`
                  : '未登录'}
              </div>
            </div>
          }
          action={<Button type="primary" href="/login">去登录</Button>}
        />
      </Card>
    );
  }

  const doApprove = async () => {
    if (!approveTarget) return;
    const values = await approveForm.validateFields();
    setBusy(true);
    try {
      await approveUser(approveTarget.user_id, values.role as Role, values.note);
      void message.success(`已通过：${approveTarget.real_name}`);
      setApproveTarget(null);
      approveForm.resetFields();
      await load();
    } catch (error) {
      showError(error, '审批失败');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!rejectTarget) return;
    const values = await rejectForm.validateFields();
    setBusy(true);
    try {
      await rejectUser(rejectTarget.user_id, values.note);
      void message.success(`已驳回：${rejectTarget.real_name}`);
      setRejectTarget(null);
      rejectForm.resetFields();
      await load();
    } catch (error) {
      showError(error, '驳回失败');
    } finally {
      setBusy(false);
    }
  };

  const doReset = async (row: AuthUser) => {
    setBusy(true);
    try {
      const result = await resetUserPassword(row.user_id);
      setCredential({ username: result.username, password: result.initial_password });
      await load();
    } catch (error) {
      showError(error, '重置密码失败');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (row: AuthUser, status: string) => {
    setBusy(true);
    try {
      await patchUser(row.user_id, { status });
      void message.success('已更新');
      await load();
    } catch (error) {
      showError(error, '更新失败');
    } finally {
      setBusy(false);
    }
  };

  const columns: TableProps<AuthUser>['columns'] = [
    { title: '登录名', dataIndex: 'username', width: 130 },
    { title: '姓名', dataIndex: 'real_name', width: 110 },
    {
      title: '角色',
      dataIndex: 'role_label',
      width: 130,
      render: (value: string, row) => (
        row.role === 'admin' ? <Tag color="gold">{value}</Tag> : <Tag>{value}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (value: string) => (
        <Tag color={STATUS_TAG[value]?.color}>{STATUS_TAG[value]?.text ?? value}</Tag>
      ),
    },
    { title: '部门', dataIndex: 'department', width: 140, render: (v: string | null) => v || '-' },
    { title: '工号', dataIndex: 'employee_no', width: 100, render: (v: string | null) => v || '-' },
    { title: '手机', dataIndex: 'phone', width: 130, render: (v: string | null) => v || '-' },
    {
      title: '最后登录',
      dataIndex: 'last_login_at',
      width: 170,
      render: (value: string | null, row) => (value
        ? <Tooltip title={`IP ${row.last_login_ip ?? '-'}｜累计 ${row.login_count} 次`}>
            <Text style={{ fontSize: 12 }}>{value}</Text>
          </Tooltip>
        : <Text type="secondary">从未登录</Text>),
    },
    {
      title: '操作',
      key: 'op',
      width: 260,
      render: (_: unknown, row) => (
        <Space size={0} wrap>
          {row.status === 'pending' && (
            <>
              <Button type="link" size="small" icon={<CheckOutlined />} disabled={busy}
                      onClick={() => {
                        setApproveTarget(row);
                        approveForm.setFieldsValue({ role: 'member' });
                      }}>
                通过
              </Button>
              <Button type="link" size="small" danger icon={<CloseOutlined />} disabled={busy}
                      onClick={() => setRejectTarget(row)}>
                驳回
              </Button>
            </>
          )}
          {row.status === 'active' && (
            <Button type="link" size="small" disabled={busy}
                    onClick={() => void changeStatus(row, 'disabled')}>
              停用
            </Button>
          )}
          {(row.status === 'disabled' || row.status === 'rejected') && (
            <Button type="link" size="small" disabled={busy}
                    onClick={() => void changeStatus(row, 'active')}>
              启用
            </Button>
          )}
          <Popconfirm title={`重置 ${row.real_name} 的密码？（会吊销其在线会话）`} disabled={busy}
                      onConfirm={() => void doReset(row)}>
            <Button type="link" size="small" icon={<KeyOutlined />} disabled={busy}>
              重置密码
            </Button>
          </Popconfirm>
          {row.role !== 'admin' && (
            <Popconfirm title={`将 ${row.real_name} 提升为超级管理员？（拥有全部权限）`} disabled={busy}
                        onConfirm={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await patchUser(row.user_id, { role: 'admin' });
                              void message.success('已提升为超级管理员');
                              await load();
                            } catch (error) {
                              showError(error, '更新失败');
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}>
              <Button type="link" size="small" disabled={busy}>设为管理员</Button>
            </Popconfirm>
          )}
          {row.role === 'admin' && row.user_id !== auth.user?.user_id && (
            <Popconfirm title={`将 ${row.real_name} 降为普通用户（只读）？`} disabled={busy}
                        onConfirm={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await patchUser(row.user_id, { role: 'member' });
                              void message.success('已降为普通用户');
                              await load();
                            } catch (error) {
                              showError(error, '更新失败');
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}>
              <Button type="link" size="small" disabled={busy}>取消管理员</Button>
            </Popconfirm>
          )}
          {row.user_id === auth.user?.user_id && <Text type="secondary" style={{ fontSize: 12 }}>（当前账号）</Text>}
        </Space>
      ),
    },
  ];

  const pendingUsers = users.filter((u) => u.status === 'pending');

  return (
    <>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 12 }} wrap>
        <Title level={3} style={{ margin: 0 }}>
          用户管理
        </Title>
        <Space>
          <Input.Search placeholder="登录名 / 姓名 / 工号 / 部门" style={{ width: 240 }} allowClear
                        value={keyword} onChange={(e) => setKeyword(e.target.value)}
                        onSearch={() => void load()} />
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            刷新
          </Button>
        </Space>
      </Space>

      <Paragraph type="secondary" style={{ fontSize: 13 }}>
        本期权限模型：<Text strong>超级管理员</Text> 拥有全部权限（可写、可管理用户与日志）；
        <Text strong>普通用户</Text> 仅可只读查看；<Text strong>未登录</Text> 可看公开内容。
        自助注册的账号需在此审批通过后才能登录；发放的一次性口令需用户首登修改。
      </Paragraph>

      {pendingCount > 0 && view !== 'pending' && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
               message={`有 ${pendingCount} 个注册申请待审批`} />
      )}

      <Segmented
        value={view}
        onChange={(value) => setView(value as 'pending' | 'all' | 'logs')}
        options={[
          { value: 'pending', label: `待审批（${pendingUsers.length}）` },
          { value: 'all', label: `全部用户（${users.length}）` },
          { value: 'logs', label: '登录日志' },
        ]}
        style={{ marginBottom: 12 }}
      />

      {view === 'logs' ? (
        <Table<LoginLog>
          rowKey="log_id"
          size="small"
          loading={loading}
          dataSource={logs}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 170 },
            { title: '登录名', dataIndex: 'username', width: 140 },
            {
              title: '结果',
              dataIndex: 'success',
              width: 90,
              render: (value: number | boolean) => (value
                ? <Tag color="green">成功</Tag> : <Tag color="red">失败</Tag>),
            },
            { title: '原因', dataIndex: 'reason', render: (v: string | null) => v || '-' },
            { title: 'IP', dataIndex: 'client_ip', width: 140, render: (v: string | null) => v || '-' },
          ]}
          locale={{ emptyText: <Empty description="暂无登录记录" /> }}
        />
      ) : (
        <Table<AuthUser>
          rowKey="user_id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={view === 'pending' ? pendingUsers : users}
          pagination={{ pageSize: 20, showTotal: (count) => `共 ${count} 个账号` }}
          locale={{
            emptyText: <Empty description={view === 'pending' ? '没有待审批的注册申请' : '暂无用户'} />,
          }}
        />
      )}

      <Modal title="审批通过" open={!!approveTarget} onCancel={() => setApproveTarget(null)}
             onOk={() => void doApprove()} confirmLoading={busy} width={560}>
        {approveTarget && (
          <Descriptions column={1} size="small" style={{ marginBottom: 12 }}>
            <Descriptions.Item label="登录名">{approveTarget.username}</Descriptions.Item>
            <Descriptions.Item label="姓名">{approveTarget.real_name}</Descriptions.Item>
            <Descriptions.Item label="部门">{approveTarget.department || '-'}</Descriptions.Item>
            <Descriptions.Item label="工号">{approveTarget.employee_no || '-'}</Descriptions.Item>
            <Descriptions.Item label="手机">{approveTarget.phone || '-'}</Descriptions.Item>
          </Descriptions>
        )}
        <Form form={approveForm} layout="vertical" initialValues={{ role: 'member' }}>
          <Form.Item name="role" label="分配角色" rules={[{ required: true }]}>
            <Select options={[
              { value: 'member', label: '普通用户（只读）—— 推荐，先给只读，后续再按需提权' },
              { value: 'admin', label: '超级管理员（拥有全部权限，谨慎授予）' },
            ]} />
          </Form.Item>
          <Form.Item name="note" label="审批意见">
            <Input placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="驳回注册" open={!!rejectTarget} onCancel={() => setRejectTarget(null)}
             onOk={() => void doReject()} confirmLoading={busy}>
        <Form form={rejectForm} layout="vertical">
          <Form.Item name="note" label="驳回理由">
            <Input.TextArea rows={3} placeholder="如 工号与部门不符，请核实后重新提交" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="一次性口令（请立即转交本人）" open={!!credential}
             onCancel={() => setCredential(null)} footer={<Button type="primary" onClick={() => setCredential(null)}>我已记录</Button>}>
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
               message="该口令只显示这一次，不会再从系统中查回" />
        <Descriptions column={1} size="small">
          <Descriptions.Item label="登录名">{credential?.username}</Descriptions.Item>
          <Descriptions.Item label="一次性口令">
            <Text strong copyable style={{ fontSize: 16 }}>{credential?.password}</Text>
          </Descriptions.Item>
        </Descriptions>
        <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          用户首次登录后系统会要求修改密码；未修改前无法执行写操作。
        </Paragraph>
      </Modal>

      <Card size="small" style={{ marginTop: 16 }}>
        <Space size={8}>
          <UserOutlined />
          <Text type="secondary" style={{ fontSize: 12 }}>
            当前登录：{auth.user?.real_name}（{auth.user?.role_label}）
          </Text>
        </Space>
      </Card>
    </>
  );
};

export default AdminUsersPage;
