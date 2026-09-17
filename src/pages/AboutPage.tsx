import { Typography, Card } from 'antd';
const { Title, Paragraph } = Typography;

const AboutPage = () => {
  return (
    <div>
      <Title level={3}>关于与帮助</Title>
      <Card>
        <Paragraph>
          <strong>中石化环境科技公司</strong><br />
          资产评估与工程量估算软件  |  Asset Valuation Pro<br />
          版本：v2.0.0<br />
          开发人员：刘建伟、冯彪
        </Paragraph>
        <Paragraph>
          <strong>使用建议：</strong><br />
          1) 行情参数：选择地区后点击刷新，可导出Excel留档；正式评估需按基准日公开行情/询价复核。<br />
          2) 工程估算：提供管道/型钢重量与石化装置概算指标的快速查询。<br />
          3) 标准底稿：支持智能Excel生成；公司标准模板库支持一键复制/归档。
        </Paragraph>
      </Card>
    </div>
  );
};

export default AboutPage;