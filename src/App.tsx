import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Layout, Menu, theme, Button } from 'antd';
import { useState } from 'react';
import {
  DashboardOutlined,
  ToolOutlined,
  ShopOutlined,
  FileTextOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  GlobalOutlined,
  LineChartOutlined,
  //MenuFoldOutlined,
  //MenuUnfoldOutlined,
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

const { Header, Content, Sider } = Layout;

const menuItems = [
  { key: '/map', icon: <GlobalOutlined />, label: <Link to="/map">跨区运输成本</Link> },
  { key: '/market', icon: <DashboardOutlined />, label: <Link to="/market">行情参数</Link> },
  { key: '/trend', icon: <LineChartOutlined />, label: <Link to="/trend">价格走势</Link> },
  { key: '/tools', icon: <ToolOutlined />, label: <Link to="/tools">工程估算工具</Link> },
  { key: '/plant', icon: <ShopOutlined />, label: <Link to="/plant">整套装置评估</Link> },
  { key: '/templates', icon: <FileTextOutlined />, label: <Link to="/templates">标准底稿生成</Link> },
  { key: '/resources', icon: <LinkOutlined />, label: <Link to="/resources">专业资源导航</Link> },
  { key: '/about', icon: <InfoCircleOutlined />, label: <Link to="/about">关于与帮助</Link> },
];

function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  return (
    <BrowserRouter>
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
              }}
            >
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
            defaultSelectedKeys={['/market']}
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
              //icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
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
                <Route path="/plant" element={<PlantPage />} />
                <Route path="/templates" element={<TemplatesPage />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/map" element={<MapPage />} />
              </Routes>
            </div>
          </Content>
        </Layout>

        <AiFloatingButton />
      </Layout>
    </BrowserRouter>
  );
}

export default App;