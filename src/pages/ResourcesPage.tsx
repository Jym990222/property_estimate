import { Tree, Typography, Card } from 'antd';
import { resourceData } from '../api/mockData';

const { Title } = Typography;

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