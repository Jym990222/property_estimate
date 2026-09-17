import {Tabs, Card, Typography, Form, Input, Button, Table, Space,  Select, Row, Col} from 'antd';
import { scrapMockItems } from '../api/mockData';

const { Title, Text } = Typography;
const { Option } = Select;

const PlantPage = () => {
  return (
    <div>
      <Title level={3}>整套石油化工装置评估（IVS/WAVO/中国准则融合）</Title>
      <Text type="secondary">建议流程：界区(ISBL/OSBL)→功能单元分解→成本法→清算/处置场景切换→废旧金属测算</Text>
      <Tabs defaultActiveKey="1" type="card" style={{ marginTop: 20 }}>
        <Tabs.TabPane tab="准则框架与评估思路" key="1">
          <Card>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
              一、准则框架（用于模型设计的合规边界）
              1）IVS 300（Plant and Equipment）：...
              2）WAVO：强调胜任能力、职业道德与透明度...
              3）中国资产评估执业准则（机器设备等）：...
            </pre>
          </Card>
        </Tabs.TabPane>
        <Tabs.TabPane tab="成本法：重置成本 & 成新率" key="2">
          <CostNewnessTab />
        </Tabs.TabPane>
        <Tabs.TabPane tab="清算/拆解：废旧金属精算" key="3">
          <ScrapTab />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

// 成本法/成新率组件（模拟）
const CostNewnessTab = () => {
  return (
    <Row gutter={24}>
      <Col span={12}>
        <Card title="A. 全额重置成本（成本法）" style={{ marginBottom: 16 }}>
          <Form layout="vertical">
            <Form.Item label="购置费合计(元)"><Input placeholder="0" /></Form.Item>
            <Form.Item label="运杂费率"><Input placeholder="0.05" /></Form.Item>
            <Form.Item label="安装费率"><Input placeholder="0.25" /></Form.Item>
            <Form.Item label="基础费率"><Input placeholder="0.08" /></Form.Item>
            <Button type="primary">计算重置成本</Button>
          </Form>
          <Card size="small" style={{ marginTop: 16 }}><Text strong>全额重置成本：2,345.67 万元</Text></Card>
        </Card>
      </Col>
      <Col span={12}>
        <Card title="B. 成新率（加权法）" style={{ marginBottom: 16 }}>
          <Form layout="vertical">
            <Form.Item label="已使用年限"><Input placeholder="5" /></Form.Item>
            <Form.Item label="经济寿命(年)"><Input placeholder="15" /></Form.Item>
            <Form.Item label="勘察评分(0-100)"><Input placeholder="80" /></Form.Item>
            <Button type="primary">计算成新率</Button>
          </Form>
          <Card size="small" style={{ marginTop: 16 }}><Text strong>综合成新率：75.2%</Text></Card>
        </Card>
        <Card title="C. 价值场景切换">
          <Form layout="vertical">
            <Form.Item label="价值场景">
              <Select defaultValue="在用价值（持续经营）">
                <Option value="在用价值（持续经营）">在用价值（持续经营）</Option>
                <Option value="有序清算价值">有序清算价值</Option>
              </Select>
            </Form.Item>
            <Button type="primary">生成价值结论</Button>
          </Form>
        </Card>
      </Col>
    </Row>
  );
};

// 废旧金属精算组件（含表格）
const ScrapTab = () => {
  const columns = [
    { title: '设备/构件', dataIndex: 'device' },
    { title: '类型', dataIndex: 'type' },
    { title: '主材', dataIndex: 'main' },
    { title: '主材重(t)', dataIndex: 'w_main' },
    { title: '辅材', dataIndex: 'sub' },
    { title: '辅材重(t)', dataIndex: 'w_sub' },
    { title: '价值(万元)', dataIndex: 'value' },
  ];
  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary">计算并加入清单</Button>
        <Button>删除选中</Button>
        <Button>清空清单</Button>
        <Button>导出Excel</Button>
      </Space>
      <Table columns={columns} dataSource={scrapMockItems} rowKey="device" pagination={false} />
      <Card style={{ marginTop: 16 }}>
        <Text strong>汇总：估算回收重量 13.7 t，预计回收价值 6.78 万元</Text>
      </Card>
    </div>
  );
};

export default PlantPage;