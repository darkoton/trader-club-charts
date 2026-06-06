/* TMA types — mirrors old_tma data structures */

export type MessageData = Record<string, string>;

export interface TmaLastMessage {
  type_request: string;
  data: MessageData;
  date: string;
  created_at?: string;
}

export type MessageVarsLang = {
  direction: Record<string, string>;
  direction_ready: Record<string, string>;
  result: Record<string, string>;
};

/** Response from GET /v1/message_templates */
export interface MessageTemplates {
  templates: Record<string, Record<string, string>>; // type_request → { ru, en, uk }
  vars: Record<string, MessageVarsLang>;              // lang → vars
}

export interface TmaChat {
  id: string | number;
  category?: string | null;
  type?: string | null;
  visible?: boolean;
  /** v1 API: localised titles */
  titles?: { ru?: string; en?: string; uk?: string; [key: string]: string | undefined };
  /** legacy / fallback */
  title?: string;
  photo: string | null;
  /** v1 API: structured last message; legacy: plain string */
  last_message?: TmaLastMessage | string | null;
  last_message_time?: string;
  unread_count?: number;
  notification_enabled?: boolean;
}

export interface TmaChatMessage {
  id: string | number;
  chat_id?: string | number;
  /** v1 API */
  type_request?: string;
  data?: MessageData;
  /** legacy plain text (backward compat) */
  text?: string;
  photo_path?: string;
  date: string;
  created_at?: string;
}

export interface TmaChatMessagesResponse {
  chat_id: string | number;
  messages: TmaChatMessage[];
  has_more: boolean;
}

export interface TmaRobotId {
  id: string;
  pocket_id: string;
  account_id: string;
  expiration: number;
}

export interface TmaTrade {
  order_id?: string;
  api_symbol?: string;
  full_symbol?: string;
  direction?: 'call' | 'put';
  stake_amount?: number;
  profit_amount?: number;
  percent?: number;
  created_at?: string;
  started_at?: string;
  result?: {
    order_id?: string;
    profit_amount?: number;
    profit?: number;
    next_stake?: number;
  } | null;
  amount?: number;
  account_id?: string;
}

export interface TmaVirtualSession {
  id: number;
  account_id: number;
  starting_balance: number;
  current_balance: number;
  total_profit: number;
  total_trades: number;
  successful_trades: number;
  started_at: string;
  active_trades: number;
  base_stake: number;
}

export interface TmaVirtualTradingStatus {
  success: boolean;
  data: {
    active_sessions: number;
    sessions: TmaVirtualSession[];
  };
}

export interface TmaDiaryDay {
  date: string;
  profit?: number;
  loss?: number;
  comment?: string;
}

export interface TmaDiaryInfo {
  days: TmaDiaryDay[];
  is_public?: boolean;
  user_id?: number;
}

export interface TmaDiaryStats {
  net_profit: number;
  total_profit: number;
  total_loss: number;
  positive_days: number;
  negative_days: number;
}

export type TmaRoute = 'robot' | 'chats' | 'chatView' | 'analytics' | 'calculator' | 'calendar';
