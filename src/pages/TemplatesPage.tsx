import {Tabs, Card, Radio, Button, Table, Space, Typography, Tag} from 'antd';
import { templateLibrary } from '../api/mockData';

const { Text } = Typography;
const { Title } = Typography;

const TemplatesPage = () => {
  return (
    <div>
      <Title level={3}>标准底稿与模板中心</Title>
      <Tabs defaultActiveKey="1" type="card">
        <Tabs.TabPane tab="智能Excel生成" key="1">
          <Card>
            <Radio.Group defaultValue="机器设备评估明细表" style={{ display: 'block', marginBottom: 20 }}>
              <Radio value="机器设备评估明细表">机器设备评估明细表</Radio>
              <Radio value="车辆评估明细表">车辆评估明细表</Radio>
              <Radio value="废旧物资清查明细表">废旧物资清查明细表</Radio>
            </Radio.Group>
            <Button type="primary">生成带公式的智能Excel</Button>
            <Card size="small" style={{ marginTop: 16 }}>
              <Text type="secondary">功能说明：自动植入Excel计算公式、冻结表头、预设列宽/示例数据、增加基础数据校验</Text>
            </Card>
          </Card>
        </Tabs.TabPane>
        <Tabs.TabPane tab="公司标准模板库" key="2">
          <Card>
            <Space style={{ marginBottom: 16 }}>
              <Button>选择目录</Button>
              <Button>刷新检测</Button>
              <Button>打开目录</Button>
            </Space>
            <Table
              columns={[
                { title: '分类', dataIndex: 'group' },
                { title: '文件名', dataIndex: 'filename' },
                { title: '状态', dataIndex: 'status', render: (v) => <Tag color={v === '已找到' ? 'green' : 'orange'}>{v}</Tag> },
              ]}
              dataSource={templateLibrary.map((item, idx) => ({ ...item, key: idx, status: '已找到' }))}
              pagination={false}
            />
          </Card>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default TemplatesPage;