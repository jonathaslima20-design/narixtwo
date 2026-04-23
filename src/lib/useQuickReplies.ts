import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { useAuth } from './AuthContext';
import { MessageTemplate, TemplateMediaType } from './types';

export interface QuickReplyInput {
  title: string;
  shortcut: string;
  body: string;
  media_type: TemplateMediaType;
  file?: File | null;
  audio_duration_seconds?: number;
}

function mediaExt(file: File): string {
  const parts = file.name.split('.');
  if (parts.length > 1) return parts.pop()!.toLowerCase();
  const t = file.type.split('/')[1] || 'bin';
  return t.split(';')[0];
}

export function useQuickReplies() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('message_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setTemplates(data as MessageTemplate[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetch_();
  }, [fetch_]);

  async function uploadMedia(file: File): Promise<string> {
    if (!user) throw new Error('Não autenticado');
    const ext = mediaExt(file);
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from('quick-reply-media')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
    return path;
  }

  async function getSignedUrl(path: string): Promise<string> {
    const { data } = await supabase.storage
      .from('quick-reply-media')
      .createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? '';
  }

  const create = useCallback(
    async (input: QuickReplyInput) => {
      if (!user) return null;
      let media_url: string | null = null;
      if (input.file && (input.media_type === 'image' || input.media_type === 'audio')) {
        media_url = await uploadMedia(input.file);
      }
      const { data, error } = await supabase
        .from('message_templates')
        .insert({
          user_id: user.id,
          title: input.title.trim(),
          shortcut: input.shortcut.trim(),
          body: input.body.trim(),
          media_type: input.media_type,
          media_url,
          audio_duration_seconds:
            input.media_type === 'audio' ? input.audio_duration_seconds ?? null : null,
        })
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) setTemplates((prev) => [data as MessageTemplate, ...prev]);
      return data as MessageTemplate | null;
    },
    [user],
  );

  const update = useCallback(
    async (id: string, input: QuickReplyInput) => {
      if (!user) return null;
      const existing = templates.find((t) => t.id === id);
      let media_url = existing?.media_url ?? null;

      if (input.file && (input.media_type === 'image' || input.media_type === 'audio')) {
        if (existing?.media_url) {
          await supabase.storage.from('quick-reply-media').remove([existing.media_url]);
        }
        media_url = await uploadMedia(input.file);
      }

      if (
        existing?.media_url &&
        input.media_type !== existing.media_type &&
        (existing.media_type === 'image' || existing.media_type === 'audio')
      ) {
        await supabase.storage.from('quick-reply-media').remove([existing.media_url]);
        media_url = null;
      }

      const { data, error } = await supabase
        .from('message_templates')
        .update({
          title: input.title.trim(),
          shortcut: input.shortcut.trim(),
          body: input.body.trim(),
          media_type: input.media_type,
          media_url,
          audio_duration_seconds:
            input.media_type === 'audio' ? input.audio_duration_seconds ?? null : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) setTemplates((prev) => prev.map((t) => (t.id === id ? (data as MessageTemplate) : t)));
      return data as MessageTemplate | null;
    },
    [user, templates],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!user) return;
      const existing = templates.find((t) => t.id === id);
      if (existing?.media_url) {
        await supabase.storage.from('quick-reply-media').remove([existing.media_url]);
      }
      await supabase.from('message_templates').delete().eq('id', id).eq('user_id', user.id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    },
    [user, templates],
  );

  return { templates, loading, create, update, remove, getSignedUrl, refetch: fetch_ };
}
