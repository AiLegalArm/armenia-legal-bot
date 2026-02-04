import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Send, Bell, ExternalLink, Copy, Check } from 'lucide-react';

interface TelegramSettingsProps {
  onClose?: () => void;
}

export const TelegramSettings = ({ onClose }: TelegramSettingsProps) => {
  const { i18n } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [chatId, setChatId] = useState('');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  const getText = (hy: string, ru: string, en: string) => {
    if (i18n.language === 'hy') return hy;
    if (i18n.language === 'ru') return ru;
    return en;
  };

  const BOT_USERNAME = '@LexAssistantBot'; // Replace with actual bot username

  useEffect(() => {
    fetchSettings();
  }, [user]);

  const fetchSettings = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('telegram_chat_id, notification_preferences')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      if (data) {
        setChatId(data.telegram_chat_id || '');
        const prefs = data.notification_preferences as { telegram?: boolean } | null;
        setNotificationsEnabled(prefs?.telegram !== false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          telegram_chat_id: chatId || null,
          notification_preferences: { telegram: notificationsEnabled },
        })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: getText('Պdelays', 'Сохранено', 'Saved'),
        description: getText(
          'Telegram կdelays',
          'Настройки Telegram сохранены',
          'Telegram settings saved'
        ),
      });
      onClose?.();
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: getText('Սխdelays', 'Ошибка', 'Error'),
        description: getText(
          'Չdelays պdelays',
          'Не удалось сохранить настройки',
          'Failed to save settings'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!chatId) {
      toast({
        title: getText('Сخطا', 'Ошибка', 'Error'),
        description: getText(
          'Նdelays Chat ID',
          'Введите Chat ID',
          'Enter Chat ID first'
        ),
        variant: 'destructive',
      });
      return;
    }

    setIsTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-telegram-notification', {
        body: {
          chatId,
          message: getText(
            '✅ Թեdelays:',
            '✅ Тестовое сообщение: Telegram уведомления работают!',
            '✅ Test message: Telegram notifications are working!'
          ),
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: getText('Հdelays', 'Успешно', 'Success'),
          description: getText(
            'Թdelays Telegram',
            'Тестовое сообщение отправлено в Telegram',
            'Test message sent to Telegram'
          ),
        });
      } else {
        throw new Error(data?.error || 'Failed to send');
      }
    } catch (error) {
      console.error('Test error:', error);
      toast({
        title: getText('Сخطა', 'Ошибка', 'Error'),
        description: getText(
          'Չdelays уведомление',
          'Не удалось отправить уведомление. Проверьте Chat ID.',
          'Failed to send notification. Check Chat ID.'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const copyBotLink = () => {
    navigator.clipboard.writeText(`https://t.me/${BOT_USERNAME.replace('@', '')}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-primary" />
          {getText('Telegram կարdelays', 'Настройки Telegram', 'Telegram Settings')}
        </CardTitle>
        <CardDescription>
          {getText(
            ' Delays:',
            'Получайте уведомления о судебных заседаниях и дедлайнах в Telegram',
            'Receive court hearing and deadline notifications via Telegram'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bot Instructions */}
        <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
          <p className="text-sm font-medium">
            {getText('Ինdelays:', 'Как подключить:', 'How to connect:')}
          </p>
          <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
            <li>
              {getText(
                'Բdelays Telegram',
                'Откройте нашего бота в Telegram:',
                'Open our bot in Telegram:'
              )}{' '}
              <Button
                variant="link"
                className="h-auto p-0 text-primary"
                onClick={() => window.open(`https://t.me/${BOT_USERNAME.replace('@', '')}`, '_blank')}
              >
                {BOT_USERNAME}
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </li>
            <li>
              {getText(
                'Ուdelays /start',
                'Отправьте команду /start',
                'Send the /start command'
              )}
            </li>
            <li>
              {getText(
                'Պdelays Chat ID',
                'Скопируйте полученный Chat ID и вставьте ниже',
                'Copy the received Chat ID and paste it below'
              )}
            </li>
          </ol>
          <Button variant="outline" size="sm" onClick={copyBotLink}>
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
            {getText('Պdelays', 'Копировать ссылку', 'Copy bot link')}
          </Button>
        </div>

        {/* Chat ID Input */}
        <div className="space-y-2">
          <Label htmlFor="chat-id">Chat ID</Label>
          <div className="flex gap-2">
            <Input
              id="chat-id"
              placeholder={getText('Օrինdelays 123456789', 'Например: 123456789', 'e.g. 123456789')}
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
            <Button variant="outline" onClick={handleTest} disabled={isTesting || !chatId}>
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {getText(
              'Chat ID delays: /start',
              'Chat ID можно получить, написав боту /start',
              'Get Chat ID by sending /start to the bot'
            )}
          </p>
        </div>

        {/* Notifications Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              {getText('Ծանdelays', 'Уведомления', 'Notifications')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {getText(
                ' Delays: delays',
                'Получать уведомления о предстоящих событиях',
                'Receive notifications about upcoming events'
              )}
            </p>
          </div>
          <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
        </div>

        {/* Save Button */}
        <div className="flex justify-end gap-2">
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              {getText('Չեdelays', 'Отмена', 'Cancel')}
            </Button>
          )}
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {getText('Պdelays', 'Сохранить', 'Save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
