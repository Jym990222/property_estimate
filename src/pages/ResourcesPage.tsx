import { Tree, Typography, Card } from 'antd';

const { Title } = Typography;

// 评估专业资源导航（真实外链）
const resourceData: Record<string, Record<string, string>> = {
  '资产评估行业与准则': {
    '中国资产评估协会': 'https://www.cas.org.cn/',
    '财政部-资产评估基本准则': 'https://zcgls.mof.gov.cn/',
    '上海资产评估协会': 'https://www.shas.org.cn/',
    '中国注册会计师协会': 'https://www.cicpa.org.cn/',
  },
  '信息披露与证券市场': {
    '巨潮资讯网': 'https://www.cninfo.com.cn/',
    '上海证券交易所': 'https://www.sse.com.cn/',
    '深圳证券交易所': 'https://www.szse.cn/',
    '北京证券交易所': 'https://www.bse.cn/',
  },
  '大宗商品与金属行情': {
    '上海期货交易所': 'https://www.shfe.com.cn/',
    '上海有色网 (SMM)': 'https://www.smm.cn/',
    '长江有色金属网': 'https://www.ccmn.cn/',
    '我的钢铁网 (Mysteel)': 'https://www.mysteel.com/',
  },
  '石化行业与工程': {
    '中国石油和化学工业联合会': 'https://www.cpcif.org.cn/',
    '中国石化官网': 'https://www.sinopec.com/',
    '中国石油官网': 'https://www.cnpc.com.cn/',
    '中国化工信息中心': 'https://www.cncic.cn/',
  },
  '政策法规与监管': {
    '国务院国有资产监督管理委员会': 'http://www.sasac.gov.cn/',
    '国家发展和改革委员会': 'https://www.ndrc.gov.cn/',
    '生态环境部': 'https://www.mee.gov.cn/',
    '国家统计局': 'https://www.stats.gov.cn/',
  },
};

const ResourcesPage = () => {
  const treeData = Object.entries(resourceData).map(([title, children]) => ({
    title,
    key: title,
    children: Object.entries(children).map(([name, url]) => ({
      title: <a href={url} target="_blank" rel="noopener noreferrer">{name}</a>,
      key: name,
    })),
  }));

  return (
    <div>
      <Title level={3}>评估专业资源导航</Title>
      <Card>
        <Tree treeData={treeData} defaultExpandAll />
      </Card>
    </div>
  );
};

export default ResourcesPage;