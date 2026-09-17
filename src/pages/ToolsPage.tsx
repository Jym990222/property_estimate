import { Tabs, Card, Form, Button, Select, Typography, Row, Col, InputNumber } from 'antd';
import { useState } from 'react';
import Pipe3DView from './Pipe3DView';
import Steel3DView from './Steel3DView';
import Component3DView from './Component3DView';
const { Title, Text } = Typography;
const { Option } = Select;

/* ==================== DN 规格库（GB/T 系列，SCH40 常用壁厚） ==================== */
const DN_SPEC: Record<string, { od: number; t: number }> = {
  '15':  { od: 21.3,  t: 2.77 },
  '20':  { od: 26.9,  t: 2.87 },
  '25':  { od: 33.7,  t: 3.38 },
  '32':  { od: 42.4,  t: 3.56 },
  '40':  { od: 48.3,  t: 3.68 },
  '50':  { od: 60.3,  t: 3.91 },
  '65':  { od: 76.1,  t: 5.16 },
  '80':  { od: 88.9,  t: 5.49 },
  '100': { od: 114.3, t: 6.02 },
  '125': { od: 139.7, t: 6.55 },
  '150': { od: 168.3, t: 7.11 },
  '200': { od: 219.1, t: 8.18 },
  '250': { od: 273.0, t: 9.27 },
  '300': { od: 323.9, t: 10.31 },
  '350': { od: 355.6, t: 11.13 },
  '400': { od: 406.4, t: 12.70 },
  '450': { od: 457.0, t: 14.27 },
  '500': { od: 508.0, t: 15.09 },
};

/* ==================== 管道计算器 ==================== */
const PipeCalculator = () => {
  const [form] = Form.useForm();
  const [result, setResult] = useState<{ w: number; total: number; len: number } | null>(null);
  const [dims, setDims] = useState<{ od: number; t: number; len: number; dn: string }>({
    od: 0,
    t: 0,
    len: 6000,
    dn: '',
  });

  /* 选 DN → 自动填 OD 和壁厚 */
  const onDnChange = (value: string) => {
    const spec = DN_SPEC[value];
    if (spec) {
      form.setFieldsValue({ od: spec.od, thick: spec.t });
      setDims({
        od: spec.od,
        t: spec.t,
        len: dims.len,
        dn: value,
      });
    }
  };

  const onFinish = (values: any) => {
    const od = Number(values.od);
    const t = Number(values.thick);
    const len = Number(values.length) || 6000;

    if (od > 0 && t > 0 && t < od / 2) {
      const w = 0.0246615 * (od - t) * t;   // kg/m
      const total = w * (len / 1000);        // 按实际管长计算
      setResult({ w, total, len });
    } else {
      setResult(null);
    }
  };

  /* 表单任意字段变化时，实时驱动三维视图 */
  const onValuesChange = (_: any, all: any) => {
    setDims({
      od: Number(all.od) || 0,
      t: Number(all.thick) || 0,
      len: Number(all.length) || 6000,
      dn: all.dn || '',
    });
  };

  return (
    <Card>
      <Row gutter={24}>
        <Col span={12}>
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={onValuesChange}
          >
            <Form.Item label="公称直径 DN" name="dn">
              <Select
                placeholder="选择 DN 自动填入外径和壁厚"
                allowClear
                onChange={onDnChange}
              >
                {Object.keys(DN_SPEC).map(d => (
                  <Option key={d} value={d}>
                    DN{d} &nbsp;
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      (OD {DN_SPEC[d].od} × t {DN_SPEC[d].t})
                    </Text>
                  </Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="外径 OD (mm)"
              name="od"
              rules={[{ required: true, message: '请输入外径' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                placeholder="输入外径"
              />
            </Form.Item>

            <Form.Item
              label="壁厚 (mm)"
              name="thick"
              rules={[{ required: true, message: '请输入壁厚' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={0.1}
                placeholder="输入壁厚"
              />
            </Form.Item>

            <Form.Item label="管长 (mm)" name="length" initialValue={6000}>
              <InputNumber
                style={{ width: '100%' }}
                min={100}
                step={100}
                placeholder="输入管长"
              />
            </Form.Item>

            <Form.Item>
              <Button type="primary" htmlType="submit">
                开始计算
              </Button>
            </Form.Item>
          </Form>

          {result && (
            <Card size="small" style={{ marginTop: 12 }}>
              <Text>单位重量: {result.w.toFixed(3)} kg/m</Text>
              <br />
              <Text>
                {result.len} mm 管重: {result.total.toFixed(2)} kg
              </Text>
            </Card>
          )}
        </Col>

        <Col span={12}>
          <div style={{ height: 420 }}>
            <Pipe3DView
              od={dims.od}
              thickness={dims.t}
              length={dims.len}
              dn={dims.dn}
            />
          </div>
        </Col>
      </Row>
    </Card>
  );
};

/* ==================== 型钢计算器 ==================== */
const SteelCalculator = () => {
  const [result, setResult] = useState<string>('');
  const [steelType, setSteelType] = useState<string>('圆钢');
  const [dims, setDims] = useState<Record<string, number>>({});

  const onFinish = (values: any) => {
    const type = values.type;
    let w = 0;

    if (type === '圆钢') {
      w = 0.00617 * (values.d || 0) ** 2;
    } else if (type === '方钢') {
      w = 0.00785 * (values.a || 0) ** 2;
    } else if (type === '等边角钢') {
      const b = values.b || 0;
      const d = values.d || 0;
      w = 0.00785 * d * (2 * b - d);
    } else if (type === '槽钢') {
      const h = values.h || 0;
      const b = values.b || 0;
      const d = values.d || 0;
      w = 0.00785 * (h * d + 2 * d * (b - d));
    } else if (type === '工字钢/H型钢') {
      const h = values.h || 0;
      const b = values.b || 0;
      const d = values.d || 0;
      const t = values.t || 0;
      w = 0.00785 * (2 * b * t + (h - 2 * t) * d);
    }

    setResult(w > 0 ? `理论重量: ${w.toFixed(3)} kg/m` : '请输入有效数值');
  };

  const onValuesChange = (_: any, all: any) => {
    setSteelType(all.type || '圆钢');
    const p: Record<string, number> = {};
    if (all.d) p.d = Number(all.d);
    if (all.a) p.a = Number(all.a);
    if (all.b) p.b = Number(all.b);
    if (all.h) p.h = Number(all.h);
    if (all.t) p.t = Number(all.t);
    setDims(p);
  };

  const renderFields = () => {
    switch (steelType) {
      case '圆钢':
        return (
          <Form.Item label="直径 d (mm)" name="d">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如 20" />
          </Form.Item>
        );
      case '方钢':
        return (
          <Form.Item label="边宽 a (mm)" name="a">
            <InputNumber style={{ width: '100%' }} min={1} placeholder="如 40" />
          </Form.Item>
        );
      case '等边角钢':
        return (
          <>
            <Form.Item label="边宽 b (mm)" name="b">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="如 50" />
            </Form.Item>
            <Form.Item label="厚度 d (mm)" name="d">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="如 5" />
            </Form.Item>
          </>
        );
      case '槽钢':
        return (
          <>
            <Form.Item label="高度 h (mm)" name="h">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="如 100" />
            </Form.Item>
            <Form.Item label="腿宽 b (mm)" name="b">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="如 48" />
            </Form.Item>
            <Form.Item label="腰厚 d (mm)" name="d">
              <InputNumber style={{ width: '100%' }} min={0.1} placeholder="如 5.3" />
            </Form.Item>
          </>
        );
      case '工字钢/H型钢':
        return (
          <>
            <Form.Item label="高度 h (mm)" name="h">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="如 200" />
            </Form.Item>
            <Form.Item label="腿宽 b (mm)" name="b">
              <InputNumber style={{ width: '100%' }} min={1} placeholder="如 100" />
            </Form.Item>
            <Form.Item label="腰厚 d (mm)" name="d">
              <InputNumber style={{ width: '100%' }} min={0.1} placeholder="如 7" />
            </Form.Item>
            <Form.Item label="板厚 t (mm)" name="t">
              <InputNumber style={{ width: '100%' }} min={0.1} placeholder="如 11" />
            </Form.Item>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Card>
      <Row gutter={24}>
        <Col span={12}>
          <Form
            layout="vertical"
            onFinish={onFinish}
            onValuesChange={onValuesChange}
            initialValues={{ type: '圆钢' }}
          >
            <Form.Item label="钢材类型" name="type">
              <Select>
                <Option value="圆钢">圆钢</Option>
                <Option value="方钢">方钢</Option>
                <Option value="等边角钢">等边角钢</Option>
                <Option value="槽钢">槽钢</Option>
                <Option value="工字钢/H型钢">工字钢/H型钢</Option>
              </Select>
            </Form.Item>

            {renderFields()}

            <Form.Item>
              <Button type="primary" htmlType="submit">
                计算重量
              </Button>
            </Form.Item>
          </Form>

          {result && (
            <Card size="small" style={{ marginTop: 12 }}>
              <Text>{result}</Text>
            </Card>
          )}
        </Col>

        <Col span={12}>
          <div style={{ height: 420 }}>
            <Steel3DView type={steelType as any} params={dims} />
          </div>
        </Col>
      </Row>
    </Card>
  );
};

/* ==================== 石化指标查询 ==================== */
const PetroEstimator = () => {
  const [selected, setSelected] = useState<string>('一般工业厂房');

  const mockData: Record<string, { steel: string; concrete: string; note: string }> = {
    '一般工业厂房': {
      steel: '50~70 kg/m²',
      concrete: '0.30~0.35 m³/m²',
      note: '普通单层钢结构或排架结构，含独立基础',
    },
    '配电室/变电所': {
      steel: '60~85 kg/m²',
      concrete: '0.35~0.45 m³/m²',
      note: '多层框架结构，含电缆沟道复杂基础',
    },
    '石化-常减压装置': {
      steel: '110~140 kg/m³(砼)',
      concrete: '约 0.6~0.8 m³/t(设备重)',
      note: '设备基础密集，含管架基础，不含钢结构管廊',
    },
    '石化-催化裂化(FCC)': {
      steel: '130~160 kg/m³(砼)',
      concrete: '约 0.5~0.7 m³/t(设备重)',
      note: '反再系统框架高大，基础体积大，配筋率高',
    },
    '石化-加氢裂化装置': {
      steel: '140~170 kg/m³(砼)',
      concrete: '高压反应器基础厚重',
      note: '高压设备多，基础承载力要求高，混凝土标号通常C35以上',
    },
    '石化-乙烯裂解装置': {
      steel: '150~180 kg/m³(砼)',
      concrete: '裂解炉区基础复杂',
      note: '管线密集，包含急冷塔等大型设备基础，地脚螺栓复杂',
    },
    '石化-聚丙烯(PP)装置': {
      steel: '100~130 kg/m³(砼)',
      concrete: '约 0.4~0.6 m³/t(设备重)',
      note: '含挤压造粒厂房，通常为多层混凝土或钢结构',
    },
    '大型储罐区(球罐)': {
      steel: '80~100 kg/m³(砼)',
      concrete: '按独立基础/环墙计算',
      note: '球罐主要为钢筋混凝土环形基础，抗震要求严',
    },
  };

  const data = mockData[selected] || mockData['一般工业厂房'];

  return (
    <Card>
      <Select
        value={selected}
        onChange={setSelected}
        style={{ width: 320, marginBottom: 20 }}
      >
        {Object.keys(mockData).map(k => (
          <Option key={k} value={k}>
            {k}
          </Option>
        ))}
      </Select>
      <Card size="small">
        <p>
          <strong>钢筋含量:</strong> {data.steel}
        </p>
        <p>
          <strong>混凝土量:</strong> {data.concrete}
        </p>
        <p>
          <strong>备注:</strong> {data.note}
        </p>
      </Card>
    </Card>
  );
};

/* ==================== 主页面 ==================== */
const ToolsPage = () => {
  return (
    <div>
      <Title level={3} style={{ marginBottom: 20 }}>
        工程量与材料重量估算工具
      </Title>
      <Tabs defaultActiveKey="1" type="card">
        <Tabs.TabPane tab="管道重量计算 (DN)" key="1">
          <PipeCalculator />
        </Tabs.TabPane>
        <Tabs.TabPane tab="各类钢材理论重量" key="2">
          <SteelCalculator />
        </Tabs.TabPane>
        <Tabs.TabPane tab="石化装置土建概算指标" key="3">
          <PetroEstimator />
        </Tabs.TabPane>
        <Tabs.TabPane tab="组合查看" key="4">
          <div style={{ height: 'calc(100vh - 180px)', minHeight: 520 }}>
            <Component3DView />
          </div>
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default ToolsPage;