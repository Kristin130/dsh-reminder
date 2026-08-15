/**
 * Browser copy dictionaries for the dsh-reminder settings section.
 * @module dsh-reminder/client/locales
 */

export type PeonKey =
  | 'nav'
  | 'title'
  | 'description'
  | 'notice'
  | 'unavailable'
  | 'sounds'
  | 'active'
  | 'paused'
  | 'soundPack'
  | 'noPacks'
  | 'volume'
  | 'install'
  | 'installing'
  | 'preview'
  | 'notifications'
  | 'toolErrorBeep'
  | 'silentWindow'
  | 'relayMode'
  | 'enabled'
  | 'disabled'
  | 'category'
  | 'cat.session.start'
  | 'cat.task.acknowledge'
  | 'cat.task.complete'
  | 'cat.task.error'
  | 'cat.input.required'
  | 'cat.resource.limit'
  | 'cat.user.spam'

export const zh: Record<PeonKey, string> = {
  nav: 'peon-ping 声音',
  title: 'peon-ping 声音通知',
  description: '任务完成或意外终止时播放音效，并显示桌面通知。音效包与 pi 的 peon-ping 共用同一目录。',
  notice: '通知',
  unavailable: '无法获取配置（该命名空间未对网页客户端开放）',
  sounds: '声音',
  active: '响铃中',
  paused: '已暂停',
  soundPack: '音效包',
  noPacks: '（未安装，点击“安装默认音效包”）',
  volume: '音量',
  install: '安装默认音效包',
  installing: '正在安装…',
  preview: '试听',
  notifications: '桌面通知',
  toolErrorBeep: '工具出错响铃',
  silentWindow: '静默窗口（秒）',
  relayMode: '中继模式',
  enabled: '开',
  disabled: '关',
  category: '分类',
  'cat.session.start': '会话开始',
  'cat.task.acknowledge': '任务应答',
  'cat.task.complete': '任务完成',
  'cat.task.error': '任务出错',
  'cat.input.required': '等待输入',
  'cat.resource.limit': '上下文压缩',
  'cat.user.spam': '快速提问',
}

export const en: Record<PeonKey, string> = {
  nav: 'peon-ping sounds',
  title: 'peon-ping sound notifications',
  description: 'Plays sounds when a task completes or terminates unexpectedly, and shows desktop notifications. Sound packs are shared with the pi peon-ping.',
  notice: 'Notice',
  unavailable: 'settings unavailable (the namespace is not exposed to the web client)',
  sounds: 'Sounds',
  active: 'active',
  paused: 'paused',
  soundPack: 'Sound pack',
  noPacks: ' (none installed — click “Install default packs”)',
  volume: 'Volume',
  install: 'Install default packs',
  installing: 'Installing…',
  preview: 'Preview',
  notifications: 'Desktop notifications',
  toolErrorBeep: 'Tool error beep',
  silentWindow: 'Silent window (s)',
  relayMode: 'Relay mode',
  enabled: 'on',
  disabled: 'off',
  category: 'Category',
  'cat.session.start': 'Session start',
  'cat.task.acknowledge': 'Task acknowledge',
  'cat.task.complete': 'Task complete',
  'cat.task.error': 'Task error',
  'cat.input.required': 'Input required',
  'cat.resource.limit': 'Resource limit',
  'cat.user.spam': 'Rapid prompt spam',
}
