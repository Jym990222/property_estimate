import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { Layout, Menu, theme, Button, Dropdown, Space, Tag, Modal, Form, Input, Alert, message } from 'antd';
import { useEffect, useState } from 'react';
import {
  DashboardOutlined,
  ToolOutlined,
  ShopOutlined,
  FileTextOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  GlobalOutlined,
  LineChartOutlined,
  ProfileOutlined,
  PropertySafetyOutlined,
  UserOutlined,
  TeamOutlined,
  LogoutOutlined,
  LoginOutlined,
  KeyOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';

import MarketPage from './pages/MarketPage';
import ToolsPage from './pages/ToolsPage';
import PlantPage from './pages/PlantPage';
import TemplatesPage from './pages/TemplatesPage';
import ResourcesPage from './pages/ResourcesPage';
import AboutPage from './pages/AboutPage';
import MapPage from './pages/MapPage';
import AiFloatingButton from './components/AiFloatingButton';
import PriceTrendPage from './pages/PriceTrendPage';
import LogsPage from './pages/LogsPage';
import AssetValuationPage from './pages/AssetValuationPage';
import LoginPage from './pages/LoginPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminRequired from './components/AdminRequired';
import { AuthProvider } from './auth/AuthContext';
import { useAuth } from './auth/context';
import { changeOwnPassword } from './api/auth';
import { ApiError } from './api/http';

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: '/map', icon: <GlobalOutlined />, label: <Link to="/map">跨区运输成本</Link> },
  { key: '/market', icon: <DashboardOutlined />, label: <Link to="/market">行情参数</Link> },
  { key: '/trend', icon: <LineChartOutlined />, label: <Link to="/trend">价格走势</Link> },
  { key: '/tools', icon: <ToolOutlined />, label: <Link to="/tools">工程估算工具</Link> },
  { key: '/assets', icon: <PropertySafetyOutlined />, label: <Link to="/assets">资产评估</Link> },
  { key: '/plant', icon: <ShopOutlined />, label: <Link to="/plant">整套装置评估</Link> },
  { key: '/templates', icon: <FileTextOutlined />, label: <Link to="/templates">标准底稿生成</Link> },
  { key: '/resources', icon: <LinkOutlined />, label: <Link to="/resources">专业资源导航</Link> },
  { key: '/logs', icon: <ProfileOutlined />, label: <Link to="/logs">日志维护</Link> },
  { key: '/about', icon: <InfoCircleOutlined />, label: <Link to="/about">关于与帮助</Link> },
];

const MENU_KEYS = menuItems.map((item) => item.key);

/** 顶栏用户区：未登录显示登录入口；已登录显示账号菜单（改密 / 用户管理 / 登出） */
const UserMenu: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdForm] = Form.useForm();
  const [busy, setBusy] = useState(false);

  // 首次登录（或刚被重置口令）强制修改密码
  useEffect(() => {
    if (auth.mustChangePassword) setPwdOpen(true);
  }, [auth.mustChangePassword]);

  const submitPassword = async () => {
    const values = await pwdForm.validateFields();
    setBusy(true);
    try {
      await changeOwnPassword(values.old_password, values.new_password);
      void message.success('密码已修改，请用新密码重新登录');
      setPwdOpen(false);
      pwdForm.resetFields();
      await auth.logout();
      navigate('/login', { replace: true });
    } catch (error) {
      const text = error instanceof ApiError
        ? (error.detailText ? `${error.message}（${error.detailText}）` : error.message)
        : '修改密码失败';
      void message.error(text);
    } finally {
      setBusy(false);
    }
  };

  const passwordModal = (
    <Modal
      title="修改密码"
      open={pwdOpen}
      onCancel={() => {
        if (auth.mustChangePassword) {
          void message.warning('首次登录必须先修改密码才能执行写操作');
          return;
        }
        setPwdOpen(false);
      }}
      onOk={() => void submitPassword()}
      confirmLoading={busy}
      maskClosable={!auth.mustChangePassword}
      closable={!auth.mustChangePassword}
      okText="确认修改"
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={auth.mustChangePassword
          ? '你正在使用一次性口令，请先设置自己的密码（至少 10 位，含字母与数字）'
          : '修改后当前登录会失效，需要用新密码重新登录'}
      />
      <Form form={pwdForm} layout="vertical">
        <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
          <Input.Password placeholder="当前密码 / 一次性口令" autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="new_password" label="新密码"
                   rules={[{ required: true, message: '请输入新密码' },
                           { min: 10, message: '至少 10 位' },
                           { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '需同时包含字母与数字' }]}>
          <Input.Password placeholder="至少 10 位，含字母与数字" autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );

  if (!auth.isLoggedIn) {
    return (
      <Space size={8}>
        <Button size="small" icon={<LoginOutlined />} onClick={() => navigate('/login')}>
          登录 / 注册
        </Button>
        {passwordModal}
      </Space>
    );
  }

  const items = [
    {
      key: 'who',
      disabled: true,
      label: (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{auth.user?.real_name}</span>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>
            {auth.user?.username} · {auth.user?.role_label}
          </span>
        </Space>
      ),
    },
    { type: 'divider' as const },
    { key: 'password', icon: <KeyOutlined />, label: '修改密码' },
    ...(auth.isAdmin ? [{ key: 'users', icon: <TeamOutlined />, label: '用户管理' }] : []),
    { type: 'divider' as const },
    { key: 'logout', icon: <LogoutOutlined />, label: '登出' },
  ];

  return (
    <Space size={8}>
      <Dropdown
        menu={{
          items,
          onClick: ({ key }) => {
            if (key === 'password') setPwdOpen(true);
            if (key === 'users') navigate('/admin/users');
            if (key === 'logout') {
              void (async () => {
                await auth.logout();
                void message.success('已登出');
                navigate('/', { replace: true });
              })();
            }
          },
        }}
      >
        <Button size="small" icon={<UserOutlined />}>
          {auth.user?.real_name}
          <Tag color={auth.isAdmin ? 'gold' : 'default'} style={{ marginInlineStart: 6, marginInlineEnd: 0 }}>
            {auth.isAdmin ? '管理员' : '只读'}
          </Tag>
        </Button>
      </Dropdown>
      {passwordModal}
    </Space>
  );
};

/** 布局（放在 BrowserRouter 内部，才能用 useLocation 让菜单高亮跟随当前路由） */
function AppLayout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  // 菜单高亮跟随 URL：此前用 defaultSelectedKeys 硬编码 /market，
  // 刷新后无论当前在哪一页都会高亮"行情参数"
  const activeKey = location.pathname === '/' ? '/market' : location.pathname;
  const selectedKeys = MENU_KEYS.includes(activeKey) ? [activeKey] : [];

  return (
    <>
      <style>{`
        .app-sider .ant-layout-sider-children {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .app-sider .ant-menu {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }
        .app-sider .ant-menu-item {
          flex: 1;
          height: auto !important;
          line-height: 1.2 !important;
          display: flex;
          align-items: center;
          width: auto !important;
          margin: 3px 8px !important;
          border-radius: 8px;
        }
        /* 内容区滚动条样式 */
        .app-content-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .app-content-scroll::-webkit-scrollbar-thumb {
          background: #CBD5E1;
          border-radius: 4px;
        }
        /* ========== 移动端：侧边栏改为浮层覆盖，不占用布局宽度 ========== */
        @media (max-width: 991.98px) {
          .app-sider.ant-layout-sider {
            position: fixed !important;
            left: 0;
            top: 0;
            bottom: 0;
            height: 100vh;
            z-index: 1001;
          }
          /* 移动端展开时不需要 antd 自带的零宽触发器 */
          .app-sider .ant-layout-sider-zero-width-trigger {
            display: none !important;
          }
        }
      `}</style>

      {/* 移动端展开侧边栏时的遮罩层 */}
      {isMobile && !collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 1000,
            animation: 'fadeIn .2s ease',
          }}
        />
      )}

      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        {/* ===== 侧边栏 ===== */}
        <Sider
          breakpoint="lg"
          collapsedWidth={0}
          collapsed={collapsed}
          width={220}
          className="app-sider"
          onBreakpoint={(broken) => {
            setIsMobile(broken);
            setCollapsed(broken);
          }}
          onCollapse={(value) => setCollapsed(value)}
          style={{
            background: '#0F172A',
            height: '100vh',
            overflow: 'hidden',
          }}
        >
          {/* 顶部 Logo */}
          <div
            style={{
              padding: '20px 16px 10px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '100%',
                background: '#fff',
                borderRadius: 12,
                padding: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                overflow: 'hidden',
                aspectRatio: '1 / 1',
              }}
            >
              {/*  暂用纯白占位，后期把下面这行删掉，取消上面的 img 注释 */}
              <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: 6 }} />

              {/*
              <img
                src="/icon/logo-square.png"
                alt="中国石化"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  borderRadius: 6,
                  objectFit: 'contain',
                }}
              />
              */}
            </div>
            <div
              style={{
                color: 'white',
                fontSize: 13,
                fontWeight: 'bold',
                letterSpacing: 1,
                textAlign: 'center',
              }}
            >
              资产评估 Pro
            </div>
          </div>

          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={selectedKeys}
            items={menuItems}
            style={{ background: '#0F172A', borderRight: 'none' }}
            onClick={() => {
              // 移动端点击菜单后自动收起侧边栏
              if (isMobile) setCollapsed(true);
            }}
          />
        </Sider>

        {/* ===== 右侧 ===== */}
        <Layout
          style={{
            height: '100vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Header
            style={{
              flexShrink: 0,
              padding: '0 16px',
              background: colorBgContainer,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            }}
          >
            {/* 汉堡按钮：始终可见，用于切换侧边栏 */}
            <Button
              type="text"
              aria-label={collapsed ? '展开菜单' : '收起菜单'}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((v) => !v)}
              style={{
                fontSize: 18,
                width: 40,
                height: 40,
                color: '#1E293B',
                flexShrink: 0,
              }}
            />

            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: '#1E293B',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              公司名占位
            </div>

            <div
              style={{
                width: 1,
                height: 28,
                background: '#E2E8F0',
                flexShrink: 0,
              }}
            />

            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: '#1E293B',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              资产评估与工程量估算软件
            </div>

            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <UserMenu />
            </div>
          </Header>

          <Content
            className="app-content-scroll"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              margin: '24px 16px 0',
              paddingBottom: 24,
            }}
          >
            <div
              style={{
                padding: 24,
                minHeight: 360,
                background: colorBgContainer,
                borderRadius: borderRadiusLG,
              }}
            >
              <Routes>
                <Route path="/" element={<MarketPage />} />
                <Route path="/market" element={<MarketPage />} />
                <Route path="/trend" element={<PriceTrendPage />} />
                <Route path="/tools" element={<ToolsPage />} />
                <Route path="/assets" element={<AssetValuationPage />} />
                <Route path="/plant" element={<PlantPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/logs" element={<AdminRequired><LogsPage /></AdminRequired>} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
              </Routes>
            </div>
          </Content>
        </Layout>

        <AiFloatingButton />
      </Layout>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppLayout />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;