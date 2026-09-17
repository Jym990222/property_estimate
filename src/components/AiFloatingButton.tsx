import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Spin, message, Tooltip, Badge, Empty } from 'antd';
import {
  MessageOutlined,
  CloseOutlined,
  SendOutlined,
  RobotOutlined,
  UserOutlined,
  DeleteOutlined,
  MinusOutlined,
  CopyOutlined,
  CheckOutlined,
  ArrowLeftOutlined,
  PlusOutlined,
  HistoryOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Draggable from 'react-draggable';
import { askDeepSeek, ChatMessage } from '../api/deepseek';
import { SYSTEM_PROMPT } from '../api/projectKnowledge';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

interface Session {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

const SESSIONS_KEY = 'ai_sessions_v1';
const CURRENT_KEY = 'ai_current_session_v1';

const loadSessions = (): Session[] => {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch { /* empty */ }
  return [];
};

const saveSessions = (sessions: Session[]) => {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch { /* empty */ }
};

const loadCurrentId = (): string | null => {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
};

const saveCurrentId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch { /* empty */ }
};

const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
};

const AiFloatingButton: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'home' | 'chat'>('home');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [hasNewReply, setHasNewReply] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<any>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSessions(loadSessions());
    setCurrentSessionId(loadCurrentId());
  }, []);

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  useEffect(() => {
    saveCurrentId(currentSessionId);
  }, [currentSessionId]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [sessions, currentSessionId, view, open]);

  useEffect(() => {
    if (open && view === 'chat') {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [open, view, currentSessionId]);

  const currentSession = sessions.find(s => s.id === currentSessionId) || null;
  const messages = currentSession?.messages ?? [];

  const createSession = useCallback((firstMessage?: string): string => {
    const id = genId();
    const title = firstMessage
      ? firstMessage.length > 20
        ? firstMessage.slice(0, 20) + '...'
        : firstMessage
      : '新对话';
    const newSession: Session = {
      id,
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(id);
    return id;
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const question = (text ?? input).trim();
      if (!question || loading) return;
      setInput('');

      let sessionId = currentSessionId;
      let historyForApi: ChatMessage[] = [];

      if (!sessionId) {
        sessionId = createSession(question);
        historyForApi = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: question },
        ];
      } else {
        const session = sessions.find(s => s.id === sessionId);
        const prevMessages = session?.messages ?? [];
        historyForApi = [
          { role: 'system', content: SYSTEM_PROMPT },
          ...prevMessages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: question },
        ];
      }

      const addMessage = (msg: Message) => {
        setSessions(prev =>
          prev.map(s =>
            s.id === sessionId
              ? { ...s, messages: [...s.messages, msg], updatedAt: Date.now() }
              : s,
          ),
        );
      };

      addMessage({ role: 'user', content: question, timestamp: Date.now() });
      addMessage({ role: 'assistant', content: '', timestamp: Date.now() });

      setLoading(true);

      try {
        await askDeepSeek(historyForApi, chunk => {
          setSessions(prev =>
            prev.map(s => {
              if (s.id !== sessionId) return s;
              const msgs = [...s.messages];
              const last = msgs[msgs.length - 1];
              if (last && last.role === 'assistant') {
                msgs[msgs.length - 1] = { ...last, content: last.content + chunk };
              }
              return { ...s, messages: msgs, updatedAt: Date.now() };
            }),
          );
        });

        if (!open) {
          setHasNewReply(true);
        }
      } catch (err: any) {
        message.error(err?.message || 'AI 服务暂不可用');
        setSessions(prev =>
          prev.map(s => {
            if (s.id !== sessionId) return s;
            const msgs = [...s.messages];
            if (msgs[msgs.length - 1]?.role === 'assistant' && !msgs[msgs.length - 1].content) {
              msgs.pop();
            }
            return { ...s, messages: msgs };
          }),
        );
      } finally {
        setLoading(false);
      }
    },
    [input, loading, currentSessionId, sessions, createSession, open],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearCurrent = () => {
    if (!currentSessionId) return;
    setSessions(prev =>
      prev.map(s =>
        s.id === currentSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s,
      ),
    );
    message.success('当前对话已清空');
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions(prev => prev.filter(s => s.id !== id));
    if (currentSessionId === id) {
      setCurrentSessionId(null);
      setView('home');
    }
    message.success('已删除');
  };

  const newChat = () => {
    setCurrentSessionId(null);
    setView('chat');
  };

  const openSession = (id: string) => {
    setCurrentSessionId(id);
    setView('chat');
  };

  const goBack = () => {
    if (view === 'chat') {
      setView('home');
      setCurrentSessionId(null);
    } else {
      setOpen(false);
    }
  };

  const copyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(idx);
      message.success('已复制');
      setTimeout(() => setCopiedIndex(null), 1500);
    });
  };

  const quickQuestions = ['软件有哪些功能？', '成新率怎么算？', '如何生成评估模板？'];

  const windowStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute',
        right: 0,
        bottom: 75,
        width: '100vw',
        height: 'calc(100vh - 75px)',
        borderRadius: '12px 12px 0 0',
        background: '#fff',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }
    : {
        position: 'absolute',
        right: 0,
        bottom: 75,
        width: 460,
        height: 400,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      };

  return (
    <>
      <Draggable bounds="body" nodeRef={dragRef} handle=".ai-drag-handle">
        <div
          ref={dragRef}
          style={{
            position: 'fixed',
            right: 30,
            bottom: 30,
            zIndex: 1000,
          }}
        >
          {/* ============ 弹窗 ============ */}
          <div
            className={`ai-window ${open ? 'ai-open' : 'ai-closed'}`}
            style={{
              ...windowStyle,
              opacity: open ? 1 : 0,
              transform: open ? 'scale(1) translateY(0)' : 'scale(0.85) translateY(20px)',
              transformOrigin: 'bottom right',
              pointerEvents: open ? 'auto' : 'none',
              transition: 'opacity 0.25s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* 头部 */}
            <div
              style={{
                background: 'linear-gradient(135deg, #1890ff, #52c41a)',
                color: '#fff',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {view === 'chat' ? (
                  <Tooltip title="返回">
                    <button
                      onClick={goBack}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        color: '#fff',
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ArrowLeftOutlined style={{ fontSize: 14 }} />
                    </button>
                  </Tooltip>
                ) : (
                  <RobotOutlined style={{ fontSize: 20 }} />
                )}
                <div>
                  <div style={{ fontSize: 15, fontWeight: 'bold' }}>
                    {view === 'chat' ? currentSession?.title || '新对话' : '项目智能助手'}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>基于 DeepSeek 驱动</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {view === 'chat' && (
                  <Tooltip title="清空当前对话">
                    <button
                      onClick={clearCurrent}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        color: '#fff',
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <DeleteOutlined style={{ fontSize: 14 }} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip title="收起">
                  <button
                    onClick={() => setOpen(false)}
                    style={{
                      background: 'rgba(255,255,255,0.2)',
                      border: 'none',
                      color: '#fff',
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <MinusOutlined style={{ fontSize: 14 }} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* 主内容区 */}
            {view === 'home' ? (
              <HomeView
                sessions={sessions}
                onNewChat={newChat}
                onOpenSession={openSession}
                onDeleteSession={deleteSession}
                onQuickQuestion={q => {
                  newChat();
                  setTimeout(() => sendMessage(q), 100);
                }}
                quickQuestions={quickQuestions}
              />
            ) : (
              <ChatView
                messages={messages}
                loading={loading}
                input={input}
                setInput={setInput}
                onSend={sendMessage}
                onKeyDown={handleKeyDown}
                listRef={listRef}
                inputRef={inputRef}
                copiedIndex={copiedIndex}
                onCopy={copyMessage}
                isMobile={isMobile}
              />
            )}
          </div>

          {/* ============ 悬浮按钮 ============ */}
          <div
            className="ai-drag-handle"
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              cursor: 'move',
            }}
          >
            <Tooltip title={open ? '' : 'AI 助手'} placement="left">
              <Badge dot={hasNewReply && !open}>
                <button
                  onClick={() => {
                    setOpen(!open);
                    if (!open) {
                      setView(currentSessionId ? 'chat' : 'home');
                      setHasNewReply(false);
                    }
                  }}
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: '50%',
                    border: 'none',
                    background: 'linear-gradient(135deg, #1890ff, #52c41a)',
                    color: '#fff',
                    fontSize: 26,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(24,144,255,0.4)',
                    transition: 'all 0.3s',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    outline: 'none',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(24,144,255,0.6)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(24,144,255,0.4)';
                  }}
                >
                  {open ? <CloseOutlined /> : <MessageOutlined />}
                </button>
              </Badge>
            </Tooltip>
          </div>
        </div>
      </Draggable>

      {/* 全局样式 */}
      <style>{`
        .ai-markdown p { margin: 0 0 8px 0; }
        .ai-markdown p:last-child { margin-bottom: 0; }
        .ai-markdown ul, .ai-markdown ol { margin: 6px 0; padding-left: 20px; }
        .ai-markdown li { margin: 2px 0; }
        .ai-markdown code {
          background: #f0f0f0; padding: 2px 6px; border-radius: 4px;
          font-size: 13px; font-family: Consolas, Monaco, monospace; color: #c7254e;
        }
        .ai-markdown pre {
          background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 8px;
          overflow-x: auto; margin: 8px 0; font-size: 13px;
        }
        .ai-markdown pre code { background: transparent; color: inherit; padding: 0; }
        .ai-markdown blockquote {
          border-left: 3px solid #1890ff; padding-left: 12px; margin: 8px 0; color: #666;
        }
        .ai-markdown h1, .ai-markdown h2, .ai-markdown h3, .ai-markdown h4 {
          margin: 12px 0 8px 0; font-weight: bold;
        }
        .ai-markdown h1 { font-size: 18px; }
        .ai-markdown h2 { font-size: 16px; }
        .ai-markdown h3 { font-size: 15px; }
        .ai-markdown h4 { font-size: 14px; }
        .ai-markdown table { border-collapse: collapse; margin: 8px 0; font-size: 13px; }
        .ai-markdown th, .ai-markdown td { border: 1px solid #e0e0e0; padding: 6px 10px; text-align: left; }
        .ai-markdown th { background: #f0f0f0; font-weight: bold; }
        .ai-markdown a { color: #1890ff; text-decoration: none; }
        .ai-markdown a:hover { text-decoration: underline; }
        div::-webkit-scrollbar { width: 6px; height: 6px; }
        div::-webkit-scrollbar-thumb { background: #d0d0d0; border-radius: 3px; }
        div::-webkit-scrollbar-thumb:hover { background: #b0b0b0; }
        div::-webkit-scrollbar-track { background: transparent; }

        .ai-session-item { transition: all 0.2s; }
        .ai-session-item:hover { background: #f0f7ff !important; border-color: #91caff !important; }
        .ai-session-item .ai-delete-btn { opacity: 0; transition: opacity 0.2s; }
        .ai-session-item:hover .ai-delete-btn { opacity: 1; }
      `}</style>
    </>
  );
};

// ============ 子组件：HomeView ============
interface HomeViewProps {
  sessions: Session[];
  onNewChat: () => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string, e: React.MouseEvent) => void;
  onQuickQuestion: (q: string) => void;
  quickQuestions: string[];
}

const HomeView: React.FC<HomeViewProps> = ({
  sessions,
  onNewChat,
  onOpenSession,
  onDeleteSession,
  onQuickQuestion,
  quickQuestions,
}) => {
  return (
    <div style={{ flex: 1, overflowY: 'auto', background: '#f7f8fa', padding: '20px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #1890ff, #52c41a)',
            color: '#fff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 12,
          }}
        >
          <RobotOutlined style={{ fontSize: 32 }} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 'bold', color: '#333' }}>
          你好！我是项目智能助手 👋
        </div>
        <div style={{ fontSize: 13, color: '#999', marginTop: 6 }}>
          可以问我关于软件功能、评估方法、操作步骤等问题
        </div>
      </div>

      <button
        onClick={onNewChat}
        style={{
          width: '100%',
          padding: '12px 16px',
          background: 'linear-gradient(135deg, #1890ff, #40a9ff)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 20,
          boxShadow: '0 4px 12px rgba(24,144,255,0.3)',
          transition: 'all 0.2s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(24,144,255,0.4)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(24,144,255,0.3)';
        }}
      >
        <PlusOutlined /> 开始新对话
      </button>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 'bold' }}>
          <CommentOutlined style={{ marginRight: 4 }} />
          常见问题
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {quickQuestions.map((q, i) => (
            <div
              key={i}
              onClick={() => onQuickQuestion(q)}
              style={{
                padding: '6px 12px',
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: 16,
                fontSize: 12,
                color: '#1890ff',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#e6f7ff';
                e.currentTarget.style.borderColor = '#1890ff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.borderColor = '#e0e0e0';
              }}
            >
              {q}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 8, fontWeight: 'bold' }}>
          <HistoryOutlined style={{ marginRight: 4 }} />
          历史对话（{sessions.length}）
        </div>
        {sessions.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无历史对话"
            style={{ marginTop: 20 }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map(session => (
                <div
                  key={session.id}
                  className="ai-session-item"
                  onClick={() => onOpenSession(session.id)}
                  style={{
                    background: '#fff',
                    border: '1px solid #e8e8e8',
                    borderRadius: 10,
                    padding: '10px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    position: 'relative',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#333',
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {session.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#999',
                        marginTop: 2,
                        display: 'flex',
                        gap: 8,
                      }}
                    >
                      <span>{formatTime(session.updatedAt)}</span>
                      <span>· {session.messages.length} 条</span>
                    </div>
                  </div>
                  <Tooltip title="删除">
                    <button
                      className="ai-delete-btn"
                      onClick={e => onDeleteSession(session.id, e)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#ff4d4f',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 4,
                        marginLeft: 8,
                      }}
                    >
                      <DeleteOutlined style={{ fontSize: 14 }} />
                    </button>
                  </Tooltip>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ 子组件：ChatView ============
interface ChatViewProps {
  messages: Message[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  onSend: (text?: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  listRef: React.RefObject<HTMLDivElement>;
  inputRef: React.RefObject<any>;
  copiedIndex: number | null;
  onCopy: (content: string, idx: number) => void;
  isMobile: boolean;
}

const ChatView: React.FC<ChatViewProps> = ({
  messages,
  loading,
  input,
  setInput,
  onSend,
  onKeyDown,
  listRef,
  inputRef,
  copiedIndex,
  onCopy,
  isMobile,
}) => {
  return (
    <>
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          background: '#f7f8fa',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#999',
              marginTop: isMobile ? 60 : 100,
              padding: '0 20px',
            }}
          >
            <RobotOutlined
              style={{ fontSize: 48, color: '#1890ff', marginBottom: 12 }}
            />
            <div style={{ fontSize: 15, color: '#333', marginBottom: 8 }}>
              开始你的问题
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              输入问题后按 Enter 发送
              <br />
              例如：「成新率怎么计算？」
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 12,
            }}
          >
            {msg.role === 'assistant' && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1890ff, #52c41a)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 8,
                  flexShrink: 0,
                }}
              >
                <RobotOutlined style={{ fontSize: 16 }} />
              </div>
            )}
            <div
              style={{
                position: 'relative',
                background: msg.role === 'user' ? '#1890ff' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                padding: '10px 14px',
                borderRadius:
                  msg.role === 'user'
                    ? '12px 12px 2px 12px'
                    : '12px 12px 12px 2px',
                maxWidth: '78%',
                lineHeight: 1.6,
                fontSize: 14,
                wordBreak: 'break-word',
                boxShadow:
                  msg.role === 'assistant'
                    ? '0 1px 4px rgba(0,0,0,0.06)'
                    : 'none',
              }}
            >
              {msg.role === 'user' ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              ) : (
                <div className="ai-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}

              {loading &&
                msg.role === 'assistant' &&
                idx === messages.length - 1 &&
                !msg.content && <Spin size="small" />}

              {msg.role === 'assistant' && msg.content && (
                <Tooltip title={copiedIndex === idx ? '已复制' : '复制'}>
                  <button
                    onClick={() => onCopy(msg.content, idx)}
                    style={{
                      position: 'absolute',
                      bottom: -22,
                      left: 4,
                      background: 'transparent',
                      border: 'none',
                      color: '#999',
                      fontSize: 12,
                      cursor: 'pointer',
                      padding: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {copiedIndex === idx ? (
                      <CheckOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CopyOutlined />
                    )}
                  </button>
                </Tooltip>
              )}
            </div>
            {msg.role === 'user' && (
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: '#52c41a',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 8,
                  flexShrink: 0,
                }}
              >
                <UserOutlined style={{ fontSize: 16 }} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div
        style={{
          padding: 12,
          borderTop: '1px solid #e8e8e8',
          background: '#fff',
          flexShrink: 0,
        }}
      >
        <Input.TextArea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={loading}
          style={{ marginBottom: 8, borderRadius: 8 }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 11, color: '#999' }}>
            {loading ? 'AI 正在思考...' : 'AI 生成内容仅供参考'}
          </span>
          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => onSend()}
            loading={loading}
            disabled={!input.trim()}
            size="small"
            style={{ borderRadius: 6 }}
          >
            发送
          </Button>
        </div>
      </div>
    </>
  );
};

export default AiFloatingButton;