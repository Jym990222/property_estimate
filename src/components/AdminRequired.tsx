import { Alert, Button, Card, Space, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/context';

const { Title, Text } = Typography;

/**
 * 日志维护需要管理员权限（后端 /api/log/v1 全部接口都要求超级管理员）。
 * 未授权时给出明确提示与登录入口，而不是让页面报一堆 401。
 */
const AdminRequired: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuth();
  if (auth.isAdmin) return <>{children}</>;
  return (
    <Card>
      <Space direction="vertical" size={12} style={{ display: 'flex' }}>
        <Title level={4} style={{ margin: 0 }}>
          <LockOutlined /> 日志维护需要超级管理员权限
        </Title>
        <Alert
          type="warning"
          showIcon
          message={auth.isLoggedIn ? '当前账号没有日志维护权限' : '尚未登录'}
          description={
            <div style={{ fontSize: 13, lineHeight: 1.9 }}>
              <div>日志包含请求链路、错误堆栈与业务操作记录，属于敏感数据，仅超级管理员可查询与清理。</div>
              <div>
                当前状态：
                {auth.isLoggedIn
                  ? `${auth.user?.real_name}（${auth.user?.role_label}）`
                  : '未登录（未登录可查看行情、评估结果等公开内容）'}
              </div>
            </div>
          }
          action={
            <Button type="primary" href="/login">
              {auth.isLoggedIn ? '切换账号' : '登录 / 注册'}
            </Button>
          }
        />
        <Text type="secondary" style={{ fontSize: 12 }}>
          如需日志权限，请让超级管理员在「用户管理」中为你提升角色。
        </Text>
      </Space>
    </Card>
  );
};

export default AdminRequired;
