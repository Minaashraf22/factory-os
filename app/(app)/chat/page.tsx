'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/auth-provider';
import { useI18n } from '@/lib/i18n';
import { formatRelative, getInitials, formatDateTime } from '@/lib/utils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Hash, Users, MessageSquare, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChatRoom, ChatMessage, Profile } from '@/lib/types';

export default function ChatPage() {
  const { profile } = useAuth();
  const { t } = useI18n();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load rooms
  useEffect(() => {
    async function loadRooms() {
      const { data } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('is_archived', false)
        .order('name');
      setRooms((data || []) as ChatRoom[]);
      // Auto-select first room
      if (data && data.length > 0 && !selectedRoom) {
        setSelectedRoom(data[0] as ChatRoom);
      }
      setLoading(false);
    }
    loadRooms();
  }, []);

  // Load messages when room changes
  const loadMessages = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select(`
        *,
        sender:profiles(id, full_name, role, avatar_url),
        chat_attachments(*)
      `)
      .eq('room_id', roomId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })
      .limit(100);
    setMessages((data || []) as ChatMessage[]);
  }, []);

  useEffect(() => {
    if (!selectedRoom) return;
    loadMessages(selectedRoom.id);

    // Subscribe to realtime
    const channel = supabase
      .channel(`room-${selectedRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${selectedRoom.id}`,
      }, async (payload) => {
        // Fetch full message with sender
        const { data } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(id, full_name, role, avatar_url)')
          .eq('id', payload.new.id)
          .single();
        if (data) {
          setMessages(prev => [...prev, data as ChatMessage]);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedRoom, loadMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !profile || sending) return;
    const content = newMessage.trim();
    setNewMessage('');
    setSending(true);
    try {
      const { error } = await supabase.from('chat_messages').insert({
        room_id: selectedRoom.id,
        sender_id: profile.id,
        content,
        type: 'text',
      });
      if (error) throw error;
    } catch {
      toast.error('Failed to send message');
      setNewMessage(content);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getRoomIcon = (room: ChatRoom) => {
    if (room.type === 'global') return <Globe className="w-4 h-4" />;
    if (room.type === 'direct') return <MessageSquare className="w-4 h-4" />;
    return <Hash className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="h-full flex">
        <div className="w-64 border-r border-border animate-pulse bg-card" />
        <div className="flex-1 animate-pulse bg-background" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={t('chat.title')} subtitle={t('chat.title')} />
      <div className="flex flex-1 overflow-hidden">
        {/* Room list */}
        <div className="w-64 border-r border-border bg-card flex flex-col flex-shrink-0">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('chat.channels')}</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2 px-2">
            {rooms.map(room => (
              <button
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors mb-0.5',
                  selectedRoom?.id === room.id
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <span className="flex-shrink-0">{getRoomIcon(room)}</span>
                <span className="truncate font-medium">{room.name}</span>
              </button>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <p className="text-xs text-muted-foreground">
                {profile?.full_name || 'You'}
              </p>
            </div>
          </div>
        </div>

        {/* Chat area */}
        {selectedRoom ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Room header */}
            <div className="px-5 py-3 border-b border-border bg-card/50 flex items-center gap-3">
              <div className="text-muted-foreground">{getRoomIcon(selectedRoom)}</div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">{selectedRoom.name}</h3>
                {selectedRoom.description && (
                  <p className="text-xs text-muted-foreground">{selectedRoom.description}</p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                <span>{messages.length > 0 ? `${messages.length} ${t('chat.noMessages').toLowerCase()}` : t('chat.noMessages')}</span>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
                    <MessageSquare className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">{t('chat.noMessages')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t('chat.firstMessage')}</p>
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isOwn = msg.sender_id === profile?.id;
                  const sender = msg.sender as Profile | undefined;
                  const prevMsg = messages[i - 1];
                  const showAvatar = !prevMsg || prevMsg.sender_id !== msg.sender_id;

                  return (
                    <div key={msg.id} className={cn('flex items-end gap-2.5', isOwn && 'flex-row-reverse')}>
                      {!isOwn && (
                        <div className={cn('w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-semibold flex-shrink-0', !showAvatar && 'invisible')}>
                          {getInitials(sender?.full_name || '?')}
                        </div>
                      )}
                      <div className={cn('max-w-[70%]', isOwn && 'items-end flex flex-col')}>
                        {showAvatar && !isOwn && (
                          <p className="text-[10px] text-muted-foreground mb-1 ml-1 font-medium">
                            {sender?.full_name || 'Unknown'}
                          </p>
                        )}
                        <div className={cn(
                          'px-3.5 py-2.5 rounded-2xl text-sm',
                          isOwn
                            ? 'chat-bubble-sent rounded-br-sm text-foreground'
                            : 'chat-bubble-received rounded-bl-sm text-foreground'
                        )}>
                          {msg.content}
                        </div>
                        {showAvatar && (
                          <p className={cn('text-[10px] text-muted-foreground mt-1', isOwn ? 'mr-1' : 'ml-1')}>
                            {formatRelative(msg.created_at)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="px-5 py-4 border-t border-border bg-card/30">
              <div className="flex gap-3">
                <Input
                  ref={inputRef}
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t('chat.placeholder')}
                  className="flex-1 bg-input border-border h-10"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-4"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">{t('chat.send')}</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">{t('chat.channels')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
