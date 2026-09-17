// ================== 行情参数表格数据 ==================
export const marketMockRows = [
  { key: '1', cat: '废铜', name: '光亮铜 (1#)', price: 68200, formula: '基准×0.99-1000', standard: '含铜>99%', time: '2026-09-09' },
  { key: '2', cat: '废铜', name: '紫杂铜 (2#)', price: 62500, formula: '基准×0.94-2500', standard: '表面氧化', time: '2026-09-09' },
  { key: '3', cat: '废铜', name: '黄杂铜', price: 42800, formula: '基准×0.63-800', standard: '含铜60~65%', time: '2026-09-09' },
  { key: '4', cat: '废铝', name: '生铝 (Fe<3%)', price: 19200, formula: '基准×1.00', standard: '含铝>95%', time: '2026-09-09' },
  { key: '5', cat: '废铝', name: '熟铝 (合金铝)', price: 16800, formula: '基准×0.88-100', standard: '含铝>90%', time: '2026-09-09' },
  { key: '6', cat: '废钢', name: '重废 (厚度>6mm)', price: 3650, formula: '基准×1.05', standard: '炉料级', time: '2026-09-09' },
  { key: '7', cat: '废钢', name: '中废 (厚度>4mm)', price: 3450, formula: '基准×1.00-50', standard: '部分锈蚀', time: '2026-09-09' },
  { key: '8', cat: '废钢', name: '轻废 (厚度<4mm)', price: 3100, formula: '基准×0.90-120', standard: '薄板/薄管', time: '2026-09-09' },
  { key: '9', cat: '不锈钢', name: '304 工业料', price: 13800, formula: '基准×0.96+300', standard: '工业管、板材', time: '2026-09-09' },
  { key: '10', cat: '不锈钢', name: '304 新料', price: 14600, formula: '基准×1.02+200', standard: '未使用边角料', time: '2026-09-09' },
  { key: '11', cat: '不锈钢', name: '316 工业料', price: 21500, formula: '基准×1.12+500', standard: '含钼耐蚀钢', time: '2026-09-09' },
  { key: '12', cat: '废铅', name: '软铅', price: 15900, formula: '基准×1.00', standard: '含铅>99%', time: '2026-09-09' },
  { key: '13', cat: '废锌', name: '锌合金压铸料', price: 21600, formula: '基准×0.98+150', standard: '压铸件', time: '2026-09-09' },
  { key: '14', cat: '废镍', name: '纯镍板边角料', price: 132000, formula: '基准×0.99', standard: '含镍>99.5%', time: '2026-09-09' },
];

// ================== 卡片指标数据 ==================
export const marketCards = {
  cu: 68200,
  al: 19200,
  steel: 3650,
  ni: 13800,
};

// ================== 专业资源导航数据 ==================
export const resourceData = {
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

// ================== 石化装置工程数据 ==================
export const engineeringData: Record<string, { steel: string; concrete: string; note: string }> = {
  '一般工业厂房': { steel: '50~70 kg/m²', concrete: '0.30~0.35 m³/m²', note: '普通单层钢结构' },
  '配电室/变电所': { steel: '60~85 kg/m²', concrete: '0.35~0.45 m³/m²', note: '多层框架结构' },
  '仓库（普通）': { steel: '40~55 kg/m²', concrete: '0.25~0.32 m³/m²', note: '轻钢结构、大跨度' },
  '办公楼（多层）': { steel: '55~75 kg/m²', concrete: '0.38~0.48 m³/m²', note: '钢筋混凝土框架' },
  '石化-常减压装置': { steel: '110~140 kg/m³(砼)', concrete: '约 0.6~0.8 m³/t(设备重)', note: '设备基础密集' },
  '石化-催化裂化装置': { steel: '120~155 kg/m³(砼)', concrete: '约 0.7~0.9 m³/t(设备重)', note: '钢结构框架与设备基础' },
  '石化-延迟焦化装置': { steel: '105~135 kg/m³(砼)', concrete: '约 0.55~0.75 m³/t(设备重)', note: '焦炭塔基础重载' },
  '石化-加氢裂化装置': { steel: '130~165 kg/m³(砼)', concrete: '约 0.75~1.0 m³/t(设备重)', note: '高压临氢、设备重' },
  '储运-立式储罐区': { steel: '35~50 kg/m³(砼)', concrete: '约 0.3~0.45 m³/t(罐重)', note: '环墙式基础为主' },
  '储运-球罐区': { steel: '60~85 kg/m³(砼)', concrete: '约 0.5~0.7 m³/t(罐重)', note: '球罐支柱基础、密集' },
  '公用工程-循环水场': { steel: '25~40 kg/m²', concrete: '0.20~0.30 m³/m²', note: '水池结构为主' },
  '公用工程-空分装置': { steel: '85~115 kg/m²', concrete: '0.40~0.55 m³/m²', note: '冷箱基础与框架' },
};

// ================== 模板库列表 ==================
export const templateLibrary = [
  { group: '报告模板', name: '资产评估报告模板', filename: '1-1资产评估报告模板.docx' },
  { group: '报告模板', name: '资产评估说明模板', filename: '1-2资产评估说明模板.docx' },
  { group: '报告模板', name: '机器设备评估报告模板', filename: '1-3机器设备评估报告模板.docx' },
  { group: '报告模板', name: '不动产评估报告模板', filename: '1-4不动产评估报告模板.docx' },
  { group: '成本法', name: '资产评估申报表（成本法）', filename: '4-0资产评估申报表（成本法）.xls' },
  { group: '成本法', name: '机器设备评估明细表（成本法）', filename: '4-1机器设备评估明细表.xls' },
  { group: '成本法', name: '房屋建筑物评估明细表（成本法）', filename: '4-2房屋建筑物评估明细表.xls' },
  { group: '成本法', name: '在建工程评估明细表（成本法）', filename: '4-3在建工程评估明细表.xls' },
  { group: '收益法', name: '资产评估申报表（收益法）', filename: '5-0资产评估申报表（收益法）.xls' },
  { group: '收益法', name: '现金流预测表（收益法）', filename: '5-1现金流预测表.xls' },
  { group: '市场法', name: '资产评估申报表（市场法）', filename: '6-0资产评估申报表（市场法）.xls' },
  { group: '市场法', name: '可比交易案例调查表', filename: '6-1可比交易案例调查表.xlsx' },
];

// ================== 废旧金属精算清单 ==================
export const scrapMockItems = [
  {
    device: '立式储罐',
    type: '储罐',
    qty: 1,
    main: '碳钢',
    w_main: 12.5,
    sub: '不锈钢316L',
    w_sub: 1.2,
    rec_m: 0.92,
    rec_s: 0.90,
    p_main: 3650,
    p_sub: 13800,
    value: 6.78,
    trace: '储罐估重：D=3m,H=5m...',
  },
  {
    device: '卧式换热器',
    type: '换热器',
    qty: 2,
    main: '碳钢',
    w_main: 4.8,
    sub: '不锈钢304',
    w_sub: 2.6,
    rec_m: 0.90,
    rec_s: 0.88,
    p_main: 3650,
    p_sub: 13800,
    value: 4.02,
    trace: '换热器估重：直径1.2m，长度6m...',
  },
  {
    device: '离心泵',
    type: '泵',
    qty: 6,
    main: '铸钢',
    w_main: 0.85,
    sub: '不锈钢304',
    w_sub: 0.32,
    rec_m: 0.88,
    rec_s: 0.85,
    p_main: 3650,
    p_sub: 13800,
    value: 2.56,
    trace: '泵体与叶轮分材质统计',
  },
];

// ================== 城市价格偏移表 ==================
// 含义：以全国基准价为锚点，各城市相对基准的偏移量（原始点数）
// 实际项目中可从后端接口获取，这里用偏移量模拟
export const cityPriceOffset: Record<string, number> = {
  // 直辖市
  '北京': 20,
  '上海': 50,
  '天津': -10,
  '重庆': -20,

  // 华东
  '杭州': 25,
  '宁波': 22,
  '南京': 15,
  '苏州': 28,
  '无锡': 20,
  '常州': 12,
  '南通': 10,
  '徐州': -5,
  '扬州': 8,
  '镇江': 5,
  '泰州': 6,
  '连云港': -8,
  '合肥': 0,
  '芜湖': 2,
  '蚌埠': -6,
  '马鞍山': -3,
  '安庆': -10,
  '滁州': -4,
  '阜阳': -15,
  '六安': -12,
  '济南': 5,
  '青岛': 18,
  '烟台': 12,
  '潍坊': 6,
  '淄博': 4,
  '临沂': -2,
  '福州': 15,
  '厦门': 22,
  '泉州': 12,
  '南昌': 3,

  // 华南
  '广州': 30,
  '深圳': 40,
  '佛山': 25,
  '东莞': 28,
  '珠海': 22,
  '中山': 20,
  '汕头': 5,
  '湛江': -10,
  '茂名': -12,
  '江门': 8,
  '惠州': 18,
  '南宁': -5,
  '柳州': -8,
  '桂林': -6,
  '海口': 0,

  // 华中
  '武汉': -5,
  '宜昌': -12,
  '襄阳': -15,
  '长沙': 0,
  '株洲': -3,
  '岳阳': -8,
  '郑州': 2,
  '洛阳': -6,
  '南阳': -10,

  // 华北
  '石家庄': -5,
  '唐山': -8,
  '保定': -10,
  '邯郸': -12,
  '太原': -8,
  '大同': -15,
  '呼和浩特': -18,
  '包头': -20,

  // 西南
  '成都': -15,
  '绵阳': -18,
  '德阳': -16,
  '贵阳': -12,
  '昆明': -10,
  '拉萨': -25,

  // 西北
  '西安': -8,
  '宝鸡': -12,
  '咸阳': -10,
  '兰州': -15,
  '西宁': -20,
  '银川': -18,
  '乌鲁木齐': -25,

  // 东北
  '沈阳': -6,
  '大连': 5,
  '长春': -10,
  '哈尔滨': -12,

  // 港澳台
  '香港': 60,
  '澳门': 50,
  '台北': 45,
  '高雄': 35,
  '台中': 40,
};

// ================== 根据城市 + 品类获取废品价格 ==================
/**
 * 计算逻辑（方案 A：按品类基准价缩放城市偏移）
 *   1. 从 marketMockRows 取该品类的基准价（同品类第一条记录的 price）
 *   2. 城市偏移量按 (basePrice / 20000) 缩放
 *      - 高价品类（废铜 68200）缩放因子 ≈ 3.41，城市差异放大
 *      - 低价品类（废钢 3650）缩放因子 ≈ 0.18，城市差异收窄
 *   3. 返回：basePrice + 缩放后的偏移
 */
export const getCityPriceForCategory = (cityName: string, category: string): number => {
  // 1. 找该品类基准价
  const categoryRows = marketMockRows.filter(row => row.cat === category);

  // 若没有匹配品类，回退到废铜基准
  if (categoryRows.length === 0) {
    const fallbackBase = 68000;
    const rawOffset = cityPriceOffset[cityName] || 0;
    return Math.round(fallbackBase + rawOffset * (fallbackBase / 20000));
  }

  const basePrice = categoryRows[0].price;

  // 2. 按品类缩放城市偏移
  const rawOffset = cityPriceOffset[cityName] || 0;
  const scaledOffset = rawOffset * (basePrice / 20000);

  // 3. 返回最终单价（保留整数）
  return Math.round(basePrice + scaledOffset);
};

// ================== 辅助：批量获取某品类在多个城市的价格（可选） ==================
/**
 * 获取某品类在各城市的价格表，用于调试或表格展示
 */
export const getPriceMatrix = (category: string): { city: string; price: number }[] => {
  return Object.keys(cityPriceOffset).map(city => ({
    city,
    price: getCityPriceForCategory(city, category),
  }));
};