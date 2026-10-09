import { useState } from 'react';
import { Alert, Button, Card, Divider, Form, Input, Space, Tabs, Typography, message } from 'antd';
import { LockOutlined, UserAddOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/http';
import { register } from '../api/auth';
import { useAuth } from '../auth/context';

const { Title, Text, Paragraph } = Typography;

function errorText(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.detailText ? `${error.message}（${error.detailText}）` : error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

const LoginForm: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    setError(null);
    try {
      const user = await auth.login(values.username, values.password);
      void message.success(`欢迎，${user.real_name}（${user.role_label}）`);
      const redirect = searchParams.get('redirect');
      navigate(redirect && redirect.startsWith('/') ? redirect : '/assets', { replace: true });
    } catch (err) {
      setError(errorText(err, '登录失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form form={form} name="login" layout="vertical" onFinish={() => void submit()}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Form.Item name="username" label="登录名" rules={[{ required: true, message: '请输入登录名' }]}>
        <Input size="large" prefix={<UserOutlined />} placeholder="登录名" autoComplete="username" />
      </Form.Item>
      <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
        <Input.Password size="large" prefix={<LockOutlined />} placeholder="密码" autoComplete="current-password" />
      </Form.Item>
      <Button type="primary" size="large" block htmlType="submit" loading={submitting}>
        登录
      </Button>
      <Divider plain style={{ marginTop: 20 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>未注册？首次登录后系统会要求修改初始口令</Text>
      </Divider>
    </Form>
  );
};

const RegisterForm: React.FC = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    setError(null);
    try {
      const result = await register(values);
      setDone(result.username);
      form.resetFields();
    } catch (err) {
      setError(errorText(err, '注册失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Alert
        type="success"
        showIcon
        message="注册已提交，等待管理员审批"
        description={
          <div style={{ fontSize: 13, lineHeight: 1.9 }}>
            <div>登录名：<Text strong>{done}</Text></div>
            <div>管理员审批通过后即可用该账号登录；审批由超级管理员在「用户管理」中完成。</div>
          </div>
        }
      />
    );
  }

  return (
    <Form form={form} name="register" layout="vertical" onFinish={() => void submit()}>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
      <Space size={12} style={{ display: 'flex' }}>
        <Form.Item name="username" label="登录名" style={{ flex: 1 }}
                   rules={[{ required: true, message: '请输入登录名' },
                           { pattern: /^[A-Za-z0-9_.]+$/, message: '只能用字母、数字、下划线、点' }]}>
          <Input placeholder="如 zhangsan" autoComplete="off" />
        </Form.Item>
        <Form.Item name="real_name" label="姓名" style={{ flex: 1 }} rules={[{ required: true, message: '请输入姓名' }]}>
          <Input placeholder="真实姓名" />
        </Form.Item>
      </Space>
      <Form.Item name="password" label="密码"
                 rules={[{ required: true, message: '请设置密码' },
                         { min: 10, message: '至少 10 位' },
                         { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '需同时包含字母与数字' }]}>
        <Input.Password placeholder="至少 10 位，含字母与数字" autoComplete="new-password" />
      </Form.Item>
      <Space size={12} style={{ display: 'flex' }}>
        <Form.Item name="employee_no" label="工号" style={{ flex: 1 }}>
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="department" label="部门" style={{ flex: 1 }}>
          <Input placeholder="如 资产评估部" />
        </Form.Item>
        <Form.Item name="phone" label="手机" style={{ flex: 1 }}>
          <Input placeholder="选填" />
        </Form.Item>
      </Space>
      <Form.Item name="remark" label="备注">
        <Input placeholder="选填，如用途说明" />
      </Form.Item>
      <Button type="primary" size="large" block htmlType="submit" loading={submitting}>
        提交注册申请
      </Button>
      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        注册后状态为「待审批」，需超级管理员审批通过才能登录；审批前无法登录。
      </Paragraph>
    </Form>
  );
};

const LoginPage: React.FC = () => {
  const auth = useAuth();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 16px' }}>
      <Card style={{ width: 520, maxWidth: '100%' }}>
        <Space direction="vertical" size={4} style={{ marginBottom: 20 }}>
          <Title level={4} style={{ margin: 0 }}>
            {auth.isLoggedIn ? '账号' : '登录 / 注册'}
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {auth.isLoggedIn
              ? '你已登录，可直接进入资产评估；如需切换账号请先从右上角登出。'
              : '未登录可查看行情、评估结果等公开内容；新建项目、计算、复核签发、日志维护需要超级管理员登录。'}
          </Text>
        </Space>
        {auth.isLoggedIn ? (
          <Alert
            type="info"
            showIcon
            message={`当前登录：${auth.user?.real_name}（${auth.user?.role_label}）`}
            description="如需使用管理员功能，请确认该账号具备权限；缺权限请让超级管理员在「用户管理」中调整。"
          />
        ) : (
          <Tabs
            items={[
              { key: 'login', label: '登录', children: <LoginForm /> },
              {
                key: 'register',
                label: <span><UserAddOutlined /> 注册</span>,
                children: <RegisterForm />,
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
};

export default LoginPage;
